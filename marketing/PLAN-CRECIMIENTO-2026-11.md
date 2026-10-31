# PICGIFT · Plan de crecimiento tras la publicación (noviembre 2026)

**Estado:** propuesta operativa para revisión, no campaña activada ni cambios en Google Play.  
**Producto:** Android `com.picgift.myapp` · [Google Play](https://play.google.com/store/apps/details?id=com.picgift.myapp).  
**Objetivo:** adquirir usuarios satisfechos y validar las primeras ventas **sin prometer servicios aún bloqueados**.

## Principio de lanzamiento

**Primero, experiencia real; después, alcance.** No comprar tráfico ni anunciar packs hasta validar una generación final en un dispositivo Play y un flujo de compra de prueba completo. Las métricas privadas de usuarios/pedidos se gestionan fuera de este repositorio público.

La documentación actual distingue:
- Una **prueba Premium** por cuenta verificada bajo las condiciones del backend, no «cinco fotografías gratis».
- Compras de Google Play configuradas, cuya disponibilidad efectiva depende de validaciones y flags de servicio. Estar «activo» en un catálogo no equivale a tener cobros públicos.
- Campaña Halloween en `main`. La rama `archive/navidad-2026` y `archive/navidad/scenes-2026.json` guardan trabajo navideño. Muchas escenas navideñas están marcadas `previewOnly` y algunas imágenes tienen verificación de licencia/resolución pendiente.
- Materiales originales de ficha en Drive y propuesta previa en `store-listing/beta-copy.json`.

## Fase 0 · 31 octubre–2 noviembre · Puertas de salida (P0)

Marcar cada puerta como **PASS** con prueba reproducible. Si falla una, continuar únicamente con contenido de presentación no transaccional.

- [ ] **Instalación real:** instalación pública de Google Play, apertura, actualización, cambio ES/EN, inicio de sesión, recuperación y tutorial.
- [ ] **Foto real:** adulto de prueba con consentimiento, preflight, carga segura, generación y resultado completo; comprobar tiempo, calidad, almacenamiento y descarga/compartir.
- [ ] **Prueba Premium:** una por cuenta verificada; impedir abuso, recuperarla correctamente tras fallo y explicar sus límites en la interfaz.
- [ ] **Google Play Billing:** compra con usuario de licencia, validación de token, crédito, consumo, restauración, reinicio, cancelación, operación pendiente y reembolso; el recibo simulado no es facturación real.
- [ ] **Seguridad y privacidad:** contraste de ficha Play «Seguridad de los datos» con tráfico TLS real, fotografías privadas, eliminación de cuenta/datos, formularios de consentimiento y derechos de imagen.
- [ ] **Precios y promociones:** la documentación de `PAYMENTS.md` indica que 19,92 € y 31,92 € eran precios de Halloween, estáticos en Play Console. Tras el cierre indicado allí (31-oct 23:00 UTC = 1-nov 00:00 Madrid), restaurar 24,90 € / 39,90 € en Play Console, si corresponde. Revisión humana obligatoria; no inventar una promoción activa.
- [ ] **Costes:** registrar coste medio por retrato completo, reintentos, almacenamiento y tasas de Play. Definir margen y límite de gasto API antes de escalar.
- [ ] **Observabilidad:** registro sin fotos/datos personales de fallos por etapa, disponibilidad del backend y latencia de resultado.

**Responsables:** desarrollo valida Android/Supabase; propietario verifica Play Console y las pruebas de pago con método de licencia. No cambiar flags comerciales o precios de manera automatizada sin aprobación y pruebas.

## Fase 1 · 3–7 noviembre · Presentación y producto (P1)

- [ ] Preparar una ficha de Google Play **sin lenguaje de Halloween permanente**: títulos, descripción breve, descripción larga y capturas reales de Android en ES/EN. Borrador: `store-listing/november-draft.json`.
- [ ] Preparar tres demostraciones con adultos/fotografías con consentimiento o modelos ficticios marcados como ejemplos. No publicar imágenes de menores sin autorización legal expresa.
- [ ] Revisar `archive/navidad/scenes-2026.json`: fondos con permiso comercial, resolución suficiente, recetas privadas correctas, resultados de prueba y compatibilidad móvil. **No activar la campaña por cambiar un JSON o la web.**
- [ ] Publicar una landing breve que explique para quién es PICGIFT, cómo funciona, qué es gratuito *si la prueba ya funciona*, transparencia de compra y acceso a Play.
- [ ] Preparar respuestas a soporte y un canal de ayuda privado. Solicitar valoración sin premios o recompensas y solo tras una buena experiencia real.

## Fase 2 · 8–15 noviembre · Captación orgánica (P2)

- [ ] Tres piezas cortas por semana que demuestren resultado real: foto original (autorizada) → escenario → retrato final. Etiquetar IA cuando corresponda.
- [ ] Dos publicaciones educativas por semana: cómo hacer una buena foto, poses/encuadres, consentimiento y privacidad.
- [ ] Contactar individualmente con 10–15 microcreadores relevantes de regalos personalizados/fotografía/familia. No enviar spam ni mensajes masivos y declarar colaboraciones pagadas si las hay.
- [ ] Distribuir en Instagram Reels, TikTok y YouTube Shorts; adaptar formato a cada plataforma. **No programar** hasta existir cuentas oficiales PICGIFT conectadas y piezas aprobadas.
- [ ] Revisar semanalmente comentarios auténticos y problemas de onboarding.

## Fase 3 · 16–30 noviembre · Escalar únicamente si el embudo funciona (P3)

- [ ] Tras demostrar compras públicas y margen positivo, experimento acotado de anuncios: por ejemplo 5 €/día por 7 días (máximo 35 €), sujeto a aprobación expresa del presupuesto.
- [ ] Una única hipótesis por test: portada o texto, no mezclar cinco cambios. Google Play Console ofrece experimentos de ficha, pero con poco tráfico suelen requerir más datos.
- [ ] Comparar instalación → registro → generación completa → compartir → compra verificada. Evitar optimizar únicamente clics o seguidores.
- [ ] Revisar ASO y anuncios sin afirmaciones falsas, descuentos ficticios ni reseñas incentivadas.

## Embudo de medición recomendado

| Etapa | Evento recomendado | Cómo medirlo |
| --- | --- | --- |
| Adquisición | Vista e instalación | Google Play Console, fuente de adquisición |
| Activación | `sign_up_complete` | Evento agregado sin email/foto |
| Prueba | `portrait_preflight_pass`, `portrait_started` | Eventos de aplicación sin datos sensibles |
| Valor | `portrait_completed`, `portrait_saved` | Backend, éxito real y latencia |
| Viralidad | `share_tap` | Compartidos voluntarios, sin subir contactos |
| Monetización | `purchase_started`, `purchase_verified`, `refund` | Google Play + conciliación privada |

Estos nombres son **propuestas**, no afirmación de instrumentación ya implementada. Separar cuentas registradas, usuarios activos y descargas; nunca tratarlos como sinónimos.

**Objetivos piloto para discutir:** 100 instalaciones reales, 40 usuarios que completan un retrato, 10 compartidos y 3 compras. No son previsiones. Evaluar calidad, margen, abandono y tasa de soporte antes de ampliar la captación.

## Guardarraíles de campaña

- No usar «cinco gratis», «sin límites», «compra disponible», «descuento activo» o «Navidad lista» sin verificaciones de producción.
- Si se usa una imagen sintética como ejemplo, indicarlo. No presentar un mockup como resultado de un cliente ni usar comparativas que aparenten calidad de pago distinta donde no existe.
- Respetar derechos de imagen, privacidad y autorización de representantes legales de menores; la app está destinada a adultos.
- No compartir por GitHub informes privados, tokens, emails, fotos de usuarios ni datos financieros.
- No modificar `main` automáticamente, activar compras, enviar emails promocionales ni publicar redes sociales desde este documento.

## Fuentes de trabajo

- [CAMPAIGNS.md](../CAMPAIGNS.md) · campañas y bloqueos de Halloween.
- [PAYMENTS.md](../PAYMENTS.md) · catálogo y comprobaciones de facturación.
- [README.md](../README.md) · Android y condiciones comerciales.
- [Borrador de ficha anterior](../store-listing/beta-copy.json).
- [Experimentar con la ficha](https://support.google.com/googleplay/android-developer/answer/12053285).
- [Crear fichas personalizadas](https://support.google.com/googleplay/android-developer/answer/9867158).
