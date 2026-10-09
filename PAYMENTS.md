# PICGIFT · Payments integration 2026

## Packs comerciales
| ID | Paquete | Web (EUR) | Créditos | Google Play Product ID |
| --- | --- | ---: | ---: | --- |
| esencial | PICGIFT Esencial | 7,90 € | 1 | picgift_esencial_1 |
| magico | PICGIFT Mágico | 24,90 € | 5 | picgift_magico_5 |
| familiar | PICGIFT Familiar | 39,90 € | 10 | picgift_familiar_10 |

La web muestra precios públicos desde octubre de 2026. Los botones de compra se desbloquean **solo** con PICGIFT_SALES_ENABLED=true y proveedor de cobro configurado. Mantener el flag **desactivado** hasta que la generación IA se haya probado, estén aprobadas las condiciones de venta, y existan contratos/consentimientos para fotos infantiles.

## Pagos web: Stripe Checkout
Supabase PICGIFT: https://supabase.com/dashboard/project/uimrvgrpenccijumyiek/functions
- Función autenticada picgift-checkout. Consulta precios desde la tabla picgift_products, crea pedido pending y Stripe Checkout Session. Nunca confía en importes enviados desde el navegador.
- Webhook picgift-stripe-webhook: URL https://uimrvgrpenccijumyiek.supabase.co/functions/v1/picgift-stripe-webhook. **verify_jwt=false intencionadamente**, pero valida obligatoriamente HMAC-SHA256 Stripe-Signature y antigüedad de 5 minutos. Registrar los eventos checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired y charge.refunded (solo completo).
- Secretos Supabase requeridos: STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET. Configurar webhook en Stripe Dashboard con su signing secret. No publicarlos en GitHub.
- El pago validado otorga créditos mediante picgift_grant_order() e insert idempotente en picgift_credit_ledger. Un reembolso completo revoca el saldo comprado en el libro de créditos. Compras reales sujetas a controles fiscales, recibos y gestión de devoluciones.

**Atención:** la conexión de Stripe en ChatGPT no equivale a configurar automáticamente las claves de Stripe en Supabase. Hasta que estén disponibles esos secretos y se haga una compra de prueba, la integración no está validada de extremo a extremo.

## Compras Android mediante Google Play Billing
- Proyecto fuente Android Studio en android/; **sin APK compilado ni firmado**.
- Play Billing Library 9.1.0, productos consumibles de compra única. Se necesita una aplicación creada en Play Console, productos configurados y canal interno de pruebas.
- Supabase Edge Function picgift-google-play valida la compra contra Google Play Android Publisher API v2, estado PURCHASED, producto y huella SHA256 de la cuenta PICGIFT; rechaza el token ya asociado a otra cuenta; acredita una sola vez y consume el token.
- Secretos adicionales requeridos: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (cuenta de servicio con Android Publisher API) y GOOGLE_PLAY_PACKAGE_NAME (mismo applicationId de la app). No incluir el JSON de cuenta de servicio en Android, repositorio ni frontend.
- Las compras desde apps publicadas en Google Play que venden bienes digitales utilizan Google Play Billing salvo excepciones/políticas específicas.
- Desde Android 1.5.0, Google OAuth utiliza navegador externo y regreso por un código de un solo uso con PKCE; el verificador permanece en el WebView. La validación completa con una cuenta Google en un dispositivo real sigue siendo necesaria antes de distribuir en producción.
- Si se distribuye una APK fuera de Play Store, el esquema de pagos debe revisarse por separado; el código actual de la app apunta a Google Play.

## Crédito por fotografía
- Una fotografía solicitada consume **1 crédito** con función SQL transaccional y bloqueo por usuario.
- Un trabajo fallido devuelve el crédito; un resultado que no supera revisión automática lo devuelve hasta subsanar la fotografía.
- El monedero no es dinero ni se puede transferir entre cuentas. No se deben otorgar créditos por resultados enviados desde el navegador, sino solo tras verificar el pago en backend.
- Supabase RLS: los usuarios solo consultan sus propias órdenes y ledger. Todos los cambios de estado y saldo son exclusivos de funciones de servidor.
- Antes del lanzamiento: conciliación diaria con Stripe y Google, alertas sobre pagos/reembolsos, política de expiración/reembolsos, impuestos, facturas y configuración del tratamiento de datos de menores.

## Activación comercial (pendiente)
1. Activar primero la generación real en Supabase con la OpenAI API y hacer pruebas con un adulto autorizado.
2. Conectar Stripe, obtener STRIPE_SECRET_KEY, crear el endpoint de webhook y guardar STRIPE_WEBHOOK_SECRET.
3. Crear la app en Google Play Console, definir productos, firmar/AAB, configurar service account y ejecutar compra de prueba.
4. Realizar pruebas de pago, crédito, consumo, error, reembolso, duplicado, logout y acceso desde otra sesión.
5. Solo entonces establecer PICGIFT_SALES_ENABLED=true en Supabase (preferiblemente primero con Stripe en test mode).

Hasta ese momento **no hay sistema de cobro real habilitado** y no se entregará ninguna prestación de pago.
