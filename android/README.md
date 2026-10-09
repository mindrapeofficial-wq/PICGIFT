# PICGIFT Android · Google Play Billing

Proyecto Android Studio Kotlin de una app que carga https://picgift.onrender.com en un WebView y conecta las compras integradas de Google Play Billing 9.1.0.

Antes de compilar:
1. Abrir carpeta android en Android Studio y sincronizar Gradle.
2. Mantener el paquete/applicationId de Google Play: com.picgift.myapp.
3. Crear la aplicación en Google Play Console y configurar 3 productos de compra única consumibles:
   - picgift_esencial_1
   - picgift_magico_5
   - picgift_familiar_10
4. Configurar los precios locales y un canal de pruebas interno con cuentas de prueba.
5. Configurar en Supabase los secretos GOOGLE_PLAY_PACKAGE_NAME y GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (con acceso Android Publisher API), además de PICGIFT_SALES_ENABLED=true *solo cuando toda la generación IA y los pagos estén verificados*.
6. Construir AAB / APK firmado desde Android Studio y verificar compras en canal interno. No usar Stripe Checkout desde la app distribuida por Google Play para estos artículos digitales, salvo que se aplique un programa de facturación alternativa específico y aprobado.
7. Testear las compras, reintentos, compras pendientes, consumos y el estado tras cierre/reinicio; la restauración de compras sin consumo necesita un procedimiento de soporte. La función backend valida y consume al acreditar créditos.

La comunicación web/Android usa AndroidX WebViewCompat.addWebMessageListener, restringido al origen https://picgift.onrender.com y a marcos principales. Android no almacena secretos de Stripe ni de Google Play Publisher. Los tokens de compra se verifican desde Supabase, nunca en el navegador.

NOTA: La carpeta es código fuente para el proyecto de Android Studio; no contiene un APK compilado, certificado ni publicación en Play Store.

## Mejoras móviles (octubre de 2026)
- WebView incorpora WebChromeClient.onShowFileChooser para que el selector `<input type=file>` de PICGIFT pueda elegir fotografías de la galería de Android, sin solicitar permisos de almacenamiento.
- Navegación Atrás mediante historial WebView, restauración de estado al recrear Activity y apertura de descargas privadas desde el navegador Android.
- Desde 1.5.0, el botón Google utiliza OAuth con PKCE y el navegador externo. El verificador permanece en el almacenamiento del WebView; el navegador conserva solo el estado de solicitud y devuelve un código de autorización de un solo uso. El enlace `com.picgift.myapp://auth` solo se acepta con el estado pendiente correcto, durante diez minutos. No se envían tokens de sesión por enlaces. El callback de Supabase sigue siendo `https://picgift.onrender.com/`; no necesita un nuevo cliente OAuth de Android. Publicar `android-login.html`, `android-login.js`, `native-auth-return.js` y `native-auth.css` antes de distribuir esta versión.
- PWA web: se puede usar una demo privada sin registrarse, antes de activar generación IA. Crear fotos finales y galería remota sí requieren sesión.
- Probar en un dispositivo real: Google → «Volver a PICGIFT» → cuenta activa, cancelación, reinicio durante el acceso, selección de fotos y descargas. Las APK antiguas requieren actualizar para utilizar Google; correo y contraseña siguen disponibles.
