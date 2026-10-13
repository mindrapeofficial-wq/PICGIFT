# PICGIFT · Payments integration 2026

## Alcance actual: solo Google Play (13 de octubre de 2026)

La decisión vigente es comercializar únicamente mediante Google Play. Las referencias a activar Stripe que aparecen más abajo son históricas y quedan fuera de este lanzamiento. Las tres opciones de compra `standard` están activas desde el 13 de octubre; activar el catálogo no modifica los flags del backend ni los horarios de cron. La validación del recorrido completo debe hacerse en el dispositivo.

**Precios de Halloween y cierre pendiente:** se verificaron en Play Console los precios de España de 7,90 €, 19,92 € y 31,92 € para Esencial, Mágico y Familiar. Son precios estáticos de `standard`, sin una oferta adicional ni fecha de finalización automática confirmada. Al terminar la campaña el **31 de octubre de 2026 a las 23:00 UTC**, es necesario restaurar en Google Play Mágico a 24,90 € y Familiar a 39,90 €, y comprobarlo; Esencial permanece en 7,90 €. El cambio de campaña de la web no cambia estos precios en Google Play. Los importes locales de otros países son distintos (por ejemplo, Mágico en Alemania: 23,99 €); no se ha aplicado una modificación masiva ni validado un precio uniforme para toda la zona euro.

