# PICGIFT · Acceso de Google Play para revisión

Esta guía sirve para preparar una cuenta **real** en Supabase Auth que los revisores de Google Play puedan utilizar en la APK Android de PICGIFT.

> Las cuentas no se almacenan en GitHub: viven en Supabase Auth. Nunca publiques una contraseña de revisión ni claves privadas en el repositorio.

## Crear la cuenta de revisión

1. Abre el [panel Authentication → Users de PICGIFT](https://supabase.com/dashboard/project/uimrvgrpenccijumyiek/auth/users).
2. Selecciona **Add user → Create new user**.
3. Usa un correo exclusivo de revisión que controles; puede ser un alias de Gmail asociado al correo del administrador, por ejemplo `mindrapeofficial+playreview@gmail.com`.
4. Genera una contraseña única y robusta, distinta de las contraseñas personales. Guárdala en tu gestor de contraseñas y **no** en el repositorio.
5. Marca **Auto confirm user**, si el panel ofrece esa opción; en caso contrario, confirma el correo recibido.
6. Comprueba que el usuario figura como verificado. No le añadas permisos administrativos ni lo incluyas en `picgift_ai_pilot_users`.
7. Instala la compilación 1.5.0 o posterior. Comprueba correo y contraseña, y Google mediante navegador externo → «Volver a PICGIFT» → sesión activa en la app. Prueba también cancelar y reiniciar durante el acceso. Google nunca se abre dentro del WebView; el código vuelve por un enlace con estado pendiente y se intercambia mediante PKCE.
8. Comprueba que el usuario puede abrir **Mi cuenta**, **Mis fotografías** y el estudio. El estado sin fotografías es correcto. Compras y generación Halloween están todavía desactivadas para todos los usuarios públicos.

## Rellenar Play Console → Acceso a la aplicación

- Selecciona **Sí, algunas funciones de la aplicación están restringidas**.
- Método: **correo electrónico y contraseña**.
- Usuario: el correo real de la cuenta de revisión.
- Contraseña: la contraseña exclusiva guardada en el gestor.
- Instrucciones para los revisores (puedes copiar):

```text
Para revisar PICGIFT, abre la aplicación y selecciona «Entrar».
Inicia sesión con el correo electrónico y la contraseña de prueba facilitados.
Una vez dentro, puedes acceder a «Mi cuenta», «Mis fotografías» y al estudio de creación.
No se requiere un código SMS, inicio de sesión con Google ni un pago.
La campaña de Halloween está en preparación; la generación de imágenes y los cobros todavía están desactivados.
El catálogo de escenarios puede explorarse sin iniciar sesión.
```

## Buenas prácticas

- Mantén la cuenta disponible durante la revisión.
- No uses una cuenta de administrador ni una cuenta que contenga fotografías privadas de clientes.
- Evita autenticación con códigos que requieran intervención del propietario durante la revisión.
- Si necesitas desactivar la cuenta tras la publicación, espera a que Google haya terminado de revisar y considera mantenerla para futuras actualizaciones.
- Revisa que la URL pública de la [política de privacidad](https://picgift.onrender.com/privacy.html) funciona sin iniciar sesión.
- No habilites pagos ni generación para esta cuenta para esquivar las restricciones del piloto.

## Comprobar que existe

En Supabase → Authentication → Users, busca el correo. La fila debe aparecer registrada y con el correo confirmado antes de enviarla a Google.
