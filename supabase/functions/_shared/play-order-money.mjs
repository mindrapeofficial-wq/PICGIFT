// Google's authenticated Orders API is the only source of Play payment amounts.
// Keep Money exactly: not every currency/price can be represented in two decimals.
export function playOrderMoney(order,{orderId,purchaseToken,productId}){
 if(order?.orderId!==orderId||order?.purchaseToken!==purchaseToken||
  order?.lineItems?.length!==1||order.lineItems[0]?.productId!==productId||
  order.lineItems[0]?.oneTimePurchaseDetails?.quantity!==1)return null;
 const money=order.total;
 if(!money||typeof money.currencyCode!=='string'||! /^[A-Z]{3}$/.test(money.currencyCode))return null;
 const units=money.units??'0',nanos=money.nanos??0;
 if(typeof units!=='string'||! /^(0|[1-9][0-9]{0,18})$/.test(units)||
  !Number.isInteger(nanos)||nanos<0||nanos>999999999)return null;
 const hundredths=BigInt(units)*100n+BigInt(Math.floor(nanos/10000000));
 return {amount_source:'google_orders',currency:money.currencyCode.toLowerCase(),
  amount_cents:nanos%10000000===0&&hundredths<=2147483647n?Number(hundredths):null,
  play_order_total:{currencyCode:money.currencyCode,units,nanos}};
}

export async function readPlayOrderMoney({access,packageName,orderId,purchaseToken,productId,request=fetch}){
 if(typeof orderId!=='string'||!orderId)return null;
 try{
  const response=await request('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'+encodeURIComponent(packageName)+'/orders/'+encodeURIComponent(orderId),
   {headers:{Authorization:'Bearer '+access},signal:AbortSignal.timeout(5000)});
  if(!response.ok)return null;
  return playOrderMoney(await response.json(),{orderId,purchaseToken,productId});
 }catch{return null}
}
