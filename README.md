# PICGIFT · App Navidad 2026

Prototipo mobile-first publicado como web estática en Render. Esta versión rediseña la interfaz y conserva Supabase Auth, incluido Google OAuth. Todavía no implementa generación de IA ni pagos.

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
