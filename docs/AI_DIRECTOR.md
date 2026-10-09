# PICGIFT · Dirección creativa autónoma con aprobación humana

## Estado (9 octubre 2026)

Servicio `picgift-ai-director` desplegado en Supabase. Web Render `picgift` publica el panel administrativo y la bandeja de novedades.

- Cron `picgift-ai-director-daily`: `0 8 * * *` UTC, una propuesta de fondo al día (alta calidad). La zona utilizada para identificar el día es Europe/Madrid.
- Cron `picgift-ai-outbox-dispatch`: cada 10 minutos, vacía la cola de avisos pendientes.
- Cron autenticado con token secreto conservado en Supabase Vault. Solo se almacena un hash en `picgift_ai_cron_auth`.
- El administrador abre `https://picgift.onrender.com/admin.html`. El frontend requiere sesión confirmada y el backend verifica `picgift_admin_users`.
- La IA genera propuestas de escenario, notificación, campaña y, si surge una temática novedosa, categoría. Nunca publica ni envía campañas sin aprobación.
- Las imágenes generadas se guardan en el bucket **privado** `picgift-ai-drafts` y se muestran al admin con URL firmada de corta duración.
- Al aprobar un escenario, su fotografía se copia a `picgift-catalog`, se publica la ficha en `picgift_catalog_scenes` y se guarda su receta privada en `picgift_scene_recipes` con **enabled=false**.
- **Importante:** un fondo nuevo es visible como inspiración, no como foto generable, hasta las pruebas de composición reales y la habilitación de su receta y lista de poses. Esto evita prometer generación defectuosa.
- Al aprobar categoría, se guarda en `picgift_catalog_categories`.
- Al aprobar un comunicado, se inserta en `picgift_ai_notifications_outbox` con destino `all`.
- Triggers en `picgift_catalog_scenes` y `picgift_catalog_categories` generan automáticamente avisos. Los avisos aprobados o provocados por una publicación aparecen inmediatamente en `picgift_announcements` (visible en la bandeja de usuarios autenticados), incluso si no aceptan push.
- Si un usuario activa las notificaciones Android y su dispositivo queda registrado en `picgift_notification_devices`, el backend distribuye el mismo aviso por Firebase Cloud Messaging.
- Cuando se crea propuesta, se encola una notificación para los dispositivos del admin; la bandeja administrativa funciona sin móvil registrado.
- Los mensajes de campañas no deben anunciar descuentos, cupones ni ofertas que no estén realmente configurados. El administrador puede editar antes de aprobar.

## Fuente y cambios

- Backend: `supabase/functions/picgift-ai-director/index.ts`.
- Cron: Supabase `cron.job`; credencial secreta `vault.secrets`, nunca compartirla.
- Backend de retratos original: `picgift-generate`. No activar automáticamente generación de escenas IA sin probar el montaje.
- Revisión: `admin.html`, `ai-director-admin.js`.
- Catálogo público: `app.js` carga escenas estáticas y `picgift_catalog_scenes`.
- Novedades: `announcements.js` y estilos en `styles.css`.

## Verificaciones

1. El primer cron manual 2026-10-09 devolvió HTTP 200 y creó fondo y propuestas en estado `pending`. La imagen se guardó en bucket privado.
2. Pruebas transaccionales con rollback verificaron la creación de avisos para aprobaciones públicas y las inserciones de escenas y categorías, sin publicar elementos de prueba.
3. Las comprobaciones de sintaxis de `app.js`, `ai-director-admin.js` y `announcements.js` se completaron correctamente.
4. Los archivos del sitio están en la rama `main`, con autodeploy de Render.

## Restricciones operativas

- Coste: cada ejecución diaria exitosa consume modelos de texto e imagen en la API; controlar el gasto desde el proveedor. La tarea usa una imagen Premium al día como máximo.
- Los usuarios deben iniciar sesión para leer los anuncios dentro de la app y aceptar permiso para recibir FCM.
- Si no hay dispositivos inscritos, ningún push será entregado, pero el anuncio aprobado seguirá en la bandeja interna.
- La cola de FCM procesa un máximo de 500 dispositivos por lote. El crecimiento por encima de esta cifra requiere paginación y colas por destinatario.
- Evitar mensajes de promoción repetitivos y exigir revisión legal/comercial humana de ofertas o precios antes de publicar.