La lista de licencia `Galante`, que contiene únicamente `mindrapeofficial@gmail.com`, está seleccionada y guardada. Las compras con los métodos de pago de prueba de una cuenta tester de licencia son simuladas y no generan ingresos. Otras cuentas pueden recibir cargos reales aunque estén en el canal beta. Antes de cada prueba, confirmar en la pantalla de Google la cuenta, el precio y que se está usando el método de prueba previsto. [Documentación oficial de pruebas de Google Play Billing](https://developer.android.com/google/play/billing/test).

Antes de desplegar `picgift-ai-director`, aplicar `supabase/migrations/20261013193000_play_reconciliation_state.sql`. Crea un único estado de continuación privado, con RLS y acceso de lectura/actualización solo para `service_role`; no contiene claves. Después desplegar el director con `_shared/play-reconciliation.mjs` y `picgift-google-play` con `_shared/play-purchase.mjs`.

El cron privado existente `dispatch` también concilia compras; la acción `reconcile_purchases` permite ejecutar un lote con la misma autorización de cron o administrador. Revisa reembolsos de los últimos 29 días (Google limita la consulta a 30), incluidas compras ya consumidas, y reintenta acreditar/consumir pedidos verificados. Conserva cursores de pedidos, página e índice de reembolso en base de datos con comparación de versión. Los lotes recorren como máximo 30 pedidos y 10 páginas; las ventanas se conservan hasta 20 horas para reanudar y luego se renuevan. Los pedidos fallidos vuelven a revisarse tras completar la vuelta, sin bloquear los siguientes.

El presupuesto cooperativo de 45 segundos limita las llamadas a Google y el inicio de nuevas operaciones; no es un timeout rígido de consultas Supabase. `complete` se refiere al lote actual (`scope: batch`), no demuestra que no existan incidencias anteriores. Revisar `errors`, los cursores y `purchases` en la respuesta del director: el envío de notificaciones mantiene su propio resultado aunque falle la conciliación. Una caída continua superior a la ventana de consulta necesita revisión manual de pedidos antiguos.

Los RPC con bloqueo de fila y ledger único impiden acreditar/revertir dos veces. Un reembolso que llega antes de acreditar marca el pedido sin otorgar saldo; si la acreditación gana la carrera, se revierte mediante el RPC. Restaurar una compra ya consumida vuelve a consultar Google. Un fallo de consumo posterior a la acreditación devuelve éxito con `consumption_pending: true`, conserva el saldo y se reintenta.

Verificación local: `node --test tests/play-receipt.test.cjs tests/play-reconciliation.test.cjs tests/notification-delivery.test.cjs`. Estas pruebas usan proveedores y base de datos simulados; no sustituyen la compra de licencia, reembolso y generación/descarga en el móvil. Los términos ES/EN explican compras únicas, entrega, recuperación y reembolsos de Google Play. Antes de producción sigue pendiente confirmar la información fiscal/domicilio comercial y el recorrido real de compra.

## Packs comerciales
| ID | Paquete | Web (EUR) | Créditos | Google Play Product ID |
| --- | --- | ---: | ---: | --- |
| esencial | PICGIFT Esencial | 7,90 € | 1 | picgift_esencial_1 |
| magico | PICGIFT Mágico | 24,90 € | 5 | picgift_magico_5 |
| familiar | PICGIFT Familiar | 39,90 € | 10 | picgift_familiar_10 |

La web muestra precios públicos desde octubre de 2026. `PICGIFT_SALES_ENABLED` controla Stripe y `PICGIFT_GOOGLE_PLAY_ENABLED` controla Android; ambos requieren su proveedor configurado. Mantener las ventas desactivadas hasta completar la validación de generación y compra.

## Pagos web: Stripe Checkout
Supabase PICGIFT: https://supabase.com/dashboard/project/uimrvgrpenccijumyiek/functions
- Función autenticada picgift-checkout. Consulta precios desde la tabla picgift_products, crea pedido pending y Stripe Checkout Session. Nunca confía en importes enviados desde el navegador.
- Webhook picgift-stripe-webhook: URL https://uimrvgrpenccijumyiek.supabase.co/functions/v1/picgift-stripe-webhook. **verify_jwt=false intencionadamente**, pero valida obligatoriamente HMAC-SHA256 Stripe-Signature y antigüedad de 5 minutos. Registrar los eventos checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired y charge.refunded (solo completo).
- Secretos Supabase requeridos: STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET. Configurar webhook en Stripe Dashboard con su signing secret. No publicarlos en GitHub.
- El pago validado otorga créditos mediante picgift_grant_order() e insert idempotente en picgift_credit_ledger. Un reembolso completo revoca el saldo comprado en el libro de créditos. Compras reales sujetas a controles fiscales, recibos y gestión de devoluciones.

**Atención:** la conexión de Stripe en ChatGPT no equivale a configurar automáticamente las claves de Stripe en Supabase. Hasta que estén disponibles esos secretos y se haga una compra de prueba, la integración no está validada de extremo a extremo.

## Compras Android mediante Google Play Billing
- Proyecto fuente Android Studio en android/; AAB beta firmadas disponibles en las entregas del proyecto. La versión 1.8.4-beta usa el código 13 y añade aviso de cancelación de Google Play; necesita instalación para probar ese cambio nativo.
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
1. Completar el recorrido de generación y descarga con un participante autorizado. Hay generación habilitada para participantes de prueba; eso no acredita el recorrido después de comprar.
2. Conectar Stripe, obtener STRIPE_SECRET_KEY, crear el endpoint de webhook y guardar STRIPE_WEBHOOK_SECRET.
3. En la app existente de Google Play Console, definir los productos, configurar la cuenta de servicio y ejecutar una compra de prueba desde la beta firmada.
4. Realizar pruebas de pago, crédito, consumo, error, reembolso, duplicado, logout y acceso desde otra sesión.
5. Solo entonces establecer PICGIFT_SALES_ENABLED=true en Supabase (preferiblemente primero con Stripe en test mode).

Hasta ese momento **no hay sistema de cobro real habilitado** y no se entregará ninguna prestación de pago.

## Verificación del 10 de octubre de 2026

Play Console contiene los tres packs como borrador, con textos en español e inglés y cero opciones activas. Con autorización expresa se creó la cuenta dedicada `picgift-play-billing` y se habilitó la API; la cuenta tiene lectura básica, datos financieros y gestión de pedidos únicamente de PicGift. Los secretos `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` y `GOOGLE_PLAY_PACKAGE_NAME` están guardados en Supabase; la descarga temporal de la clave se eliminó. Los flags de activación siguen pendientes de la prueba controlada y no se ha activado ningún cobro.

La validación exige una unidad comprada y una unidad sin reembolsar, estado PURCHASED, producto y cuenta coincidentes y fecha de compra verificable. No acredita recibos reembolsados, pendientes, de alquiler ni preventa. Al restaurar una compra, la fecha confirmada por Google determina si corresponde el precio previsto de Halloween; el importe almacenado sigue siendo el precio del catálogo, no una conciliación del importe financiero real de Google. La conciliación y los reembolsos posteriores a una acreditación ya consumida requieren validación adicional antes de abrir ventas reales.

Una prueba real de base de datos con rollback comprobó la acreditación, repetición idempotente, una única entrada de crédito y rechazo de pedidos reembolsados e inexistentes. La validación completa aún necesita el recibo de Google, crédito, consumo del producto, reinicio sin duplicados y creación/descarga de una foto.

La interfaz bloquea nuevos pagos mientras está abierto el diálogo o se valida el recibo, comunica cancelaciones y libera los botones ante fallos. Una compra pendiente no concede créditos. Un token cuya validación falla puede recuperarse y volver a verificarse al restaurar compras; no se considera pagado por un evento del navegador.


## Activación independiente de Google Play (9 de octubre de 2026)

`PICGIFT_GOOGLE_PLAY_ENABLED` se configura **solo en Supabase** para abrir compras Android sin abrir Stripe. `PICGIFT_SALES_ENABLED` controla Stripe, no debe utilizarse para activar Google Play. Por defecto, ambos siguen desactivados.

- `GOOGLE_PLAY_PACKAGE_NAME=com.picgift.myapp`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`: credenciales **privadas** de una cuenta de servicio con Android Publisher API habilitada y permisos financieros/de gestión de pedidos en Play Console.
- `PICGIFT_GOOGLE_PLAY_ENABLED=false` hasta que el catálogo y la cuenta de servicio estén preparados. Para ejecutar la compra de prueba, establecer temporalmente true **solo cuando el acceso a la app esté restringido a testers de Play**, realizar las pruebas y volver a false si algo falla. Mantener true para producción exclusivamente después de confirmar créditos, consumo, reinicio, cancelación, pendiente y reembolso.
- `PICGIFT_GOOGLE_PLAY_PROMO_READY=false` hasta confirmar en Play Console precios correctos de la campaña (7,90 €, 19,92 € y 31,92 € en la zona euro). Durante Halloween el backend sigue cerrado para Play si este valor es distinto de true. Los importes visibles de Android proceden de Play Billing, no de precios calculados en la web.

Crear tres **productos de compra única consumibles** en Google Play Console con IDs exactos `picgift_esencial_1`, `picgift_magico_5`, `picgift_familiar_10`, cada uno con opción de compra **activa**. Configurar perfil de pagos de Google, servicio, app `com.picgift.myapp` y publicación en prueba interna. Instalar desde el enlace de Google Play con una cuenta de tester con licencia.

Para probar: activar `PICGIFT_GOOGLE_PLAY_ENABLED=true` únicamente mientras el AAB esté en el canal interno de Google Play y solo tengan acceso testers autorizados. Después de verificar una compra de prueba y su acreditación/consumo sin duplicados, mantenerlo activo al publicar a producción; si la validación falla, desactivarlo inmediatamente. No subir ni compartir claves ni JSON privados en GitHub, ChatGPT, correo o código. Comprobar que las opciones de compra de Halloween muestran precios coincidentes con la campaña antes de marcar `PICGIFT_GOOGLE_PLAY_PROMO_READY=true`.
