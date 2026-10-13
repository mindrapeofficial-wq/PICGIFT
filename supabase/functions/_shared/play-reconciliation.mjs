import {validatePlayPurchase} from './play-purchase.mjs';

const PACKAGE='com.picgift.myapp';
const base=packageName=>'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'+encodeURIComponent(packageName);
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const check=result=>{if(result.error)throw Error('play_database_unavailable');return result.data};
const errorCode=error=>/^play_[a-z_0-9]+$/.test(error?.message)?error.message:'play_reconciliation_unavailable';

export async function googlePlayAccessToken(config,request=fetch){
 const account=typeof config==='string'?JSON.parse(config):config;
 const privateKey=String(account.private_key||'').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g,'');
 const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(privateKey),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const encode=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const now=Math.floor(Date.now()/1000),te=new TextEncoder();
 const head=encode(te.encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
 const body=encode(te.encode(JSON.stringify({iss:account.client_email,scope:'https://www.googleapis.com/auth/androidpublisher',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})));
 const data=head+'.'+body;
 const assertion=data+'.'+encode(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,te.encode(data))));
 const response=await request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(15000)});
 const result=await response.json();
 if(!response.ok||typeof result.access_token!=='string'||!result.access_token)throw Error('play_credentials_unavailable');
 return result.access_token;
}

// Only call with a token/order verified through Google's authenticated API.
// The conditional update races safely with picgift_grant_order's row lock: if
// credit was granted first, the idempotent revoke RPC records its reversal.
export async function revokePlayOrder(db,order,providerOrderId){
 if(order.provider!=='google_play'||(order.provider_payment_id&&order.provider_payment_id!==providerOrderId))throw Error('play_order_mismatch');
 if(order.status==='refunded')return;
 const cancelled=check(await db.from('picgift_orders').update({status:'refunded',provider_payment_id:providerOrderId})
  .eq('id',order.id).eq('provider','google_play').in('status',['pending','failed','cancelled']).eq('credits_awarded',0).select('id').maybeSingle());
 if(cancelled)return;
 const result=await db.rpc('picgift_revoke_order',{p_order:order.id});
 if(result.error||result.data!==true)throw Error('play_revoke_pending');
}

