# Validación visual móvil · beta 1.8.2 / código 11

La bienvenida y los primeros pasos muestran tres ejemplos: foto inicial, escenario y estilo de resultado. Son ejemplos ilustrativos, no una promesa de transformar una persona en otra. Se conserva el consentimiento de generación y el acceso según créditos.

Crear usa 8 px de margen lateral y reserva 112 px más el área segura inferior para permitir ver los escenarios completos por encima de la navegación. El desplazamiento sigue activo y las barras están ocultas en CSS y en el WebView.

`tests/welcome-browser.cjs` valida las imágenes del tutorial, el consentimiento de notificaciones después de cerrarlo, la ausencia de desbordamiento horizontal y la visibilidad de los escenarios al final del scroll en 320, 390 y 768 px. El workflow Android ejecuta esta comprobación y guarda capturas.

El icono oficial conserva su imagen original. El inset adaptativo pasa de 18% a −35% para compensar los márgenes internos. El logo ocupa aproximadamente el 51% del lienzo adaptativo y queda dentro del círculo seguro de 66 dp sobre 108 dp descrito en la [documentación de Android](https://developer.android.com/codelabs/basic-android-kotlin-compose-training-change-app-icon).

Todas las compilaciones ejecutan `:app:verifyLauncherIcon` antes de `preBuild`: rechazan un logo que ocupe menos del 50% del lienzo o que salga del círculo seguro. La configuración antigua se probó y fue rechazada. Si cambia la imagen o la paleta, revisar el análisis de los píxeles dorados/naranjas y las previsualizaciones antes de ajustar estos límites.

La vista web se actualiza desde Render; el icono instalado requiere actualizar Android con la AAB firmada 1.8.2-beta, código 11. Las simulaciones de máscara no sustituyen la comprobación final en un dispositivo real.
