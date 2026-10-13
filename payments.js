import {createClient} from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from "./config.js";
const client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
let available=false,initialized=false;
let nativeUser=null;
let nativeCheckoutPending=false;
let checkoutPending=false,checkoutRedirected=false;
let paymentNotice=null,lastStatus=null;
let confirmedOrders=null;
let authRevision=0,refreshRevision=0;
const nativeInFlight=new Set();
const playReadyProducts=new Set();
const playPrices=new Map();
const PRODUCT_IDS=new Set(["esencial","magico","familiar"]);
/* Halloween 2026: 20% on 5/10 packs. Madrid midnight 1 Nov is 2026-10-31T23:00Z. */
const PROMO_START=Date.parse("2026-10-07T22:00:00Z"),PROMO_END=Date.parse("2026-10-31T23:00:00Z");
const PROMO_PRICES={magico:{normal:2490,promo:1992,save:498},familiar:{normal:3990,promo:3192,save:798}};
const isPromoLive=()=>Date.now()>=PROMO_START&&Date.now()<PROMO_END;
const isEs=()=>window.picgiftI18n?.language!=="en";
function money(cents){return new Intl.NumberFormat(isEs()?"es-ES":"en-GB",{minimumFractionDigits:2,maximumFractionDigits:2}).format(cents/100)}
function renderHalloweenPromo(){
 const active=!isNative()&&document.documentElement.dataset.campaign==="halloween"&&isPromoLive(),es=isEs();
 const tr=es?{
 kicker:"OFERTA ESPECIAL HALLOWEEN 2026",headline:"20 % de descuento en los packs de 5 y 10 fotos",
 end:"Hasta el 31 de octubre incluido · Compras todavía desactivadas",action:"Ver oferta",
 intro:"−20 % en los packs de 5 y 10 fotografías",introCopy:"Hasta el 31 de octubre de 2026 incluido. El pack de 1 foto mantiene su precio.",
 date:"HASTA EL 31 OCT",notice:"Promoción Halloween anunciada: las compras siguen desactivadas. La oferta solo podrá utilizarse si activamos los cobros durante su vigencia.",
 save:"Ahorra ",until:" · Hasta el 31 de octubre"
 }:{
 kicker:"HALLOWEEN 2026 SPECIAL OFFER",headline:"20% off 5- and 10-photo packs",
 end:"Through 31 October inclusive · Purchases not yet available",action:"View offer",
 intro:"20% off 5- and 10-photo packs",introCopy:"Valid through 31 October 2026 inclusive. The 1-photo pack stays at its normal price.",
 date:"ENDS 31 OCT",notice:"Halloween promotion announced: purchases are still disabled. This offer can only be used if payments open during the promotional period.",
 save:"Save €",until:" · Through 31 October"
 };
 if(available){
  tr.end=es?"Hasta el 31 de octubre incluido":"Through 31 October inclusive";
  tr.notice=es?"Promoción válida hasta el 31 de octubre de 2026 incluido. El precio final se confirma antes de pagar.":"Valid through 31 October 2026 inclusive. Your final price is confirmed before payment.";
 }
 for(const id of ["halloween-promo-home","halloween-promo-pricing","promo-disclosure"]){const el=$(id);if(el)el.hidden=!active;}
 const content={"promo-home-kicker":tr.kicker,"promo-home-heading":tr.headline,"promo-home-desc":tr.end,
 "promo-home-cta":tr.action,"promo-intro-tag":tr.kicker,"promo-intro-head":tr.intro,"promo-intro-copy":tr.introCopy,
 "promo-intro-date":tr.date,"promo-disclosure":tr.notice};
 for(const [id,value] of Object.entries(content)){const el=$(id);if(el)el.textContent=value;}
 for(const [id,prices] of Object.entries(PROMO_PRICES)){
  const card=document.querySelector('[data-promo-card="'+id+'"]');if(!card)continue;
  card.classList.toggle("is-promo-active",active);
  card.querySelectorAll("[data-promo-badge],[data-promo-original],[data-promo-saving]").forEach(el=>{el.hidden=!active});
  const amount=card.querySelector("[data-promo-amount]");
  if(amount){amount.dataset.priceEur=String((active?prices.promo:prices.normal)/100);amount.textContent=money(active?prices.promo:prices.normal);}
  const old=card.querySelector("[data-promo-original]");if(old)old.textContent=money(prices.normal);
  const saving=card.querySelector("[data-promo-saving]");if(saving)saving.textContent=tr.save+money(prices.save)+(es?" €":"")+tr.until;
 }
 if(isNative())renderPlayPrices();
}

