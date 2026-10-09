# PICGIFT | Halloween 2026 · Dirección visual y referencias

## Entrega y activación

La ampliación contiene **siete fondos sin personas**, **tres ejemplos de retrato** y un duplicado descartado. El ZIP de entrega se mantiene fuera de GitHub hasta que se incorporen los archivos.

- Fondos públicos: copiar exclusivamente `assets/halloween/backdrops/*.webp` a las rutas exactas del manifiesto `assets/halloween/expansion-2026.json`.
- Ejemplos con una niña: conservar en almacenamiento **privado**, sujeto a autorización de publicación/uso por su tutor. No subirlos a GitHub ni utilizarlos como referencia de identidad de clientes.
- El catálogo del frontend comprueba que cada fondo existe, es del mismo origen y tiene tipo `image/webp`; solo entonces muestra su tarjeta **Próximamente**.
- Una tarjeta visible **no habilita la generación**. Para activarla hay que añadir su receta a `picgift_scene_recipes` con permisos, ampliar las listas permitidas del backend, probar ambos motores, cuotas, consentimiento y control de calidad; únicamente entonces cambiar su estado a `picgift` y añadir la ruta a `generator.js`.

## Lenguaje visual

**Tono:** fantasía de Halloween acogedora, gótico de cuento, no terror gráfico. Realismo fotográfico editorial, elementos mágicos físicamente plausibles, no ilustración.
**Paleta:** ámbar cálido en velas, farolas y ventanas; azules fríos lunares; ocres, burdeos, cobre, negro, toques verdes en laboratorio.
**Fotografía:** enfoque natural del sujeto, texturas visibles en piedra, terciopelo, madera, hojas y piel; sombras de contacto, escala del suelo consistente, sin duplicar sombras ni inventar manos.
**Composición:** preservar la geometría del decorado y las zonas de paso. Mantener un área de suelo libre y una escala creíble para retrato vertical, horizontal y cuadrado. No insertar personajes presentes en el ejemplo.
**Infancia:** respetar edad aparente, proporciones, movilidad y postura respaldada; no introducir accesorios que tapen la cara; bebés siempre en posiciones soportadas.

## Roles de las referencias

1. **Fotografía del cliente (privada):** identidad, rostro, peinado, expresión, cuerpo y proporciones visibles. Prioridad absoluta para esas propiedades.
2. **Fondo vacío elegido:** arquitectura, objetos, perspectiva, atmósfera, temperatura de luz y lugares físicamente válidos para el sujeto. No contiene una persona de referencia.
3. **Foto opcional del mismo cliente:** detalle facial o corporal, solo cuando se aporta con autorización y pertenece al mismo usuario.
4. **Ejemplos editoriales de la ampliación:** inspiración general para vestuario, acabado, iluminación y relación sujeto/escenario. Nunca copiar la cara, los rasgos personales ni la identidad del sujeto del ejemplo.

No mezclar la cara del cliente con la niña de las muestras ni mostrar una fotografía de muestra como resultado real del cliente. Los ejemplos no se envían automáticamente al motor: se incorporan a un corpus privado solo después de verificar su consentimiento y propósito.

## Fichas por decorado

### Villa de las calabazas (`halloween-calabaza-village`)
- Imagen prevista: `./assets/halloween/backdrops/calabaza-village.webp`
- Ambientación: Una aldea iluminada con casas de calabaza y un castillo al fondo.
- Pose sugerida: De pie. Conservar un área libre para los pies, el sillón o el contacto con el suelo cuando corresponda.

### El sendero de las calabazas (`halloween-senda-calabazas`)
- Imagen prevista: `./assets/halloween/backdrops/senda-calabazas.webp`
- Ambientación: Un camino de otoño entre faroles, murciélagos y calabazas bajo la luna.
- Pose sugerida: De pie. Conservar un área libre para los pies, el sillón o el contacto con el suelo cuando corresponda.

### El castillo bajo la luna (`halloween-castillo-luna`)
- Imagen prevista: `./assets/halloween/backdrops/castillo-luna.webp`
- Ambientación: Una entrada de cuento a un castillo gótico iluminado.
- Pose sugerida: De pie. Conservar un área libre para los pies, el sillón o el contacto con el suelo cuando corresponda.

### El salón victoriano (`halloween-salon-victoriano`)
- Imagen prevista: `./assets/halloween/backdrops/salon-victoriano.webp`
- Ambientación: Terciopelo rojo, retratos antiguos, chimenea y velas.
- Pose sugerida: Sentado en sillón. Conservar un área libre para los pies, el sillón o el contacto con el suelo cuando corresponda.

### La tienda de caramelos (`halloween-tienda-caramelos`)
- Imagen prevista: `./assets/halloween/backdrops/tienda-caramelos.webp`
- Ambientación: Una confitería mágica con piruletas, calabazas y luces cálidas.
- Pose sugerida: De pie. Conservar un área libre para los pies, el sillón o el contacto con el suelo cuando corresponda.

### Las puertas del castillo (`halloween-portones-castillo`)
- Imagen prevista: `./assets/halloween/backdrops/portones-castillo.webp`
- Ambientación: Faroles y hojas otoñales ante unas verjas que conducen a un castillo.
- Pose sugerida: De pie. Conservar un área libre para los pies, el sillón o el contacto con el suelo cuando corresponda.

### La gran escalinata encantada (`halloween-escalinata-encantada`)
- Imagen prevista: `./assets/halloween/backdrops/escalinata-encantada.webp`
- Ambientación: Un gran vestíbulo gótico con alfombra roja y candelabros.
- Pose sugerida: De pie. Conservar un área libre para los pies, el sillón o el contacto con el suelo cuando corresponda.

## Control de calidad antes de habilitar nuevas escenas

Comprobar en al menos tres fotografías consentidas por escena: rostro, manos y proporciones; contacto físico con el suelo/mobiliario; sombras, dirección de luz y escala; coherencia de la arquitectura; atuendo apropiado; ausencia de personas extra. Revisar al menos una pose de pie y una sentada si el decorado la permite. `needs_review` o `failed` nunca equivale a un retrato entregado.

La receta completa con parámetros específicos sigue en Supabase y no debe exponerse en este documento público.
