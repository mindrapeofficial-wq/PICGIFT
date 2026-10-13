import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.4";
const URL=Deno.env.get("SUPABASE_URL")||"";
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const H={"Access-Control-Allow-Origin":"https://picgift.onrender.com","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Content-Type":"application/json","Cache-Control":"no-store"};
function out(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:H})}
const promoStart=Date.parse("2026-10-07T22:00:00Z");
const promoEnd=Date.parse("2026-10-31T23:00:00Z");
const promoEligible=new Set(["magico","familiar"]);
const promotionActive=()=>Date.now()>=promoStart&&Date.now()<promoEnd;
function chargedPrice(product:{id:string,price_cents:number}) {
 return promotionActive()&&promoEligible.has(product.id)?Math.round(product.price_cents*0.8):product.price_cents;
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:H});
 if(req.method!=="POST")return out({error:"Método incorrecto"},405);
 if(!URL||!KEY)return out({error:"Servicio en configuración"},503);
 const bearer=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
 const {data:auth,error:authErr}=await db.auth.getUser(bearer);
 if(authErr||!auth.user)return out({error:"Inicia sesión para comprar"},401);
 let input:any;try{input=await req.json()}catch{return out({error:"Solicitud incorrecta"},400)}
 if(input.action==="status"){
   const ready=Deno.env.get("PICGIFT_SALES_ENABLED")==="true" && !!Deno.env.get("STRIPE_SECRET_KEY");
   const {data:products,error:productsError}=await db.from("picgift_products").select("id,name,price_cents,photo_credits,currency,enabled").eq("enabled",true);
   if(productsError)return out({error:"No se pudo consultar el catálogo de paquetes"},503);
   const {data:ledger,error:ledgerError}=await db.from("picgift_credit_ledger").select("delta").eq("user_id",auth.user.id);
   if(ledgerError)return out({error:"No se pudo consultar el saldo de créditos"},503);
   return out({
 checkout_available:ready,
 // Play store prices need their own update before any discounted purchase is accepted.
 google_play_available:Deno.env.get("PICGIFT_GOOGLE_PLAY_ENABLED")==="true" && (!promotionActive() || Deno.env.get("PICGIFT_GOOGLE_PLAY_PROMO_READY")==="true") && !!Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON") && Deno.env.get("GOOGLE_PLAY_PACKAGE_NAME")==="com.picgift.myapp",
 promotion:{active:promotionActive(),percent:20,expires_at:"2026-10-31T23:00:00Z",time_zone:"Europe/Madrid",product_ids:["magico","familiar"]},
 credits:(ledger||[]).reduce((sum:any,x:any)=>sum+x.delta,0),
 products:(products||[]).map((p:any)=>({...p,original_price_cents:p.price_cents,price_cents:chargedPrice(p)}))
 });
 }
 if(input.action!=="checkout")return out({error:"Acción no admitida"},400);
 if(Deno.env.get("PICGIFT_SALES_ENABLED")!=="true")return out({error:"Las compras estarán disponibles cuando activemos el motor y los cobros."},503);
 const stripeKey=Deno.env.get("STRIPE_SECRET_KEY");
 if(!stripeKey)return out({error:"Stripe está pendiente de configuración"},503);
 const productId=String(input.product_id||"");
 const {data:product}=await db.from("picgift_products").select("*").eq("id",productId).eq("enabled",true).maybeSingle();
 if(!product)return out({error:"Paquete no disponible"},400);
 const promoApplied=promotionActive()&&promoEligible.has(product.id);
 const amount=chargedPrice(product);
 const {data:order,error:orderErr}=await db.from("picgift_orders").insert({user_id:auth.user.id,product_id:product.id,provider:"stripe",amount_cents:amount,currency:product.currency,status:"pending"}).select("id").single();
 if(orderErr||!order)return out({error:"No se pudo preparar el pedido"},500);
 const params=new URLSearchParams();
 params.set("mode","payment");
 if(promoApplied){
  // Promo uses dynamic Stripe Checkout price_data instead of the outdated regular price ID.
  // PICGIFT_SALES_ENABLED remains false; this path is unreachable until explicitly enabled.
  params.set("line_items[0][price_data][currency]",product.currency||"eur");
  params.set("line_items[0][price_data][unit_amount]",String(amount));
  params.set("line_items[0][price_data][product_data][name]",product.name+" · Halloween −20%");
  params.set("line_items[0][price_data][product_data][description]","PICGIFT Halloween 2026 · "+product.photo_credits+" fotografías");
 }else{
  if(!product.stripe_price_id)return out({error:"Paquete pendiente de configuración en Stripe"},503);
  params.set("line_items[0][price]",product.stripe_price_id);
 }
 params.set("line_items[0][quantity]","1");
 params.set("success_url","https://picgift.onrender.com/#precios");
 params.set("cancel_url","https://picgift.onrender.com/#precios");
 params.set("client_reference_id",order.id);
 params.set("metadata[order_id]",order.id);
 params.set("metadata[product_id]",product.id);
 params.set("metadata[user_id]",auth.user.id);
 params.set("payment_method_types[0]","card");
 params.set("locale","es");
 params.set("customer_email",auth.user.email||"");
 const res=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{"Authorization":"Bearer "+stripeKey,"Content-Type":"application/x-www-form-urlencoded","Idempotency-Key":"picgift_checkout_"+order.id},body:params.toString()});
 if(!res.ok){console.error("STRIPE_CHECKOUT",res.status);await db.from("picgift_orders").update({status:"failed"}).eq("id",order.id);return out({error:"No pudimos abrir el pago. Inténtalo de nuevo."},502)}
 const session=await res.json();
 if(!session.url||!session.id)return out({error:"Stripe no devolvió enlace de pago"},502);
 await db.from("picgift_orders").update({provider_checkout_id:session.id}).eq("id",order.id);
 return out({url:session.url,order_id:order.id});
});