const isNative=()=>typeof window.PicgiftNative==="object"&&typeof window.PicgiftNative.postMessage==="function";
function syncNative(){if(isNative())window.PicgiftNative.postMessage(JSON.stringify({action:"account",user_id:nativeUser?.id||""}));}
function status(text,english){lastStatus=[text,english];$("payment-status").textContent=isEs()?text:(english||window.picgiftI18n?.t?.(text)||text)}
function notice(text,english){paymentNotice=[text,english];status(text,english)}
function nativeBusy(){return nativeCheckoutPending||nativeInFlight.size>0}
function paymentBusy(){return checkoutPending||nativeBusy()}
function buttons(can){
 document.querySelectorAll("[data-buy]").forEach(btn=>{btn.disabled=!can||paymentBusy()||(isNative()&&!playReadyProducts.has(btn.dataset.buy));btn.textContent=isEs()?"Elegir pack":"Choose pack";});
 document.querySelectorAll("[data-payment-refresh]").forEach(btn=>{btn.disabled=paymentBusy();btn.textContent=isEs()?"Actualizar saldo y recuperar compras":"Refresh balance and recover purchases";});
}
function renderPlayPrices(){
 for(const id of PRODUCT_IDS){
  const amount=document.querySelector('[data-buy="'+id+'"]')?.closest('.price-card')?.querySelector('.price-amount');
  if(!amount)continue;
  const local=document.createElement('span');local.dataset.noTranslate='';
  local.textContent=playPrices.get(id)||(isEs()?"Consultar en Google Play":"Check Google Play");
  amount.replaceChildren(local);
 }
}
function renderBalance(){
 const credits=window.picgiftCreditsAvailable;
 $("account-credits").textContent=credits===null||credits===undefined?"—":credits+" "+(isEs()?(credits===1?"fotografía":"fotografías"):(credits===1?"photo":"photos"));
 $("account-orders").textContent=confirmedOrders===null?"—":confirmedOrders+(isEs()?" pagos confirmados":" confirmed payments");
}
function resetAccount(user){
 authRevision++;refreshRevision++;
 nativeUser=user||null;available=false;nativeCheckoutPending=false;checkoutPending=false;checkoutRedirected=false;paymentNotice=null;
 nativeInFlight.clear();playReadyProducts.clear();playPrices.clear();
 window.picgiftCreditsAvailable=null;confirmedOrders=null;window.picgiftStudioUpdate?.();renderBalance();
 buttons(false);renderHalloweenPromo();syncNative();
}
async function call(body){
 const {data,error}=await client.functions.invoke("picgift-checkout",{body});
 if(error){let message="No se pudo consultar el servicio de pagos.";try{const reply=await error.context.json();message=reply.error||message}catch{}throw Error(message)}
 return data;
}
async function refresh(){
 const revision=++refreshRevision,sessionRevision=authRevision;
 const isCurrent=()=>revision===refreshRevision&&sessionRevision===authRevision;
 try{
  const {data:{session}}=await client.auth.getSession();
  if(!isCurrent())return;
  if((session?.user?.id||null)!==(nativeUser?.id||null)){resetAccount(session?.user);return refresh()}
  nativeUser=session?.user||null;syncNative();
  if(!session){available=false;playReadyProducts.clear();playPrices.clear();paymentNotice=null;window.picgiftCreditsAvailable=null;window.picgiftStudioUpdate?.();$("account-credits").textContent="—";$("account-orders").textContent="—";buttons(false);renderHalloweenPromo();status("Inicia sesión para consultar tus créditos.","Sign in to view your credits.");return}
  const data=await call({action:"status"});if(!isCurrent())return;
  available=isNative()?!!data.google_play_available:!!data.checkout_available;
  const credits=Math.max(0,Number(data.credits)||0);window.picgiftCreditsAvailable=credits;window.picgiftStudioUpdate?.();
  renderBalance();
  const {count:paidOrders,error:ordersError}=await client.from("picgift_orders").select("id",{count:"exact",head:true}).eq("status","paid");
  if(!isCurrent())return;
  if(ordersError||!Number.isInteger(paidOrders)||paidOrders<0)throw ordersError||Error("No se pudo consultar el total de pagos.");
  confirmedOrders=paidOrders;renderBalance();
  const enable=available;
  if(isNative()){
    playReadyProducts.clear();
    buttons(false);
    if(enable)window.PicgiftNative.postMessage(JSON.stringify({action:"products"}));
  }else buttons(enable);
  renderHalloweenPromo();
  if(!paymentBusy()){
   if(paymentNotice)status(...paymentNotice);
   else if(enable&&isNative())status("Consultando los paquetes disponibles en Google Play…","Checking available Google Play packs…");
   else if(enable)status("Ya puedes elegir un pack. Los créditos se añaden únicamente cuando el proveedor confirma el cobro.","Choose a pack. Credits are added only after the payment provider confirms payment.");
   else status("Las compras todavía no están disponibles. Puedes consultar y recuperar tus compras anteriores.","Purchases are not available yet. You can check and recover your previous purchases.");
  }
  return true;
 }catch(err){if(isCurrent()){available=false;playReadyProducts.clear();playPrices.clear();window.picgiftCreditsAvailable=null;confirmedOrders=null;window.picgiftStudioUpdate?.();renderBalance();buttons(false);renderHalloweenPromo();status("No se pudo comprobar el estado de los pagos. Pulsa «Actualizar saldo y recuperar compras» para intentarlo de nuevo.","Could not check your payments. Select “Refresh balance and recover purchases” to try again.")}return false;}
}
async function pay(productId){
 const revision=authRevision,accountId=nativeUser?.id;
 const isCurrent=()=>revision===authRevision&&accountId===nativeUser?.id;
 if(!PRODUCT_IDS.has(productId)||paymentBusy())return;
 if(isNative()&&!playReadyProducts.has(productId))return;
 if(!available){status("Los pagos todavía están desactivados.","Payments are not available yet.");return}
 // Lock every pack before the first await; multiple clicks must never create parallel checkouts.
 checkoutPending=true;paymentNotice=null;buttons(false);
 try{
  let identity;
  try{identity=await client.auth.getUser();if(identity.error)throw identity.error;}
  catch(e){if(isCurrent())status("No se pudo comprobar tu sesión. Vuelve a intentarlo.","Could not verify your session. Please try again.");return}
  if(!isCurrent())return;
  const user=identity.data?.user;
  if(!user){status("Primero inicia sesión o crea una cuenta PICGIFT.","Sign in or create a PICGIFT account first.");return}
  if(user.id!==accountId){resetAccount(user);await refresh();return}
  if(!available||isNative()&&(nativeBusy()||!playReadyProducts.has(productId)))return;
  if(isNative()){nativeCheckoutPending=true;window.PicgiftNative.postMessage(JSON.stringify({action:"purchase",product_id:productId,user_id:user.id}));status("Solicitando el pago a Google Play…","Opening Google Play checkout…");return}
  status("Abriendo el pago seguro…","Opening secure checkout…");
  const data=await call({action:"checkout",product_id:productId});
  if(!isCurrent())return;
  const url=new URL(data.url);
  if(url.protocol!=="https:"||url.hostname!=="checkout.stripe.com"||url.port||url.username||url.password)throw Error("URL de pago no verificada.");
  window.location.assign(url.href);
  checkoutRedirected=true;
 }catch(e){if(isCurrent()){nativeCheckoutPending=false;status("No fue posible comenzar el pago. Vuelve a intentarlo.","Could not start payment. Please try again.");}}finally{if(isCurrent()){if(!checkoutRedirected)checkoutPending=false;buttons(available)}}
}
async function handleNativePurchase(detail){
 // The purchase token is sent ONLY to the authenticated Supabase Edge Function, never accepted as proof in this browser.
 if(!nativeUser||!detail||detail.user_id&&detail.user_id!==nativeUser.id||!PRODUCT_IDS.has(detail.product_id)||typeof detail.purchase_token!=="string"||!detail.purchase_token.trim())return;
 const revision=authRevision,key=revision+":"+detail.purchase_token;
 if(nativeInFlight.has(key))return;
 nativeCheckoutPending=false;
 nativeInFlight.add(key);
 buttons(false);
 paymentNotice=null;status("Verificando tu compra con Google Play…","Verifying your Google Play purchase…");
 try{
  const {data,error}=await client.functions.invoke("picgift-google-play",{body:{product_id:detail.product_id,purchase_token:detail.purchase_token}});
  if(revision!==authRevision)return;
  if(error)throw Error("Google Play todavía no ha confirmado el pago.");
  const balanceUpdated=data?.success?await refresh():false;
  if(revision!==authRevision)return;
  if(data?.success&&data.consumption_pending&&balanceUpdated)notice("Compra verificada. Créditos actualizados. Falta finalizarla con Google Play; puedes usar tus créditos y recuperar la compra más tarde sin volver a pagar.","Purchase verified. Credits updated. Google Play still needs to finalize it; you can use your credits and recover the purchase later without paying again.");
  else if(data?.success)notice(balanceUpdated?"Compra verificada. Créditos actualizados.":"Compra verificada. No se pudo consultar tu saldo. Pulsa «Actualizar saldo y recuperar compras»; no repitas la compra.",balanceUpdated?"Purchase verified. Credits updated.":"Purchase verified. Your balance could not be loaded. Select “Refresh balance and recover purchases”; do not buy again.");
  else notice("Pendiente de confirmación por Google Play. Los créditos se añadirán cuando se confirme el pago.","Waiting for Google Play confirmation. Credits will be added after payment is confirmed.");
 }catch(e){if(revision===authRevision)notice("No se pudieron acreditar los créditos. Conserva el recibo y pulsa «Actualizar saldo y recuperar compras» para recuperar la compra.","Credits could not be confirmed. Keep your receipt and select “Refresh balance and recover purchases” to recover the purchase.")}
 finally{nativeInFlight.delete(key);if(revision===authRevision)buttons(available);}
}
function init(){
 if(initialized)return;initialized=true;
 renderHalloweenPromo();window.addEventListener("picgift:language",()=>{renderHalloweenPromo();renderBalance();buttons(available);if(lastStatus)status(...lastStatus)});
 setInterval(renderHalloweenPromo,60000);
 document.addEventListener("click",e=>{const btn=e.target.closest("[data-buy]");if(btn){pay(btn.dataset.buy);return}if(e.target.closest("[data-payment-refresh]"))recoverPayments()});
 window.addEventListener("picgift:auth",e=>{resetAccount(e.detail.user);refresh();});
 window.addEventListener("picgift:native-ready",()=>{buttons(false);renderHalloweenPromo();refresh()});
 window.addEventListener("picgift:payment-refresh",recoverPayments);
 const currentNativeEvent=e=>!!nativeUser&&(!e?.detail?.user_id||e.detail.user_id===nativeUser.id);
 window.addEventListener("picgift:play-error",e=>{
  if(!currentNativeEvent(e))return;
  if(e?.detail?.source==="catalog"){
   playReadyProducts.clear();playPrices.clear();renderPlayPrices();
   if(!paymentBusy())notice("No se pudo consultar el catálogo de Google Play. Pulsa «Actualizar saldo y recuperar compras» para reintentar.","Could not load the Google Play catalog. Select “Refresh balance and recover purchases” to retry.");
  }else if(e?.detail?.source==="restore"){
   if(!paymentBusy())notice("No se pudieron consultar tus compras anteriores. Pulsa «Actualizar saldo y recuperar compras» para reintentar.","Could not check your previous purchases. Select “Refresh balance and recover purchases” to retry.");
  }else{
   nativeCheckoutPending=false;
   if(!nativeInFlight.size)notice("No fue posible comenzar el pago. Vuelve a intentarlo o recupera tus compras anteriores.","Could not start payment. Try again or recover your previous purchases.");
  }
  buttons(available);
 });
 window.addEventListener("picgift:play-cancelled",e=>{if(!currentNativeEvent(e))return;nativeCheckoutPending=false;if(!nativeInFlight.size)notice("Compra cancelada. No se han añadido créditos.","Purchase cancelled. No credits were added.");buttons(available);});
 window.addEventListener("picgift:play-pending",e=>{if(!currentNativeEvent(e))return;nativeCheckoutPending=false;if(!nativeInFlight.size)notice("Pendiente de confirmación por Google Play. Los créditos se añadirán cuando se confirme el pago.","Waiting for Google Play confirmation. Credits will be added after payment is confirmed.");buttons(available);});
 window.addEventListener("picgift:play-prices",e=>{
   if(!available||!isNative()||!currentNativeEvent(e))return;
   playReadyProducts.clear();playPrices.clear();
   for(const [id,price] of Object.entries(e.detail?.prices||e.detail||{})){
     if(!PRODUCT_IDS.has(id)||typeof price!=="string"||!price.trim())continue;
     playReadyProducts.add(id);playPrices.set(id,price);
   }
   renderPlayPrices();
   buttons(true);
   if(paymentBusy())return;
   if(paymentNotice){status(...paymentNotice);return}
   status(playReadyProducts.size===PRODUCT_IDS.size
     ?"Google Play ha confirmado los tres paquetes. Ya puedes elegir el que prefieras."
     :"Google Play ha encontrado "+playReadyProducts.size+" de "+PRODUCT_IDS.size+" paquetes. Puedes elegir entre los disponibles.",playReadyProducts.size===PRODUCT_IDS.size
     ?"Google Play has confirmed all three packs. Choose the one you prefer."
     :"Google Play found "+playReadyProducts.size+" of "+PRODUCT_IDS.size+" packs. You can choose from the available packs.");
 });
 window.addEventListener("picgift:play-purchase",e=>handleNativePurchase(e.detail));
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh()});
 // Browsers may restore the checkout page from their back/forward cache with its old disabled buttons.
 window.addEventListener("pageshow",e=>{if(e.persisted){checkoutPending=false;checkoutRedirected=false;refresh()}});
 const initialRevision=authRevision;
 client.auth.getUser().then(({data})=>{if(initialRevision!==authRevision)return;if(data?.user)refresh();else buttons(false)}).catch(()=>{if(initialRevision===authRevision)buttons(false)});
}
function recoverPayments(){
 if(paymentBusy())return;
 paymentNotice=null;
 status("Consultando el saldo y las compras anteriores…","Checking your balance and previous purchases…");
 // Refresh sends the current account to Android, which queries owned purchases even when new sales are disabled.
 return refresh();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
