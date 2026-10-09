# PicGift: integración Android

## Fase 1 — Base y orden de integración (9 octubre 2026)

Auditoría de `main` en `d74d8a204240942db291c979abf96316bb985f4c`.
La aplicación ya tiene proyecto Kotlin; esta migración amplía sus superficies nativas.

| Área | Base actual | Trabajo pendiente |
| --- | --- | --- |
| Aplicación | `com.picgift.myapp`, código 8, 1.7.0, API mínima 26 y objetivo 36 | Conservar paquete y certificado; comprobar código de Play antes del siguiente AAB |
| Interfaz | `MainActivity`: WebView remoto, carga, errores, insets y Atrás | Integrar Compose de PR #9 y validar navegación/teclado/restauración |
| Google | Credential Manager y OAuth externo de respaldo | Probar audiencia OAuth, certificados de Play, cancelación y sesión en teléfono |
| Fotos | Selector de documentos Android y creador web | PR #10: Photo Picker, galería Compose y recorte local |
| Compras | Billing 9.1.0, tres productos y verificación de servidor | Compras reales de prueba, pendientes, reintentos y cambio de cuenta |
| Notificaciones | Servicio Firebase, permisos y puente web | Envío real con app cerrada, apertura de ruta, baja y renovación de token |
| Entrega | CI Android y workflow manual de AAB firmado | Validación física y distribución por canal interno; generar artefacto no publica en Play |

### Evidencia disponible

- `main`: 33 pruebas Node aprobadas localmente.
- PR [#9](https://github.com/mindrapeofficial-wq/PICGIFT/pull/9), commit `250b5aca6d7d38783ffd4ad83bd2c0553e1c96e5`: job Android de GitHub aprobado.
- PR [#10](https://github.com/mindrapeofficial-wq/PICGIFT/pull/10), commit `ee2fcd9cf4c332f264fea6a7d3f83d8e72d87b13`: 41 pruebas Node aprobadas localmente y job Android de GitHub aprobado.
- Estos resultados no acreditan funcionamiento de Google, pagos, notificaciones o recorte en un teléfono. Las pruebas nuevas incluyen comprobaciones estructurales de código.
- Las dos propuestas estaban abiertas al revisar. #10 incluye la base de #9; evitar implementar de nuevo sus cambios.

### Cambio de esta fase

Ampliar los filtros de CI Android a los scripts y estilos del puente, navegación, pagos, generador, entrada de Google y service worker. Ejecutar las pruebas Node antes de preparar la compilación Android y también antes del AAB firmado. Revisar sintaxis de todos los scripts nativos existentes, incluyendo los que se incorporen con Compose.

## Fase 2 — Integrar las propuestas existentes

Revisar y fusionar #9 primero; actualizar #10 sobre el main resultante, revisar su diferencia y repetir CI antes de fusionarla. Si main cambia durante la integración, volver a comprobar las diferencias. Desplegar los recursos web correspondientes antes de distribuir el nuevo cliente Android.

Validar inicio sin sesión, Google cancelado, sesión persistente, cierre/cambio de cuenta, Atrás, rotación, teclado, enlaces externos y errores de red. Verificar que la galería se vacía al cerrar sesión y no mezcla datos entre cuentas.

## Fase 3 — Completar la experiencia nativa

Validar el recorte con EXIF y fotos grandes, cancelación, selección repetida y entrega del URI al generador. Completar perfil nativo, descarga/compartir y estados sin conexión según lo que quede después de #10. Mantener generación, consentimiento y validación de compras en sus servicios actuales. La galería y el recorte nativos no convierten todavía todas las pantallas en Kotlin.

## Fase 4 — Servicios en dispositivos reales

En canal interno de Play, comprar cada producto con cuentas de prueba y verificar créditos una sola vez; probar cancelación, pendiente, pérdida de red, reinicio y cambio de cuenta. Probar notificaciones en Android 12 y 13+, con permiso denegado y aceptado, app cerrada y sesión cerrada. Registrar dispositivo, versión, resultado y fallo reproducible de cada recorrido.

## Fase 5 — AAB y lanzamiento

Confirmar el mayor versionCode ya subido a Play, configuración Firebase/OAuth y certificado de subida original. Generar AAB firmado del commit validado, instalar desde Play y repetir los recorridos críticos. Publicar progresivamente tras validar el canal de prueba. Conservar el último commit estable y, si se necesita volver atrás, generar una actualización con código superior al publicado.

### Próximo paso

Revisión conjunta de #9 y #10 para su integración. Esta fase no fusiona esas PR, no modifica credenciales y no distribuye una nueva versión.
