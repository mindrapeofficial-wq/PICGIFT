# PICGIFT · Acceso de Google Play para revisión

Guía operativa para preparar una cuenta **real y verificada** que pueda usar el equipo de revisión de Google Play. El contenido de este archivo es preparatorio: **no refleja ni modifica** la declaración actualmente guardada en Play Console.

> No guardar contraseñas de revisión, claves, recibos, datos de clientes ni capturas privadas en GitHub. La cuenta debe existir en Supabase Auth y permitir una comprobación real desde la versión instalada por Google Play.

## Estado del producto y alcance de la revisión (31 de octubre de 2026)

- El correo de Google Play del 30 de octubre confirma **acceso a producción para PicGift: AI Photo Portraits (`com.picgift.myapp`)**. No certifica que exista una publicación general ni que la versión del repositorio esté distribuida.
- `android/app/build.gradle.kts` declara la versión fuente 1.9.0 (código 22). Comprobar la versión **efectivamente instalada desde Play**, no asumir que coincide con GitHub.
- El flujo documentado vigente es **una foto Premium de prueba sin coste por cuenta verificada**, sujeta a la disponibilidad del estudio; las siguientes fotos Premium consumen créditos. La antigua modalidad `Foto Gratis` está descontinuada.
- Los packs Android son consumibles de compra única (1, 5 y 10 créditos) mediante Google Play Billing. No es obligatorio pagar para consultar el catálogo, y una compra simulada de licencia no valida un cobro real.

## Preparar una cuenta de revisión

1. En [Supabase Auth](https://supabase.com/dashboard/project/uimrvgrpenccijumyiek/auth/users), crea o revisa una cuenta exclusiva para Google Play.
2. Utiliza un correo controlado y una contraseña única, almacenada **fuera del repositorio**.
3. Verifica el correo y comprueba que no tiene permisos administrativos ni fotografías de usuarios reales.
4. Desde una instalación real de Play, comprueba acceso con email y contraseña, recuperación de sesión, **Mi cuenta**, **Mis fotos**, **Inspiración** y estudio. Si Google OAuth está habilitado, comprueba por separado su retorno a la aplicación.
5. Consulta en el dispositivo si el estudio está habilitado y si la cuenta dispone de su única prueba Premium. **No indiques a Google que la generación funciona o está deshabilitada sin comprobarlo.**
6. Confirma que Ayuda y comentarios, política de privacidad, condiciones, solicitud de eliminación de cuenta y cualquier flujo de compra se abren y funcionan. Nunca suministres un método de pago personal para la revisión.
7. Mantén la cuenta disponible para revisiones futuras.

## Play Console → Acceso a la aplicación

- Indica que algunas funciones requieren autenticación y proporciona las credenciales reales de la cuenta de revisión en el campo seguro de Console.
- Comprueba que el revisor pueda entrar sin SMS, MFA temporal ni intervención manual del propietario.
- Si la creación Premium está disponible y ha pasado una prueba real, explica cómo utilizar la prueba gratuita y cómo consultar el resultado en Mis fotos.
- Si la creación todavía **no** está habilitada, descríbela expresamente como no disponible, explica el recorrido accesible y **no solicites revisión de una función inexistente o bloqueada como si estuviera lista**.
- No copies instrucciones antiguas que declaren que Halloween, la generación y las compras están desactivados para todos: pueden ser incorrectas después de las actualizaciones.

### Plantilla de instrucciones segura para personalizar

```text
Abre PICGIFT desde la versión proporcionada por Google Play. Pulsa «Entrar»
e inicia sesión con el correo y la contraseña de revisión incluidos en los
campos confidenciales de Play Console. No requiere SMS ni inicio con Google.
Puedes acceder a Perfil, Mis fotos, Inspiración y al estudio. Consulta las
opciones disponibles para esa cuenta.
[ANTES DE ENVIAR: añadir únicamente los pasos de generación/compra que se hayan
probado de extremo a extremo en esta versión, o explicar las restricciones.]
```

## Verificaciones independientes

- [ ] Credenciales de revisor operativas en dispositivo real y versión de Play.
- [ ] Declaración de acceso a la aplicación en Console coincide con las funciones accesibles.
- [ ] Clasificación IARC y **categoría de edad por territorio** confirmadas en Console; no inferirlas del email IARC.
- [ ] Ficha ES/EN y capturas verificadas contra el Android instalado; los materiales gráficos antiguos de Drive se capturaron en navegador.
- [ ] Política [privacy.html](https://picgift.onrender.com/privacy.html) y solicitud [delete-account.html](https://picgift.onrender.com/delete-account.html) accesibles desde fuera de la app y desde la app.
- [ ] Prueba real de eliminación completa y respuesta a solicitud documentada; abrir un borrador de correo no elimina datos.
- [ ] Prueba Premium única y créditos: primer retrato, segundo con crédito, fallo/reintegro.
- [ ] Pruebas Google Play Billing: pendiente, cancelada, compra de licencia, reinicio, consumo, recuperación, reembolso.
- [ ] Seguridad de los datos y declaración de IA generativa conciliadas con el comportamiento real.

**Sin autorización para publicar una versión, cambiar declaraciones regulatorias, activar ventas o modificar precios desde esta guía.**
