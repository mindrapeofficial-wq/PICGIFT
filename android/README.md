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

## Notificaciones Firebase (v1.6.0)
- El proyecto Firebase del servicio de envíos es `picgift-a7fda`. Registrar dentro de él la app Android **`com.picgift.myapp`** y descargar el `google-services.json` de esa aplicación.
- Guardar `android/app/google-services.json` **localmente**, fuera de Git. Para GitHub Actions, configurar el secreto `PICGIFT_FIREBASE_ANDROID_JSON_B64` con el contenido JSON codificado en base64, de una sola línea. El workflow valida ID de proyecto y paquete.
- Una compilación de diagnóstico sin JSON sigue compilando pero no registra dispositivos. Una compilación **firmada** con keystore está bloqueada si falta este archivo para evitar distribuir notificaciones inoperativas.
- El SDK solicita permiso solo cuando el usuario habilita notificaciones en Perfil > Notificaciones. Los tokens se registran ante Supabase usando su sesión, nunca con secretos de Firebase en el móvil. Al desactivar la preferencia o cerrar sesión se elimina el registro del dispositivo.
- Confirmar que la función privada `picgift-notifications` en Supabase tenga `FIREBASE_SERVICE_ACCOUNT_JSON` configurado para el mismo proyecto. **No colocar esa cuenta de servicio en Git ni en el .aab.**
- Verificar en un Android 13+ y un Android 12: permiso, registro en la tabla `picgift_notification_devices`, notificación de prueba con app cerrada, navegación, rotación del token, exclusión tras cierre de sesión y recarga de la app.

## Selector nativo de cuentas Google (v1.7.0, versionCode 8)

- Android usa **Credential Manager 1.6.0** y **Google ID 1.2.1** para mostrar el selector nativo de cuentas del teléfono. Con sesión válida no vuelve a pedir acceso; sin sesión, abre el selector al iniciar la app. El botón «Elegir mi cuenta Google» permite iniciar el flujo explícito.
- El token ID emitido por Google se intercambia con `supabase.auth.signInWithIdToken({provider:'google',token,nonce})`. El nonce aleatorio se genera en Android y se entrega a Google como SHA-256; Supabase recibe el valor original y valida la firma, audiencia y nonce. Nunca se envía un service-role ni secreto de OAuth al cliente.
- **Configurar Google Cloud Console / Firebase y Supabase antes de publicar:** crear o reutilizar un **cliente OAuth tipo web** del mismo proyecto Google configurado en Supabase Auth → Providers → Google. Comprobar que el ID del cliente web esté autorizado como audiencia del proveedor en Supabase (si hay varios, usar su configuración de IDs admitidos). Configurar también el cliente Android para `com.picgift.myapp` con SHA-1 de **Google Play App Signing** (y SHA-1 de depuración/subida para las pruebas que corresponda).
- En GitHub: Settings → Secrets and variables → Actions → **Variables** → `PICGIFT_GOOGLE_WEB_CLIENT_ID` = ID OAuth web terminado en `.apps.googleusercontent.com`. Es un identificador público, nunca un client secret. En Android Studio se puede establecer como variable de entorno antes de compilar; si falta, la app intenta `default_web_client_id` generado por el plugin `google-services` a partir de `google-services.json`. Verificar que **coincida** con el cliente de Supabase; nunca asumir que el cliente de Firebase y el de Supabase son intercambiables.
- El workflow de Play exige explícitamente la variable `PICGIFT_GOOGLE_WEB_CLIENT_ID` y las credenciales privadas existentes de firma `PICGIFT_UPLOAD_*`; así no se distribuye otra versión sin selector configurado. Con instalaciones antiguas o ausencia de Credential Manager se conserva el OAuth mediante navegador externo y el acceso por contraseña.
- Tras generar el AAB **v1.7.0 / código 8**, subirlo al canal cerrado de Google Play y **actualizar desde Play**. Modificar solo la web de Render no actualiza la versión nativa ya instalada.
- Verificar en móvil físico con Google Play Services: primera instalación con varias cuentas, cuenta previamente autorizada, cancelar selector, login/registro con el botón, app reiniciada con sesión y sesión cerrada, volver a abrir, fallo de red y cuenta sin permisos.
