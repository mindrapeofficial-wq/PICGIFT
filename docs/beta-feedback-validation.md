# Respuesta al informe de Testers Community

Fecha: 24 de octubre de 2026. Base: `0697b20f3d7a0f845c5f645eefabfed359c38b19`, PR #46, Android 1.8.10-beta / código 19.

## Cambios y alcance

| Informe | Trabajo preparado | Validación que queda |
| --- | --- | --- |
| ASO | Título, descripción corta y completa en español e inglés, `store-listing/beta-copy.json`. Longitudes comprobadas contra 30/80/4000 caracteres. | Revisar y publicar en Play Console, con capturas reales. No se ha medido volumen de palabras clave ni publicado la ficha. |
| Visibilidad de contraseña | Controles independientes con icono, texto accesible ES/EN, estado pulsado, área mínima 44 px y ocultación al cerrar/cambiar formulario o mandar la app al fondo. | Confirmar TalkBack, teclado y contraste con la interfaz completa en Android. |
| Google | Eliminada la ocultación prematura del botón mientras Android anuncia sus capacidades. Alternativa explícita para utilizar el flujo de navegador existente, sin quitar PKCE, estado ni autorización del registro. | Autenticación completa en instalación de Play, firma de Play, OAuth, cancelación y retorno del navegador. No se afirma que esta carrera fuera la única causa del informe. |
| Tutorial | Se conserva `first-steps.js` y se añade acceso para volver a abrirlo desde Ayuda y comentarios. | Recorrer el tutorial con un retrato real y comprobar la experiencia nativa completa. |
| Rendimiento | Novedades con peticiones concurrentes deduplicadas, límite de frecuencia, pausa sin conexión/en segundo plano y rechazo de respuestas de otra cuenta. | Medir generación real, memoria, batería y latencias. Esto no demuestra que la generación de retratos sea más rápida. |
| Compartir | En navegadores compatibles se prepara una copia y se pide una segunda pulsación para compartir el archivo. Nunca se entrega la URL firmada al mecanismo de compartir. | Android WebView sin Web Share conserva descarga autenticada y uso posterior de Galería. No se ha implementado un nuevo panel nativo de compartir. |
| Comentarios | Formulario privado para errores, sugerencias, acceso y rendimiento. Conserva el texto al fallar. Correo de soporte para quien no puede entrar. Tabla con propietario impuesto en servidor y antispam. | Probar envío completo desde APK y operación de soporte. No existe bandeja administrativa nueva ni aviso automático de recepción para el administrador. |
| Comunicación | Acceso a novedades desde ayuda; manejo de fallos, estado por cuenta y navegación existentes. | Publicar avisos reales cuando corresponda. No se han enviado notificaciones ni boletines. |

## Base de datos: cambio ya aplicado

La migración `picgift_private_app_feedback` está aplicada al proyecto PICGIFT `uimrvgrpenccijumyiek`. Su SQL se conserva en `sql/picgift-private-app-feedback.sql`. No volver a ejecutarlo en el mismo proyecto. El resto de tablas, usuarios, fotos y compras no se ha modificado.

Se comprobó mediante una transacción real y posterior ROLLBACK: inserción/lectura del propietario; límite de 3 mensajes en 10 minutos; rechazo de propietario impuesto por el cliente; rechazo de UPDATE/DELETE del cliente; aislamiento entre cuentas; denegación de lectura anónima. Los mensajes de prueba no se conservaron. También hay un límite de 10 mensajes diarios en el código, no ejercitado separadamente por esa prueba.

Los comentarios no adjuntan fotos, contraseñas, tokens ni diagnósticos. El formulario informa de su vinculación a la cuenta y de la eliminación al borrar la cuenta. Soporte debe atender las solicitudes de borrado. Revisar las declaraciones de privacidad/Data safety antes de publicar una versión con esta recogida de comentarios.

El asesor de seguridad no señaló la nueva tabla. Conserva un aviso previo sobre protección de contraseñas filtradas desactivada y avisos informativos de tablas internas con RLS sin políticas. No se han abierto esas tablas ni cambiado opciones de autenticación.

## Pruebas ejecutadas

- `node --check` en los cuatro scripts modificados/nuevos: aprobado.
- `CHROMIUM_EXECUTABLE=/usr/bin/chromium python tests/beta-feedback.browser.py`: 16 comprobaciones aprobadas.
- Límites de ficha: ES 24/77/2126 y EN 27/75/1889 caracteres, respectivamente título/corta/completa.
- Pruebas de permisos de base de datos indicadas arriba: aprobadas con reversión de los datos de prueba.

Las pruebas de navegador ejecutan el código real modificado en un DOM de regresión representativo, con servicios de autenticación, base de datos y compartición simulados. Comprueban controles, consentimiento, formulario, cambios de cuenta, peticiones de novedades y el diálogo a 320/390/768 px. No son una prueba de OAuth real ni del diseño completo de la aplicación. El servidor HTTP de la prueba no contiene credenciales; la ejecución usa una página de prueba en memoria.

La prueba de Google confirma que se llama al flujo existente, no que Google lo acepte. El flujo de PKCE sigue siendo el de Supabase y MainActivity; no se reemplaza por tokens inventados. Las pruebas no compran créditos ni generan retratos.

## Entrega y puertas de publicación

El código de esta revisión no actualiza la app ya instalada. No se ha compilado ni firmado un AAB nuevo en esta sesión. La versión Android sigue siendo 19 y debe incrementarse antes de publicar la siguiente beta. El proyecto incluye los nuevos archivos raíz en sus assets por la lista pública de Gradle. La web se despliega separadamente; revisar la actualización de caché al publicar.

Antes de declarar cerrado el informe: revisar la PR y sus comprobaciones, ejecutar la suite existente completa y compilación/lint Android, aumentar versión, conservar la clave original, instalar desde el canal de Play y probar acceso Google/contraseña/recuperación, creación y descarga reales, soporte y novedades. Verificar el diseño completo y accesibilidad en los dispositivos de la beta. Publicar la ficha revisada por separado. No se ha aprobado ni ejecutado un lanzamiento a producción.

El nuevo componente bilingüe gestiona su propia copia ES/EN y marca sus nodos con `data-no-translate`; no modifica los diccionarios de mensajes existentes ni sus valores canónicos.

Referencias técnicas consultadas:
- Google Play, creación y ficha: https://support.google.com/googleplay/android-developer/answer/9859152?hl=en
- Android, Google Credential Manager: https://developer.android.com/identity/sign-in/credential-manager-siwg
- Supabase, Google Auth: https://supabase.com/docs/guides/auth/social-sign-in/auth-google
- Web Share: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share
- Supabase, contraseñas: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
