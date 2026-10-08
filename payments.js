import {createClient} from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from "./config.js";
const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
let available=false,initialized=false;
let nativeUser=null;
const nativeInFlight=new Set();
const PRODUCT_IDS=new Set(["esencial","magico","familiar"]);
const isNative=()=>typeof window.PicgiftNative==="object"&&typeof window.PicgiftNative.postMessage==="function";
function syncNative(){if(isNative())window.PicgiftNative.postMessage(JSON.stringify({action:"account",user_id:nativeUser?.id||""}));}
function status(text){$("payment-status").textContent=text}
function buttons(can){document.querySelectorAll("[data-buy]").forEach(btn=>{btn.disabled=!can;btn.textContent=btn.dataset.buy==="esencial"?"Comprar 1 fotografía":btn.dataset.buy==="magico"?"Comprar pack de 5":"Comprar pack de 10";});}
async function call(body){
 const {data,error}=await client.functions.invoke("picgift-checkout",{body});
 if(error){let message="No se pudo consultar el servicio de pagos.";try{const reply=await error.context.json();message=reply.error||message}catch{}throw Error(message)}
 return data;
}
async function refresh(){
 try{
  const {data:{session}}=await client.auth.getSession();
  nativeUser=session?.user||null;syncNative();
  if(!session){window.picgiftCreditsAvailable=null;window.picgiftStudioUpdate?.();buttons(false);status("Inicia sesión para consultar tus créditos. Los pagos están pendientes de activación.");return}
  const data=await call({action:"status"});available=isNative()?!!data.google_play_available:!!data.checkout_available;
  const credits=Math.max(0,Number(data.credits)||0);window.picgiftCreditsAvailable=credits;window.picgiftStudioUpdate?.();
  $("account-credits").textContent=credits+" "+(credits===1?"fotografía":"fotografías");
  const {data:orders}=await client.from("picgift_orders").select("id,status,created_at,product_id").order("created_at",{ascending:false}).limit(10);
  $("account-orders").textContent=(orders||[]).filter(x=>x.status==="paid").length+" pagos confirmados";
  const enable=available;
  buttons(enable);
  status(enable?"Ya puedes elegir un pack. Los créditos se añaden únicamente cuando el proveedor confirma el cobro.":isNative()?"La compra en Android se habilitará tras completar las pruebas de Google Play y activar las ventas.":"Los packs están publicados, pero no se admiten pagos hasta terminar las pruebas de generación y activar Stripe.");
 }catch(err){buttons(false);status("No se pudo comprobar el estado de los pagos. La compra no está disponible por seguridad.")}
}
async function pay(productId){
 if(!PRODUCT_IDS.has(productId))return;
 if(!available){status("Los pagos todavía están desactivados.");return}
 const {data:{user}}=await client.auth.getUser();
 if(!user){status("Primero inicia sesión o crea una cuenta PICGIFT.");return}
  const btn=document.querySelector('[data-buy="'+productId+'"]');btn.disabled=true;
 try{
  if(isNative()){window.PicgiftNative.postMessage(JSON.stringify({action:"purchase",product_id:productId,user_id:user.id}));status("Solicitando el pago a Google Play…");return}
  const data=await call({action:"checkout",product_id:productId});
  const url=new URL(data.url);
  if(url.protocol!=="https:"||url.hostname!=="checkout.stripe.com")throw Error("URL de pago no verificada.");
  window.location.assign(url.href);
 }catch(e){status(e.message||"No fue posible comenzar el pago.");}finally{btn.disabled=false}
}
async function handleNativePurchase(detail){
 // The purchase token is sent ONLY to the authenticated Supabase Edge Function, never accepted as proof in this browser.
 if(!detail||!PRODUCT_IDS.has(detail.product_id)||typeof detail.purchase_token!=="string")return;
 if(nativeInFlight.has(detail.purchase_token))return;
 nativeInFlight.add(detail.purchase_token);
 try{
  const {data,error}=await client.functions.invoke("picgift-google-play",{body:{product_id:detail.product_id,purchase_token:detail.purchase_token}});
  if(error)throw Error("Google Play todavía no ha confirmado el pago.");
  status(data?.success?"Compra verificada. Créditos actualizados.":"Pendiente de confirmación por Google Play.");
  if(data?.success)await refresh();
 }catch(e){status("No se pudieron acreditar los créditos. Conserva el recibo de Google Play para recuperar la compra.")}
 finally{nativeInFlight.delete(detail.purchase_token);}
}
function init(){
 if(initialized)return;initialized=true;
 document.addEventListener("click",e=>{const btn=e.target.closest("[data-buy]");if(btn)pay(btn.dataset.buy)});
 window.addEventListener("picgift:auth",e=>{nativeUser=e.detail.user||null;syncNative();refresh();});
 window.addEventListener("picgift:native-ready",syncNative);
 window.addEventListener("picgift:play-error",()=>{status(window.picgiftI18n.t("No fue posible comenzar el pago."));buttons(available);});
 window.addEventListener("picgift:play-pending",()=>status(window.picgiftI18n.t("Pendiente de confirmación por Google Play.")));
 window.addEventListener("picgift:play-prices",e=>{
   for(const [id,price] of Object.entries(e.detail||{})){
     if(!PRODUCT_IDS.has(id)||typeof price!=="string")continue;
     const card=document.querySelector('[data-buy="'+id+'"]')?.closest('.price-card');
     const amount=card?.querySelector('.price-amount');
     if(amount){amount.replaceChildren();const local=document.createElement('span');local.dataset.noTranslate='';local.textContent=price;amount.append(local);}
   }
 });
 window.addEventListener("picgift:play-purchase",e=>handleNativePurchase(e.detail));
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh()});
 client.auth.getUser().then(({data})=>{if(data?.user)refresh();else buttons(false)}).catch(()=>buttons(false));
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
