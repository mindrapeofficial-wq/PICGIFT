// Only fields returned by Google's authenticated purchase API belong here.
export function validatePlayPurchase(purchase, productId) {
  if (purchase?.purchaseStateContext?.purchaseState !== 'PURCHASED' ||
      !Array.isArray(purchase.productLineItem) || purchase.productLineItem.length !== 1 ||
      purchase.productLineItem[0]?.productId !== productId) {
    return 'Compra pendiente o producto no coincidente';
  }
  const offer = purchase.productLineItem[0]?.productOfferDetails;
  if (offer?.quantity !== 1) return 'Cantidad de compra inesperada';
  if (offer.refundableQuantity !== 1) return 'Compra reembolsada o cantidad no verificable';
  if (offer.rentOfferDetails || offer.preorderOfferDetails) return 'Tipo de compra no admitido';
  if (typeof purchase.purchaseCompletionTime !== 'string' ||
      !Number.isFinite(Date.parse(purchase.purchaseCompletionTime))) {
    return 'Fecha de compra no verificable';
  }
  return null;
}

export function isHalloweenPurchase(completionTime) {
  const purchasedAt = Date.parse(completionTime);
  return purchasedAt >= Date.parse('2026-10-07T22:00:00Z') &&
    purchasedAt < Date.parse('2026-10-31T23:00:00Z');
}
