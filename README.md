# PICGIFT · App Navidad 2026

Prototipo mobile-first publicado como web estática en Render. Esta versión rediseña la interfaz y conserva Supabase Auth, incluido Google OAuth. Ya incluye un flujo de generación IA protegido y desplegado en Supabase Edge Functions, pendiente de activar con una clave del proveedor y de validar mediante pruebas reales. Los pagos todavía no están implementados.

## Pantallas
- Inicio: campaña Christmas 2026 y escenarios destacados.
- Escenarios: catálogo filtrable Clásicos / Fantasía / Invierno.
- Crear: subida local JPG/PNG/WebP máximo 15 MB, decorado, vestuario, formato y pose.
- Resultado: maqueta visual claramente identificada como prototipo, sin imagen generada ni cobro.
- Mis fotografías: estado vacío preparado para generación/descarga.
- Cuenta: email de sesión, cierre de sesión y avisos.
- Créditos: licencias fotográficas y limitaciones del prototipo.

## Seguridad
Las fotografías seleccionadas no se suben al servidor, solo se previsualizan en el navegador. Ningún JSON maestro ni prompt privado se publica en el repositorio. No introducir secretos OAuth, credenciales privadas o claves service_role en el código.
Antes de lanzamiento comercial: términos, privacidad, consentimientos verificables, retención y borrado de imágenes infantiles, almacenamiento privado, RLS y validación de pagos. Se debe rotar cualquier Client Secret compartido anteriormente.

## Imágenes
Fotografías provisionales de Unsplash seleccionadas entre imágenes libres, con créditos y enlaces por autor en scenes.json. No representan los escenarios finales. Los enlaces image4k solicitan 3840px, pero la resolución real dependerá del original del proveedor. Sustituir por fotos propias antes de vender el producto.
El logo.svg es una adaptación vectorial provisional del emblema regalo/cámara; sustituir por el archivo maestro original al disponer de él.

## Próximas fases
Fotografías maestras, motor privado de IA/JSON, generación y validación de fidelidad facial, pagos, almacenamiento y aplicaciones.
Render: Static Site, rama main, directorio publicado ".", despliegue automático activado.


## Motor IA PICGIFT (integración de octubre 2026)
Arquitectura: navegador autenticado (Supabase) → Storage privado picgift-uploads → Edge Function JWT verificada picgift-generate → receta JSON privada picgift_scene_recipes (solo service_role) → análisis visual gpt-4.1-mini → edición multiimagen gpt-image-1.5 con la foto y el decorado → evaluación de calidad → Storage privado picgift-generated → Mis fotos o enlace firmado por email.

Implementado: siete recetas privadas; dos buckets privados; tabla de trabajos con RLS por propietario; consentimiento expreso para transferencia y procesamiento por IA; comprobación de tamaño/tipos, listas de poses y vestuario; un trabajo activo por cuenta; tres trabajos por día en esta fase; estados para supervisar generación; descarga mediante URL firmada; borrado por propietario a través de la función; correo opcional de Resend si está configurado.

### Activación del motor (ADMINISTRADOR)
1. Acceder a Supabase PICGIFT: https://supabase.com/dashboard/project/uimrvgrpenccijumyiek
2. Edge Functions → Secrets. Añadir OPENAI_API_KEY. **Nunca subirla a GitHub ni introducirla en el frontend.** Comprobar facturación y permisos para el modelo de imagen.
3. Opcional: añadir RESEND_API_KEY y PICGIFT_FROM_EMAIL (dominio de remitente verificado en Resend) para habilitar correo. Solo se enviará enlace privado de descarga de 24h, sin adjuntar la foto.
4. Probar con una imagen de una persona adulta con consentimiento explícito y el decorado propio. Comprobar estados, consistencia facial, sombras, calidad, descarga y eliminación. Después probar otros casos autorizados.
5. Obtener consentimiento y revisar condiciones de procesamiento de imágenes personales/infantiles, contratos de proveedores, información de privacidad, almacenamiento y borrado. No lanzar públicamente hasta completar esta revisión.

Los prompts completos no aparecen en scenes.json ni en app.js ni en generator.js. Las recetas maestras viven en public.picgift_scene_recipes con RLS activada y SELECT denegado a clientes; solo las lee la Edge Function desde el backend de confianza.

### Limitaciones pendientes
- El servicio puede sufrir tiempos de espera en Supabase Free (150 segundos de duración máxima), por lo que hace falta supervisión/reintentos o workers de cola dedicados si el volumen crece.
- La conservación de los rasgos faciales es un objetivo de instrucciones y revisión automatizada, **no una garantía matemática**; revisar manualmente antes de entregar comercialmente.
- Los resultados no son 4K nativos ni se vende escalado premium todavía.
- La cuota diaria limita la exposición accidental a costes, pero antes de abrir al público se necesita un sistema de créditos/pagos y límites robustos contra abuso.
- Borrado inmediato de archivos al solicitarlo; agregar política de retención temporal automática para cuentas inactivas o abandonadas.
- Los enlaces de email duran 24h; la galería genera enlaces efímeros válidos por una hora.
