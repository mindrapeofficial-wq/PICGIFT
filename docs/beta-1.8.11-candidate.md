# PicGift 1.8.11-beta / código 20: candidata, no publicada

Revisión del 24 de octubre de 2026 sobre la PR #47 (`fix/beta-feedback-20261024`).
Base de esta continuación: commit `653e7529e1e99bf9d3dfd21b25f3a342c8692f73`.

## Cambios adicionales

- La caché web incluye `beta-feedback.js` y `announcements.js`; cambia de revisión para retirar el shell anterior. Los callbacks de autenticación, las peticiones con Authorization, las fotos privadas y las peticiones entre orígenes no entran en ella.
- El formulario impide envíos simultáneos desde la misma instancia. Una respuesta tardía no confirma ni borra el borrador de otra cuenta.
- Novedades permite un reintento explícito cuando falla la carga, sin esperar el intervalo normal. Las peticiones concurrentes siguen deduplicadas y las respuestas de cuentas anteriores se descartan.
- Los controles de novedades cambian entre español e inglés. Los textos de los avisos publicados no se traducen automáticamente.
- Versión candidata Android: `1.8.11-beta`, código `20`. En Gradle solo se han cambiado esas dos líneas. No se han alterado el paquete, dependencias, identificador de Google ni claves de firma.
- Una acción compartida `.github/actions/beta-quality` verifica sintaxis, siete pruebas de caché/configuración y las regresiones de navegador antes de generar el APK/AAB. Los dos workflows Android la ejecutan como paso obligatorio, sin `continue-on-error`.
- El workflow de firma mantiene el keystore original, la validación de Firebase, la comprobación de firma y la comparación opcional de certificado existentes. Las nuevas pruebas terminan antes de descodificar material de firma. Se conservan los pasos originales de suite completa, lint y verificación de assets.

## Evidencia ejecutada en esta continuación

1. Se repitieron las 16 comprobaciones originales en Chromium: aprobadas.
2. La suite ampliada aprobó 21 comprobaciones de comportamiento. Autenticación, datos y compartición están simulados. Usa código real de los componentes sobre un DOM representativo, no la interfaz completa de la app.
3. Siete pruebas Node de caché pública/privada, disponibilidad offline de los módulos, retirada de cachés antiguas, límites de la ficha, versión y orden de los controles de compilación: aprobadas.
4. Sintaxis JavaScript y Python y estructura YAML: comprobadas localmente.
5. Se comparó por SHA de blob la reconstrucción de los workflows originales y de Gradle: coinciden antes de aplicar los cambios descritos.

### Límite explícito del navegador local

El navegador de este entorno rechaza navegación HTTP a localhost con `ERR_BLOCKED_BY_ADMINISTRATOR`. Se utilizó la opción explícita `PICGIFT_TEST_IN_MEMORY=1` para las 21 comprobaciones de lógica. La prueba adicional de carga real de módulos HTTP y `import()` queda marcada como **omitida**, no aprobada.

En CI, `PICGIFT_TEST_IN_MEMORY` está fijado a `0`: el navegador debe cargar la página y sus módulos desde el servidor local de pruebas y superar también esa comprobación. No se rebaja la validación de CI al modo restringido. El servidor de pruebas solo escucha en `127.0.0.1`.

## Pendiente y límites de entrega

No se ha compilado Android en este entorno. No se ha generado, firmado, subido ni publicado un APK/AAB nuevo. El número 20 es una candidata posterior al código 19 del repositorio; antes de subirla hay que comprobar que sigue libre en Play Console.

No se considera completada la suite integral del repositorio por haber superado las pruebas enfocadas. Hay que ejecutar los workflows de la PR, revisar sus logs y artefactos, y validar la instalación desde el canal de Play con Google real, cancelación/retorno, contraseña/recuperación, creación, descarga y compras de prueba.

El borrador ASO no se ha publicado. El formulario requiere revisar privacidad y Data safety, y disponer de una operación de soporte que atienda sus mensajes. La tabla de comentarios se creó y verificó en la intervención anterior; no se ha cambiado la base de datos ni se han enviado notificaciones en esta continuación.

No se debe fusionar ni lanzar a producción basándose exclusivamente en estos resultados enfocados. La última compilación completa documentada en el README sigue correspondiendo a 1.8.10; este documento distingue la candidata posterior de una versión construida y validada.

## Comandos reproducibles

En un checkout completo con Python/Playwright y navegador instalados:

```sh
node --test tests/beta-release.test.cjs
python tests/beta-feedback.browser.py
node --test tests/*.test.cjs
gradle -p android --no-daemon :app:lintRelease :app:assembleDebug :app:bundleRelease
node scripts/verify-android-bundle.cjs
```

El comando de Gradle genera un AAB sin firma de subida cuando no se proporcionan las variables privadas originales. Ese AAB no es una entrega válida para Play. Para una prueba local con la misma restricción de navegación, se puede usar el modo en memoria; su salida deja constancia de la prueba HTTP omitida.
