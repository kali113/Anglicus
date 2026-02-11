# Status

Paused per request.

## In progress
- Promo code security rework started (server-side promo validation + HttpOnly cookie).
- Added `/api/billing/promo` endpoint and promo cookie handling; billing config now uses cookie to return discount.
- Removed promo pepper constant from API promo list and renamed client constant to `PROMO_CODE_PREFIX` (not yet used).

## Next steps
- Update web promo flow to call `/api/billing/promo` with credentials and stop hashing promo codes client-side.
- Remove promo hash fields from billing storage/types to avoid cleartext localStorage warnings.
- Align payment verification to rely on server cookie and retest billing flow.
