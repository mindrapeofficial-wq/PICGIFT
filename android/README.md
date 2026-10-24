# PICGIFT Android · Google Play Billing

Proyecto Android Studio Kotlin de PICGIFT 1.8.10-beta (código 19). La instalación incluye la interfaz, los escenarios y las dependencias públicas. La navegación, la galería y el editor de encuadre usan Jetpack Compose; el estudio conserva su WebView local y las compras integradas de Google Play Billing 9.1.0.

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

- Android usa **Credential Manager 1.6.0** y **Google ID 1.1.1** para mostrar el selector nativo de cuentas del teléfono. Con sesión válida no vuelve a pedir acceso; sin sesión, abre el selector al iniciar la app. El botón «Elegir mi cuenta Google» permite iniciar el flujo explícito.
- El token ID emitido por Google se intercambia con `supabase.auth.signInWithIdToken({provider:'google',token,nonce})`. El nonce aleatorio se genera en Android y se entrega a Google como SHA-256; Supabase recibe el valor original y valida la firma, audiencia y nonce. Nunca se envía un service-role ni secreto de OAuth al cliente.
- **Configurar Google Cloud Console / Firebase y Supabase antes de publicar:** crear o reutilizar un **cliente OAuth tipo web** del mismo proyecto Google configurado en Supabase Auth → Providers → Google. Comprobar que el ID del cliente web esté autorizado como audiencia del proveedor en Supabase (si hay varios, usar su configuración de IDs admitidos). Configurar también el cliente Android para `com.picgift.myapp` con SHA-1 de **Google Play App Signing** (y SHA-1 de depuración/subida para las pruebas que corresponda).
- El archivo `android/google-web-client-id.txt` contiene el ID OAuth **público** comprobado contra la redirección de Google de Supabase el 24/10/2026. Gradle lo incorpora a `BuildConfig` para Credential Manager. La variable `PICGIFT_GOOGLE_WEB_CLIENT_ID` permite sobrescribirlo en GitHub Actions o Android Studio. Nunca es un client secret. Si se cambia, verificar que **coincida** con el cliente de Supabase; no asumir que el cliente de Firebase y el de Supabase son intercambiables.
- El workflow de Play exige un ID Google verificado (el archivo público o su variable de sobrescritura) y las credenciales privadas existentes de firma `PICGIFT_UPLOAD_*`; así no se distribuye otra versión sin selector configurado. Con instalaciones antiguas o ausencia de Credential Manager se conserva el OAuth mediante navegador externo y el acceso por contraseña.
- Tras generar el AAB **v1.7.0 / código 8**, subirlo al canal cerrado de Google Play y **actualizar desde Play**. Modificar solo la web de Render no actualiza la versión nativa ya instalada.
- Verificar en móvil físico con Google Play Services: primera instalación con varias cuentas, cuenta previamente autorizada, cancelar selector, login/registro con el botón, app reiniciada con sesión y sesión cerrada, volver a abrir, fallo de red y cuenta sin permisos.

## Importar fotografías desde Google Drive (selector de Android)
- El botón `Elegir desde Google Drive` aparece en el estudio dentro de la app Android. Tanto la foto principal como las referencias usan el mismo selector seguro del sistema.
- `MainActivity.onShowFileChooser` utiliza `Intent.ACTION_OPEN_DOCUMENT`, `CATEGORY_OPENABLE`, lectura del URI y filtros JPG/PNG/WEBP. El usuario pulsa **Archivos → menú ☰ → Drive** para abrir las fotos de su cuenta; Drive debe estar disponible en el dispositivo.
- No requiere habilitar Drive API, solicitar el permiso global de Google Drive, manejar refresh tokens ni guardar credenciales de Google. Android entrega permiso temporal de lectura del archivo elegido. La imagen continúa por el flujo existente: previsualización y recorte local, consentimiento y carga privada solo cuando se genera.
- No confundir este selector con el acceso de PICGIFT mediante Google ni con una sincronización del Drive completo. El navegador web de escritorio no recibe un botón Drive ficticio: un Google Picker web real necesita habilitar Picker API, crear cliente OAuth 2.0 web y clave API restringida por dominio; es una integración separada.
- Verificar en Android físico con Drive instalado y sesión iniciada: foto JPG/PNG/WEBP, cargar archivo en la nube no descargado, cancelar, archivo corrupto, archivo superior a 15 MB, referencias opcionales, reiniciar la app y cambiar la foto. No hace falta permiso de almacenamiento ni pedir autorización a todas las carpetas de Drive.
- Los cambios en el WebView nativo requieren una **nueva actualización de Google Play**. La web pública se publica en Render. Desde la beta 1.8.7, Android instala también sus propios archivos web y CSS; tanto estos archivos como el selector cambian mediante una actualización del AAB.


## Android beta v1.8.1 (versionCode 10)

PICGIFT sigue siendo una arquitectura híbrida con interfaz web alojada en Render y funciones Android nativas dentro de `MainActivity`. No se ha sustituido toda la interfaz por Jetpack Compose.