async function getJSON(url,access,request){
 const response=await request(url,{headers:{Authorization:'Bearer '+access},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('play_api_'+response.status);
 return response.json();
}

export async function reconcilePlayPurchases({db,access,packageName,request=fetch,now=Date.now(),maxPages=10,maxOrders=30,voidedPageToken='',voidedItemIndex=0,pendingAfter='',maxDurationMs=45000,clock=Date.now}){
 if(packageName!==PACKAGE||!access)throw Error('play_configuration_invalid');
 const result={scope:'batch',checked_voided:0,refunded:0,consumed:0,granted:0,ignored:0,errors:[],next_voided_page_token:null,next_voided_item_index:0,next_pending_order_id:null,complete:false};
 const deadline=clock()+Math.min(Math.max(maxDurationMs,1),45000);
 const refundDeadline=clock()+Math.floor(Math.min(Math.max(maxDurationMs,1),45000)/2);
 const send=(url,options={})=>{
  const remaining=deadline-clock();if(remaining<=0)throw Error('play_time_budget_exhausted');
  const signals=[AbortSignal.timeout(remaining)];if(options.signal)signals.push(options.signal);
  return request(url,{...options,signal:AbortSignal.any(signals)});
 };
 let pageToken=voidedPageToken;
 const seen=new Set();
 refundPages:for(let page=0;page<maxPages;page++){
  // A one-day margin keeps a resumed first page inside Google's 30-day maximum.
  // The persisted scan expires after 20 hours, including retries without a token.
  const params=new URLSearchParams({type:'0',startTime:String(now-29*86400000),endTime:String(now),'pageSelection.maxResults':'100',includeQuantityBasedPartialRefund:'true'});
  if(pageToken)params.set('pageSelection.token',pageToken);
  if(clock()>=refundDeadline){result.errors.push({stage:'refund',code:'play_time_budget_exhausted'});result.next_voided_page_token=pageToken;break}
  let list;
  try{list=await getJSON(base(packageName)+'/purchases/voidedpurchases?'+params,access,(url,options)=>send(url,{...options,signal:AbortSignal.any([options.signal,AbortSignal.timeout(Math.max(1,refundDeadline-clock()))])}))}
  catch(error){result.errors.push({stage:'refund',code:errorCode(error)});result.next_voided_page_token=pageToken;break}
  if(list.voidedPurchases!==undefined&&!Array.isArray(list.voidedPurchases))throw Error('play_voided_response_invalid');
  for(const [index,item] of (list.voidedPurchases||[]).entries()){
   // Continue within an unfinished page so even slow database responses cannot
   // permanently starve its later refunds. Repeated reversals remain idempotent.
   if(page===0&&index<voidedItemIndex)continue;
   if(clock()>=refundDeadline){result.errors.push({stage:'refund',code:'play_time_budget_exhausted'});result.next_voided_page_token=pageToken;result.next_voided_item_index=index;break refundPages}
   result.checked_voided++;
   try{
    if(typeof item.purchaseToken!=='string'||typeof item.orderId!=='string'||!item.orderId||(item.voidedQuantity!==undefined&&item.voidedQuantity!==1))throw Error('play_voided_record_invalid');
    const order=check(await db.from('picgift_orders').select('id,provider,status,provider_payment_id').eq('provider','google_play').eq('provider_checkout_id',item.purchaseToken).maybeSingle());
    if(!order){result.ignored++;continue}
    await revokePlayOrder(db,order,item.orderId);result.refunded++;
   }catch(error){result.errors.push({stage:'refund',code:errorCode(error)})}
  }
  pageToken=list.tokenPagination?.nextPageToken||'';
  if(!pageToken)break;
  if(typeof pageToken!=='string'||seen.has(pageToken))throw Error('play_pagination_invalid');
  seen.add(pageToken);
 }
 if(pageToken)result.next_voided_page_token=pageToken;
 // Use a stable ID cursor, not an offset into a result set changed by consumption.
 let query=db.from('picgift_orders').select('id,user_id,product_id,provider,provider_checkout_id,provider_payment_id,status,credits_awarded,play_consumed_at')
  .eq('provider','google_play').in('status',['pending','paid']).is('play_consumed_at',null).order('id',{ascending:true}).limit(maxOrders+1);
 if(pendingAfter)query=query.gt('id',pendingAfter);
 const orders=check(await query)||[];
 if(orders.length>maxOrders)result.next_pending_order_id=orders[maxOrders-1].id;
 let lastAttempted=pendingAfter;
 for(const order of orders.slice(0,maxOrders)){
  if(clock()>=deadline){result.errors.push({stage:'delivery',code:'play_time_budget_exhausted'});result.next_pending_order_id=lastAttempted;break}
  lastAttempted=order.id;
  try{
   const product=check(await db.from('picgift_products').select('google_play_product_id').eq('id',order.product_id).maybeSingle());
   if(!product?.google_play_product_id||!order.provider_checkout_id)throw Error('play_product_unavailable');
   const purchase=await getJSON(base(packageName)+'/purchases/productsv2/tokens/'+encodeURIComponent(order.provider_checkout_id),access,send);
   const accountHash=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(order.user_id)));
   const line=purchase.productLineItem?.[0];
   if(purchase.obfuscatedExternalAccountId!==accountHash||purchase.productLineItem?.length!==1||line?.productId!==product.google_play_product_id||line.productOfferDetails?.quantity!==1||
    typeof purchase.orderId!=='string'||!purchase.orderId||(order.provider_payment_id&&order.provider_payment_id!==purchase.orderId))throw Error('play_order_mismatch');
   if(purchase.purchaseStateContext?.purchaseState==='CANCELLED'||line.productOfferDetails.refundableQuantity===0){await revokePlayOrder(db,order,purchase.orderId);result.refunded++;continue}
   if(validatePlayPurchase(purchase,product.google_play_product_id))throw Error('play_receipt_not_payable');
   if(order.status==='pending'){
    const grant=await db.rpc('picgift_grant_order',{p_order:order.id,p_provider_ref:purchase.orderId});
    if(grant.error||grant.data!==true)throw Error('play_grant_pending');
    result.granted++;
   }
   if(line.productOfferDetails.consumptionState!=='CONSUMPTION_STATE_CONSUMED'){
    const response=await send(base(packageName)+'/purchases/products/'+encodeURIComponent(product.google_play_product_id)+'/tokens/'+encodeURIComponent(order.provider_checkout_id)+':consume',{
     method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error('play_consume_pending');
   }
   const saved=check(await db.from('picgift_orders').update({play_consumed_at:new Date(now).toISOString()}).eq('id',order.id).eq('provider','google_play').eq('status','paid').select('id').maybeSingle());
   if(!saved)throw Error('play_consumption_save_pending');
   result.consumed++;
  }catch(error){result.errors.push({stage:'delivery',order_id:order.id,code:errorCode(error)})}
 }
 result.complete=!result.errors.length&&!result.next_voided_page_token&&!result.next_pending_order_id;
 return result;
}

// A private singleton keeps continuation independent of the edge isolate lifetime.
// Version CAS prevents an overlapping run from overwriting newer progress. Its
// order work remains safe to repeat through the locking grant/revoke RPCs.
export async function reconcilePlayBatch(options){
 const {db}=options;
 const saved=check(await db.from('picgift_play_reconciliation_state').select('version,state').eq('singleton',true).single());
 if(!saved||!Number.isSafeInteger(saved.version))throw Error('play_state_unavailable');
 const now=options.now??Date.now();
 const state=saved.state||{};
 const continuing=Number.isFinite(state.window_end)&&state.window_end<=now&&state.window_end>now-20*3600000;
 const windowEnd=continuing?state.window_end:now;
 const result=await reconcilePlayPurchases({...options,now:windowEnd,
  pendingAfter:typeof state.pending_after==='string'?state.pending_after:'',
  voidedPageToken:continuing&&typeof state.voided_page_token==='string'?state.voided_page_token:'',
  voidedItemIndex:continuing&&Number.isSafeInteger(state.voided_item_index)?state.voided_item_index:0});
 const next={pending_after:result.next_pending_order_id??'',voided_page_token:result.next_voided_page_token??'',
  voided_item_index:result.next_voided_item_index,window_end:result.next_voided_page_token!==null?windowEnd:null};
 const updated=check(await db.from('picgift_play_reconciliation_state').update({state:next,version:saved.version+1,updated_at:new Date(now).toISOString()})
  .eq('singleton',true).eq('version',saved.version).select('version').maybeSingle());
 if(!updated){result.complete=false;result.errors.push({stage:'state',code:'play_state_concurrent_retry'})}
 return result;
}
