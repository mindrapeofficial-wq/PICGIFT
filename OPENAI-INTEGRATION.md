# PICGIFT | Motor de IA privado

Motor desplegado directamente en **Supabase Edge Functions** como \`picgift-generate\`.
La fuente de las **recetas visuales maestras** permanece en la tabla privada
\`public.picgift_scene_recipes\` de Supabase; **NO** se publica la tabla ni los prompts en el frontend o GitHub.

## Arquitectura real
- Web y APK: \`generator.js\`, carga autenticada a \`picgift-uploads\`, llamada \`picgift-generate\` con \`action: start\` y consentimiento, sondeo de los jobs y galería privada mediante URLs firmadas.
- IA: análisis de atributos **visibles** con \`gpt-4.1-mini\` (sin identificar ni inferir datos sensibles) y edición de dos imágenes con **\`gpt-image-2.5-sunburst\`** como modelo predeterminado.
- Opciones de tamaño: vertical 1024×1536, horizontal 1536×1024 y cuadrado 1024×1024. Calidad predeterminada: \`high\`. \`xhigh\` y \`max\` se pueden activar únicamente en el backend y pueden aumentar el gasto.
- Verificación automática del resultado: anatomía evidente, cambios faciales visibles y poses infantiles. Si no supera el control, la imagen no se muestra al cliente hasta revisarla. La similitud facial exacta **no está garantizada**.
- Archivos: originales en el bucket privado \`picgift-uploads\`, resultados en \`picgift-generated\`, empleando rutas específicas por usuario y trabajo.

## Activación privada de OpenAI (solo administrador)

En https://supabase.com/dashboard/project/uimrvgrpenccijumyiek/settings/functions
o la sección **Edge Functions → Secrets**, crear estas variables secretas:

- \`OPENAI_API_KEY\`: clave privada personal de la API de OpenAI, creada en https://platform.openai.com/api-keys. No pegarla en ChatGPT, GitHub, Render ni el frontend.
- \`PICGIFT_GENERATION_ENABLED\`: \`true\`.
- \`PICGIFT_PILOT_EMAILS\`: lista de correos **verificados** autorizados, separados por coma. Ejemplo: \`fotografo@example.com\`. Usar el correo con el que inicia sesión la persona que va a probar la IA.

Opcionales:
- \`PICGIFT_IMAGE_MODEL\`: \`gpt-image-2.5-sunburst\` (predeterminado) o \`gpt-image-2.5-flare\`.
- \`PICGIFT_IMAGE_QUALITY\`: \`medium\`, \`high\`, \`xhigh\`, \`max\` (predeterminado \`high\`).
- \`RESEND_API_KEY\` y \`PICGIFT_FROM_EMAIL\`: para notificaciones por correo si se desea habilitarlas posteriormente.

**No activar** \`PICGIFT_PUBLIC_GENERATION_ENABLED\` ni \`PICGIFT_SALES_ENABLED\` durante el piloto. Incluso si uno está habilitado por error, solo la combinación explícita de ambos permite acceder fuera de la lista de prueba. Las cuentas piloto generan sin comprar créditos pero pueden causar costes reales en OpenAI.

No usar créditos de Stripe ni Google Play en el piloto. Dejar los pagos y enlaces de compra desactivados. Limitar las pruebas a 3 por cuenta/24 h y no cargar fotografías de menores sin autorización de sus tutores.

## Pruebas de extremo a extremo
1. Comprobar que la API de OpenAI tenga facturación y permiso para el modelo de imágenes seleccionado.
2. Guardar únicamente `OPENAI_API_KEY` y `PICGIFT_GENERATION_ENABLED=true` en Supabase, si todavía no estaban configuradas. La primera cuenta verificada ya está autorizada en la tabla privada, por lo que no necesita `PICGIFT_PILOT_EMAILS`. Cerrar sesión y volver a entrar en PICGIFT.
3. Con un retrato adulto autorizado y un fondo propio PICGIFT, pulsar «Generar con IA» en \`/#crear\`.
4. Verificar en Supabase que \`picgift_photo_jobs\` avanza \`queued → analyzing → generating → reviewing → completed\` (o \`needs_review\` / \`failed\`).
5. Confirmar que la descarga y eliminación desde \`Mis fotos\` funcionan; que los clientes no autorizados no puedan generar ni acceder al resultado; que Stripe siga inactivo.
6. Revisar las métricas de consumo y el coste real por prueba antes de subir la calidad a \`xhigh\` o \`max\`.

El modo piloto está desplegado y la primera cuenta registrada y verificada ya está autorizada. **No es todavía una generación real probada**; hay que verificar el acceso de la API y revisar el primer resultado con una foto autorizada. La conexión real depende de la clave privada de OpenAI, los secrets de Supabase, la disponibilidad del modelo en la cuenta y una prueba con consentimiento.
