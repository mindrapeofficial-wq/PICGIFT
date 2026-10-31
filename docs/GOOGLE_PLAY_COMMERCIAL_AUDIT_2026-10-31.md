# PICGIFT · Auditoría comercial de Google Play · 31-10-2026

**Estado:** auditoría documental y técnica. No equivale a una aprobación de publicación, de declaraciones de datos ni de compras reales. Este archivo no contiene métricas privadas ni credenciales.

## Confirmaciones

1. Google Play Support confirmó el **30-10-2026** el acceso a producción de **PicGift: AI Photo Portraits (`com.picgift.myapp`)**. Acceso a producción no equivale a publicación general ni validación de cobros.
2. IARC notificó el **30-10-2026** que la clasificación de PicGift está publicada en **Google Play**. Global Rating ID: `c224cfc1-f8d2-8535-83e0-3fb6eaa1e967`. El correo **no enumera las edades/etiquetas territoriales**; deben verificarse en Console antes de citarlas.
3. La fuente Android declara `1.9.0`, código `22`, SDK objetivo `36`. La versión instalada y los artefactos firmados deben verificarse aparte.
4. Existe borrador estacional ES/EN en `store-listing/beta-copy.json`. La propuesta genérica para noviembre está en el PR #49 (`store-listing/november-draft.json`), aún en revisión; ninguno de los archivos confirma lo que aparece en Console.
5. La migración de una única prueba Premium por cuenta verificada figura aplicada en Supabase y la función `picgift-generate` figura activa. La existencia del servicio no demuestra que una nueva cuenta pueda completar un retrato en la compilación publicada.
6. La ficha gráfica está archivada en Google Drive, en `PICGIFT/Google Play — PICGIFT — English`: 4 capturas de teléfono, 4 de tablet 7, 4 de tablet 10, 4 de escritorio, icono e imagen promocional. Su README indica que las capturas proceden de **navegador**, no de un Android físico; deben contrastarse con la experiencia real publicada.

## Coherencia comercial

- Política vigente: **una única prueba Premium gratuita por cuenta verificada** (si la generación está disponible); después, **1 crédito por retrato**.
- Packs: Esencial 1, Mágico 5, Familiar 10 créditos. Compras únicas, no suscripciones, a través de Google Play cuando esté habilitado. No presentar una oferta genérica llamada «Foto Gratis» como servicio adicional.
- No declarar precios actuales desde el backend/web: el importe de pago lo devuelve Google Play según territorio y producto.
- La documentación de campaña indica que los precios Halloween para España (7,90 € / 19,92 € / 31,92 €) deben revisarse al terminar el **31-10-2026 a las 23:00 UTC (01-11-2026 00:00 Madrid)**. Restaurar 24,90 € y 39,90 € si corresponde **requiere verificación y acción humana en Console**. No hay prueba de una reversión automática.
- El botón de compra debe permanecer bloqueado cuando el catálogo de Google o el backend de verificación no esté disponible. Una compra en base de datos puede ser de tester; no implica facturación efectiva ni recorrido completo del cliente.
- Comprobar la ausencia de promesas engañosas sobre calidad, resultados garantizados, disponibilidad del estudio o descuentos activos.

## Privacidad y políticas: validar sin modificar declaraciones

- En el repositorio existen `privacy.html`, `terms.html` y `delete-account.html`. La eliminación de cuenta se solicita por correo, requiere verificación y operación humana; enviar/abrir correo no borra datos automáticamente.
- Verificar desde una sesión anónima que `https://picgift.onrender.com/privacy.html` y `https://picgift.onrender.com/delete-account.html` son públicas y se corresponden con las URLs guardadas en Play Console.
- Comprobar realmente los datos de autenticación, fotografías originales, referencias de cara/cuerpo, consentimientos, resultados, pedidos, feedback, presencia/notificaciones y terceros; mapearlos con la declaración **Seguridad de los datos** sin inventar respuestas.
- Comprobar que los usuarios pueden solicitar desde dentro y fuera de la app la eliminación de cuenta y datos, y que soporte puede ejecutar y documentar la eliminación, incluidas las copias conservadas legalmente.
- Para el contenido generado con IA: revisar filtrado, reporte de contenido ofensivo desde la app y etiquetado de activos generados por IA cuando sea exigible.
- Verificar la identidad del responsable y los datos de contacto de privacidad frente a la ficha del desarrollador y las exigencias de los territorios; no sustituir nombres sin aprobación.

## Riesgo técnico a resolver antes de abrir ventas

- En `supabase/functions/picgift-generate/index.ts`, `publicAllowed()` está definido pero no aparece llamado. Verificar si `PICGIFT_PUBLIC_GENERATION_ENABLED` debe ser una barrera para las cuentas generales. El sistema también requiere `PICGIFT_GENERATION_ENABLED` y servicio OpenAI, pero no debe confiarse en el primer flag sin prueba.
- Revisar que la versión desplegada de `picgift-generate` coincida con el repositorio. Una respuesta de error en la versión desplegada aún habla de una foto gratis «de hoy» renovable, mientras que el código fuente vigente dice «única prueba». No desplegar funciones automáticamente por este informe.
- Corroborar registros de compra y consumos con **pruebas de licencia** en dispositivo, incluyendo devolución de créditos por fallo; nunca publicar recibos, cuentas, fotos ni métricas privadas en GitHub.
- Verificar por separado firma AAB, Play App Signing y versión realmente distribuida, más desplegado Render y URL de privacidad.

## Bloqueos de salida y responsables

| Puerta | Estado documental | Prueba pendiente |
| --- | --- | --- |
| Acceso a producción | Confirmado por correo | Disponibilidad pública y release |
| IARC | Aviso oficial de clasificación publicada | Edades y atributos por territorio en Console |
| ES/EN | Dos borradores de ficha | Textos exactos en Console y aprobación |
| Capturas | Archivos en Drive | Capturas fieles del Android instalado |
| Datos/privacidad | Política y web de solicitud documentadas | URLs públicas, datos reales y declaración Console |
| Prueba Premium | RPC/migración y código | Android real, una vez/cuenta y restitución ante fallo |
| Google Play Billing | Código/servicio desplegado | Compra tester, conciliación, créditos, consumo y reembolso |
| Comercialización | Catálogo documentado | Precios por país, fiscalidad, política de reembolsos |
| Generación pública | Configuración condicional | Flags y controles reales para cuentas no piloto |

**No ejecutar publicación, cambios de regulación, precios, secretos, flags o despliegues como consecuencia automática de este documento.**

Referencias oficiales: [Seguridad de los datos y eliminación](https://support.google.com/googleplay/android-developer/answer/10144311), [requisito de borrado de cuenta](https://support.google.com/googleplay/android-developer/answer/13327111), [IA generativa](https://support.google.com/googleplay/android-developer/answer/13985936), [declaración de recursos creados con IA](https://support.google.com/googleplay/android-developer/answer/17262077).