- **Fotografías:** el selector seguro de Android permite galería, archivos, Google Drive y cámara nativa. `ACTION_IMAGE_CAPTURE` escribe una foto temporal mediante `FileProvider` restringido a `cache/camera/`; `ACTION_OPEN_DOCUMENT` limita los archivos externos a imágenes. La app no solicita acceso masivo a fotos ni permiso de cámara para lanzar una aplicación externa.
- **Descargas:** los retratos privados firmados se descargan por HTTPS directamente en `Imágenes/PICGIFT` usando MediaStore en Android 10+; límite 25 MB, sin redirecciones a otros dominios, sin registrar URL privada en logs y sin permisos de almacenamiento. Android 8 y 9 conservan el navegador para descargar.
- **Notificaciones:** las notificaciones de Firebase abren el apartado indicado al pulsarlas, con rutas permitidas y traducción `inspiracion → escenarios`, conservando la autenticación PICGIFT.
- **Google:** continúa Credential Manager con validación de token Google vía Supabase, y su alternativa OAuth/contraseña.
- **Compras:** Google Play Billing conserva la comprobación de compra en el servidor; no se expone ninguna clave privada en el móvil.
- **Seguridad:** WebView confía únicamente en `https://picgift.onrender.com`, no permite acceso genérico a ficheros y conserva el cierre de sesión y almacenamiento privado.

### Pruebas antes de Play Store

El workflow `android-debug.yml` ejecuta pruebas Node, compilación Android, Lint y crea un APK de diagnóstico y AAB sin firma de subida. En un Android real deben probarse: selección Drive y galería, captura con cámara, cancelar el selector, abrir notificación con la app cerrada y abierta, recibir una actualización del token FCM, guardar JPG/PNG en Galería, red lenta y sin conexión, cuenta Google y compras de prueba.

**El código compilado no equivale a una publicación en Google Play.** La actualización requiere `app-release.aab` firmado con la clave de subida registrada de PICGIFT y las credenciales privadas en GitHub Actions. No sustituir con otra clave desconocida. El workflow obtiene la versión de `build.gradle.kts` y publica `picgift-v1.8.10-beta-code19-play-signed` para esta actualización, solo cuando la firma termina correctamente.


## Android beta 1.8.10 (versionCode 19)

Esta actualización incorpora a la aplicación actual los cambios de navegación y galería nativas, encuadre local, recuperación HTTP y selección fiable de fotografías que estaban en propuestas separadas.

- La barra inferior conserva **Crear – Mis Fotos – cámara – Inspiración – Perfil**. Credential Manager, Play Billing, notificaciones y el control de actualizaciones conservan su integración actual.
- La galería nativa muestra los retratos de la sesión activa con sus estados y acciones; las imágenes privadas usan enlaces temporales y deben pertenecer al usuario actual.
- El encuadre se realiza en el dispositivo antes de devolver la selección al estudio. No autoriza ni inicia una subida. El consentimiento existente sigue siendo necesario.
- El Photo Picker sigue siendo prioritario. El respaldo utiliza `ACTION_OPEN_DOCUMENT`, `CATEGORY_OPENABLE`, permisos temporales y JPG/PNG/WEBP. Se recuperan resultados de `parseResult`, `data` y `clipData`; una selección ilegible permite un único reintento, mientras que cancelar no abre otro selector.
- Los errores HTTP del documento principal muestran la pantalla de reintento y cancelan operaciones asociadas a esa página. Los fallos de imágenes y API se gestionan en sus flujos existentes.
- La versión 1.8.10 continúa incluyendo sus archivos de interfaz en la instalación. Publicar Render no actualiza la aplicación instalada.

### Publicar esta actualización

1. Ejecutar las pruebas Node, Android Lint, compilación y verificación de las dependencias de la interfaz instalada.
2. Configurar en GitHub Actions los secretos existentes `PICGIFT_FIREBASE_ANDROID_JSON_B64`, `PICGIFT_UPLOAD_KEYSTORE_B64`, `PICGIFT_UPLOAD_STORE_PASSWORD`, `PICGIFT_UPLOAD_KEY_ALIAS` y `PICGIFT_UPLOAD_KEY_PASSWORD`, El ID Google público está en `android/google-web-client-id.txt`; `PICGIFT_GOOGLE_WEB_CLIENT_ID` es una sobrescritura opcional. No sustituir la clave de subida ni adivinar contraseñas. Se recomienda conservar `PICGIFT_UPLOAD_CERT_SHA256` para comparar el certificado esperado.
3. Ejecutar **PICGIFT · Google Play signed AAB** sobre el commit integrado. El trabajo valida las credenciales antes de compilar, verifica la firma y produce el AAB versionado.
4. Subir ese AAB al canal de pruebas cerrado existente y completar la publicación en Play Console.
5. Actualizar un dispositivo desde Play y comprobar acceso Google, selección/cámara/cancelación, encuadre, galería, cambio de cuenta, una compra de prueba y regreso desde segundo plano.

Los paquetes sin firma y las compilaciones de diagnóstico sirven para validación; la distribución de Play requiere completar los pasos de firma y publicación.
