import type { AccountDeletionGuideCatalog } from '@/lib/i18n-account-deletion-guide';

/**
 * LA PAGE DE SUPPRESSION VUE DÉCONNECTÉ — ses libellés, importés par la seule page
 * qui les rend : les catalogues d'interface (budget `interface_catalogs`) n'en portent rien.
 * `routes/account-deletion-guide.tsx` (#9921).
 */
const esAccountDeletionGuide = {
  'accountDeletion.guide.title': 'Eliminar tu cuenta de Meeshy',
  'accountDeletion.guide.intro': 'Esta página trata de la aplicación Meeshy en Android, iOS y la web. Explica cómo eliminar tu cuenta y qué pasa con tus datos.',
  'accountDeletion.guide.steps.title': 'Cómo hacerlo',
  'accountDeletion.guide.step.signIn': 'Inicia sesión con el botón de abajo. En la aplicación, la misma solicitud está en Ajustes, Eliminar cuenta.',
  'accountDeletion.guide.step.confirm': 'Escribe la frase de confirmación y tu contraseña, y solicita la eliminación.',
  'accountDeletion.guide.step.email': 'Abre el correo que te enviamos y confirma la eliminación.',
  'accountDeletion.guide.step.wait': 'Tu cuenta se elimina 30 días después. No tienes que hacer nada más.',
  'accountDeletion.guide.signIn': 'Iniciar sesión para eliminar mi cuenta',
  'accountDeletion.guide.deleted.title': 'Qué se elimina',
  'accountDeletion.guide.deleted.profile': 'Tu perfil: nombre, nombre de usuario, correo, número de teléfono, foto, portada, biografía y fecha de nacimiento.',
  'accountDeletion.guide.deleted.access': 'Tu contraseña, tus sesiones y tus claves de cifrado.',
  'accountDeletion.guide.deleted.messages': 'El texto de tus mensajes y sus traducciones, tus fotos, vídeos y mensajes de voz.',
  'accountDeletion.guide.deleted.other': 'Tu perfil de voz, tu libreta de direcciones, tus notificaciones, tus enlaces compartidos, tu progreso en el juego y tus stickers.',
  'accountDeletion.guide.kept.title': 'Qué se conserva',
  'accountDeletion.guide.kept.messages': 'En las conversaciones de los demás, tus mensajes siguen en su sitio, vacíos y marcados como eliminados.',
  'accountDeletion.guide.kept.posts': 'El texto de tus publicaciones y comentarios sigue visible con el nombre «Cuenta eliminada». Para quitarlos, bórralos en la aplicación antes de tu solicitud.',
  'accountDeletion.guide.kept.packs': 'Los packs de stickers que publicaste siguen disponibles, sin tu nombre.',
  'accountDeletion.guide.kept.stats': 'Un identificador de cuenta anónimo y estadísticas de uso que no permiten identificarte.',
  'accountDeletion.guide.delay.title': 'Plazo',
  'accountDeletion.guide.delay.body': 'Tu cuenta se elimina 30 días después de tu confirmación. Hasta entonces, puedes cancelar con el enlace del correo.',
  'accountDeletion.guide.noAccess.title': '¿Ya no puedes iniciar sesión?',
  'accountDeletion.guide.noAccess.body': 'Escríbenos desde el correo de tu cuenta pidiendo su eliminación. Respondemos en un plazo de 30 días.',
} as const satisfies AccountDeletionGuideCatalog;

export default esAccountDeletionGuide;
