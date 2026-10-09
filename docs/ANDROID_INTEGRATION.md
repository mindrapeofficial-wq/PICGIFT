# Integración Android de PicGift

Fecha de diagnóstico: 9 de octubre de 2026.
Base revisada: main d74d8a204240942db291c979abf96316bb985f4c.
Propuesta Compose revisada: PR #10, ee2fcd9cf4c332f264fea6a7d3f83d8e72d87b13.

## Punto de partida comprobado

La aplicación publicada no se puede identificar solo a partir del repositorio.
La rama main contiene una Activity Kotlin con WebView remoto, Credential Manager,
Google Play Billing y Firebase Messaging. Mantiene com.picgift.myapp.
No es todavía una interfaz íntegramente nativa.

Hay dos propuestas abiertas:
- #9: navegación/cabecera Compose y Photo Picker.
- #10: contiene también la base #9 y añade galería Compose y recorte local.
Las tres comprobaciones de #10 consultadas están aprobadas: build-debug-apk,
admin-access-checks y validate-photo-preflight. Esto no acredita pruebas físicas,
configuración efectiva de OAuth/Firebase, compras reales ni publicación en Play.

## Fases y condiciones de cierre

| Fase | Trabajo | Condición para cerrar |
| --- | --- | --- |
| 1A · Base y estabilidad | Inventario Android, recuperación HTTP y cobertura de CI de los puentes web | PR aislada revisada, lint/build y regresiones aprobados |
| 1B · Integración de propuestas | Revisar #9/#10, resolver dependencias y portar el manejo de errores de 1A a Compose | Un conjunto coherente de cambios sin sobrescribir Google ni Billing |
| 2 · Experiencia Android | Navegación, galería, recorte y perfil; accesibilidad y teclado | Flujo completo en teléfono: elegir foto → preparar → generar → ver resultado |
| 3 · Ciclo de vida | Reinicio, cambio de cuenta, red intermitente, rotación y memoria | Recuperación clara, sin mostrar fotos de otra cuenta ni perder créditos |
| 4 · Servicios | Google, permisos de notificaciones, descarga/compartir y compras | Login con cuenta nueva/existente, compra cancelada/pendiente y acreditación verificada |
| 5 · Distribución | Web compatible, APK de prueba, AAB firmado y canal interno | Versión instalada desde Play probada antes de promoverla |

La migración es progresiva. La sesión y el motor de generación existentes siguen
siendo la fuente de verdad mientras se trasladan las pantallas. No duplicar el
cliente autenticado ni adjudicar créditos desde el móvil.

## Cambios de 1A

La WebView trata los errores HTTP del documento principal como fallos de carga,
invalida la cuenta de la página y muestra Reintentar. Los errores de imágenes o
peticiones secundarias no sustituyen la pantalla. No anuncia el puente Google
desde un documento fallido o de otro origen. Una nueva navegación retira el error.

La validación Android también se activa cuando cambian el documento principal,
los puentes de sesión/notificaciones, navegación, generación o pagos. Antes,
varios cambios web de integración no disparaban este workflow.

## Verificación pendiente en teléfono

1. Arranque, primera cuenta Google, cancelación y sesión persistente.
2. Documento principal HTTP 500/404, modo avión y Reintentar tras recuperar red.
3. Error de una imagen aislada: la pantalla sigue disponible.
4. Photo Picker: cancelar, fotos EXIF, recorte y carga del URI privado.
5. Galería con dos cuentas: salir, entrar con otra y verificar aislamiento.
6. Compra en canal interno con tester autorizado: cancelar, pendiente, completar y reiniciar.
7. Permiso de notificaciones y recepción con app cerrada.
8. Tras integrar Compose, Atrás, teclado y cambios de orientación.

Esta fase no fusiona #9/#10 ni genera una nueva versión firmada. La numeración
nativa actual se conserva; la versión final se asignará al conjunto que se pruebe.
