import type frPublicEntry from './catalog-fr-public-entry';

/** L'entrée publique (#10007) — tranche `es` de `catalog-fr-public-entry.ts`, mêmes clés. */
const esPublicEntry = {
  'publicHeader.home': 'Inicio de Meeshy',
  'publicHeader.language': 'Idioma',
  'brand.credit.hint': 'abre la plataforma services.ceo en una pestaña nueva',
  'login.offline': 'Sin conexión: no es posible iniciar sesión por ahora.',
  'login.twoFactor.title': 'Autenticación en dos pasos',
  'login.twoFactor.lead': 'Introduce el código de tu aplicación de autenticación.',
  'login.twoFactor.code': 'Código de 6 dígitos',
  'login.twoFactor.submit': 'Validar',
  'login.twoFactor.busy': 'Verificando…',
  'login.twoFactor.cancel': 'Cancelar',
  'login.passwordDoor': 'Iniciar sesión con usuario y contraseña',
  'login.username.label': 'Correo, teléfono o usuario',
  'login.username.placeholder': 'Usuario, correo o teléfono',
  'login.password.label': 'Contraseña',
  'login.submit': 'Iniciar sesión',
  'login.submit.busy': 'Conectando…',
  'login.emailDoor': 'Iniciar sesión por correo',
  'login.forgotPassword': '¿Olvidaste tu contraseña?',
  'login.forgotPassword.label': 'Contraseña olvidada',
  'login.noAccount': '¿No tienes cuenta?',
  'login.createAccount': 'Crear una cuenta',
  'magicLink.title': 'Tu dirección de correo',
  'magicLink.howItWorks': 'Cómo funciona',
  'magicLink.howItWorks.text': 'Ninguna contraseña que recordar: te enviamos un enlace por correo. Ábrelo y habrás iniciado sesión.',
  'magicLink.email.label': 'Dirección de correo',
  'magicLink.email.placeholder': 'nombre@ejemplo.com',
  'magicLink.email.invalid': 'Dirección de correo no válida',
  'magicLink.rateLimited': 'Demasiadas solicitudes: vuelve a intentarlo dentro de una hora.',
  'magicLink.offline': 'Sin conexión. Comprueba tu red y vuelve a intentarlo.',
  'magicLink.submit': 'Recibir el enlace',
  'magicLink.submit.busy': 'Enviando…',
} satisfies Readonly<Record<keyof typeof frPublicEntry, string>>;

export default esPublicEntry;
