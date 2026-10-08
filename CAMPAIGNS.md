# PICGIFT · Campañas estacionales

## Estado actual: Halloween 2026
- Web/Android activos con diseño **negro y naranja**.
- Iconografía SVG editable derivada del diseño de regalo y obturador: `assets/halloween/logo-halloween.svg` y `assets/halloween/app-icon-halloween.svg`.
- Escenarios visuales `assets/halloween/scenes/`: bosque de calabazas, castillo embrujado y salón de retratos. Son **ilustraciones conceptuales**, no fotografías de estudio ni fondos listos para generación.
- El catálogo público está en `scenes.json`. La fuente navideña exacta se ha copiado a `archive/navidad/scenes-2026.json`.
- El tema activo se fija con `data-campaign="halloween"` y los estilos complementarios del final de `styles.css`.
- El manifiesto web apunta al icono Halloween; la aplicación Android tiene `@drawable/ic_launcher_halloween`.
- Los cobros siguen **desactivados**. En Halloween, la generación de IA queda **pausada**, en frontend y backend, hasta disponer de fondos y recetas profesionales. Los trabajos y fotos anteriores permanecen en Supabase.

## Navidad 2026, conservada para futuras modificaciones
- Rama GitHub `archive/navidad-2026`: instantánea íntegra anterior al cambio Halloween.
- Catálogo navideño duplicado en `archive/navidad/scenes-2026.json`.
- Imágenes originales de fondo del proyecto disponibles en `assets/scenes/`; las recetas maestras continúan en la tabla privada `public.picgift_scene_recipes` de Supabase.
- No borrar esa rama ni la tabla de recetas navideñas.
- Para seguir desarrollando Navidad: crear una nueva rama basada en `archive/navidad-2026`. Evitar modificar a la vez la campaña pública en `main`.

## Cómo reactivar una campaña de manera segura
1. Preparar el catálogo y las fotos de referencia de la campaña, con licencias verificadas.
2. Revisar las recetas privadas correspondientes en Supabase antes de habilitar ningún ID de escena.
3. Publicar el frontend de esa campaña y verificar su botón de generar, comprobaciones de edad y tamaño, almacenamiento privado y galería.
4. Cambiar `public.picgift_campaign_state.active_campaign` a la campaña correcta **solamente después** de confirmar el despliegue de sus recetas. Esta tabla tiene RLS y no se consulta desde navegadores anónimos.
5. Mantener Stripe y Google Play independientes y apagados hasta completar las pruebas de generación, facturación y reembolsos.

No activar Halloween reutilizando recetas navideñas: generaría fotografías inconsistentes y cargaría costes reales a la API de OpenAI.
