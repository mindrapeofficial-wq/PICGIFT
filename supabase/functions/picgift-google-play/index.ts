import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.57.4";
import { validatePlayPurchase, isHalloweenPurchase } from "../_shared/play-purchase.mjs";
const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const h={"Access-Control-Allow-Origin":"https://picgift.onrender.com","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const output=(a:unknown,s=200)=>new Response(JSON.stringify(a),{status:s,headers:h});
function enc(s:Uint8Array){return btoa(String.fromCharCode(...s)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
async function googleToken(serviceAccount:any){
 const privateKey=String(serviceAccount.private_key||"").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g,"");
 const raw=Uint8Array.from(atob(privateKey),c=>c.charCodeAt(0));
 const k=await crypto.subtle.importKey("pkcs8",raw,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const now=Math.floor(Date.now()/1000);
 const head=enc(new TextEncoder().encode(JSON.stringify({alg:"RS256",typ:"JWT"})));
 const body=enc(new TextEncoder().encode(JSON.stringify({iss:serviceAccount.client_email,scope:"https://www.googleapis.com/auth/androidpublisher",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600})));
 const data=head+"."+body;const signed=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",k,new TextEncoder().encode(data));
 const assertion=data+"."+enc(new Uint8Array(signed));
 const params=new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion});
 const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:params,signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error("OAuth de Google Play no configurado");const t=await r.json();return t.access_token as string;
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:h});
 if(req.method!=="POST")return output({error:"Método no admitido"},405);
 const jwt=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
 const {data:auth,error:authError}=await db.auth.getUser(jwt);
 if(authError||!auth.user)return output({error:"Sesión no válida"},401);
 if(Deno.env.get("PICGIFT_GOOGLE_PLAY_ENABLED")!=="true")return output({error:"Compras de Google Play desactivadas"},503);
 const promoActive=Date.now()>=Date.parse("2026-10-07T22:00:00Z")&&Date.now()<Date.parse("2026-10-31T23:00:00Z");
 if(promoActive&&Deno.env.get("PICGIFT_GOOGLE_PLAY_PROMO_READY")!=="true")return output({error:"Precios promocionales de Google Play pendientes de comprobar"},503);
 const config=Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"),packageName=Deno.env.get("GOOGLE_PLAY_PACKAGE_NAME");
 if(!config||packageName!=="com.picgift.myapp")return output({error:"Google Play aún no está configurado"},503);
 let body:any;try{body=await req.json()}catch{return output({error:"Solicitud incorrecta"},400)}
 const productId=String(body.product_id||""), token=String(body.purchase_token||"");
 if(!/^[a-z0-9_-]{3,35}$/.test(productId)||token.length<10||token.length>2000)return output({error:"Compra inválida"},400);
 const {data:product}=await db.from("picgift_products").select("*").eq("id",productId).eq("enabled",true).maybeSingle();
 if(!product)return output({error:"Paquete no disponible"},400);
 const {data:existing}=await db.from("picgift_orders").select("id,user_id,status,play_consumed_at").eq("provider","google_play").eq("provider_checkout_id",token).maybeSingle();
 if(existing&&existing.user_id!==auth.user.id)return output({error:"Compra vinculada a otra cuenta"},403);
 if(existing?.status==="paid"&&existing.play_consumed_at)return output({success:true,order_id:existing.id});
 try{
  const account=JSON.parse(config);const access=await googleToken(account);
  const verifyUrl="https://androidpublisher.googleapis.com/androidpublisher/v3/applications/"+encodeURIComponent(packageName)+"/purchases/productsv2/tokens/"+encodeURIComponent(token);
  const r=await fetch(verifyUrl,{headers:{Authorization:"Bearer "+access},signal:AbortSignal.timeout(20000)});
  if(!r.ok)return output({error:"Google Play todavía no ha validado el recibo"},422);
  const purchase=await r.json();
  const receiptError=validatePlayPurchase(purchase,product.google_play_product_id);
  if(receiptError)return output({error:receiptError},422);
  const accountHash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(auth.user.id));
  const accountObfuscated=Array.from(new Uint8Array(accountHash)).map(x=>x.toString(16).padStart(2,"0")).join("");
  if(purchase.obfuscatedExternalAccountId!==accountObfuscated)return output({error:"La compra no pertenece a esta cuenta"},403);
  const purchasedDuringPromotion=isHalloweenPurchase(purchase.purchaseCompletionTime);
  let order=existing;
  if(!order){const {data:inserted,error:insertErr}=await db.from("picgift_orders").insert({user_id:auth.user.id,product_id:product.id,provider:"google_play",provider_checkout_id:token,amount_cents:purchasedDuringPromotion&&["magico","familiar"].includes(product.id)?Math.round(product.price_cents*0.8):product.price_cents,currency:"eur",status:"pending"}).select("id").single();
  if(insertErr&&insertErr.code!=="23505")return output({error:"No se pudo registrar el pedido"},500);
  order=inserted;
  if(!order){const {data:retried}=await db.from("picgift_orders").select("id,user_id,status,play_consumed_at").eq("provider","google_play").eq("provider_checkout_id",token).maybeSingle();order=retried;}
  }
  if(!order||order.user_id&&order.user_id!==auth.user.id)return output({error:"No se pudo recuperar el pedido"},409);
  const {data:granted,error:grantError}=await db.rpc("picgift_grant_order",{p_order:order.id,p_provider_ref:String(purchase.orderId||token)});
  if(grantError||!granted)return output({error:"Compra pendiente de acreditación"},500);
  // Consumable products must be consumed server-side, and then they can be repurchased.
  const consumeUrl="https://androidpublisher.googleapis.com/androidpublisher/v3/applications/"+encodeURIComponent(packageName)+"/purchases/products/"+encodeURIComponent(product.google_play_product_id)+"/tokens/"+encodeURIComponent(token)+":consume";
  const alreadyConsumed=purchase.productLineItem[0]?.productOfferDetails?.consumptionState==="CONSUMPTION_STATE_CONSUMED";
  const consumed=alreadyConsumed?null:await fetch(consumeUrl,{method:"POST",headers:{Authorization:"Bearer "+access,"Content-Type":"application/json"},body:"{}",signal:AbortSignal.timeout(20000)});
  if(alreadyConsumed||consumed?.ok){await db.from("picgift_orders").update({play_consumed_at:new Date().toISOString()}).eq("id",order.id);}
  else console.error("PICGIFT_PLAY_CONSUME_NEEDS_RETRY",order.id,consumed?.status);
  return output({success:true,order_id:order.id});
 }catch(e){console.error("PICGIFT_PLAY_VERIFY_ERROR",e instanceof Error?e.name:"unknown");return output({error:"No pudimos verificar la compra en este momento."},503)}
});
