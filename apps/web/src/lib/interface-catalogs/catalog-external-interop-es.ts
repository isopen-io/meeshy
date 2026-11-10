import type { ExternalInteropCatalog } from '@/lib/i18n-external-interop-catalog';

/** L'information sur ce qui part chez Meta et le signalement d'un contenu WhatsApp (#17120) — voir `catalog-external-interop-fr.ts`. */
const es = {
  'externalInterop.notice.title': 'Escribir a un amigo en WhatsApp',
  'externalInterop.notice.lead': 'Para contactar con tu amigo en WhatsApp, Meeshy comparte con Meta, que gestiona WhatsApp:',
  'externalInterop.disclosure.phone-number': 'tu número de teléfono verificado, que te identifica en WhatsApp;',
  'externalInterop.disclosure.profile-name': 'tu nombre visible;',
  'externalInterop.disclosure.public-keys': 'las claves públicas de cifrado de tus dispositivos;',
  'externalInterop.disclosure.encrypted-content': 'tus mensajes y archivos, cifrados de extremo a extremo: Meta no puede leerlos;',
  'externalInterop.disclosure.delivery-metadata': 'quién escribe a quién, cuándo, el tamaño de los envíos y las confirmaciones de entrega.',
  'externalInterop.notice.retention': 'Meeshy guarda el número de tu amigo {days} días después de la última vez que abres la conversación y luego lo borra.',
  'externalInterop.notice.retention.unknown': 'Meeshy guarda el número de tu amigo durante un tiempo limitado y luego lo borra.',
  'externalInterop.notice.translation': 'La traducción se hace en tu dispositivo: Meeshy nunca ve el contenido de esta conversación.',
  'externalInterop.notice.withdraw': 'Puedes retirar este consentimiento en cualquier momento: Meeshy borra entonces los números de tus amigos de WhatsApp.',
  'externalInterop.notice.accept': 'Acepto y continúo',
  'externalInterop.notice.accept.busy': 'Guardando…',
  'externalInterop.notice.cancel': 'Cancelar',
  'externalInterop.notice.outdated': 'Esta información ha cambiado: actualiza Meeshy para volver a leerla antes de aceptar.',
  'externalInterop.notice.unavailable': 'Escribir a un amigo en WhatsApp aún no está disponible aquí.',
  'externalInterop.notice.error': 'No se ha podido guardar tu consentimiento. Inténtalo de nuevo.',
  'externalInterop.report.title': 'Denunciar este contenido de WhatsApp',
  'externalInterop.report.lead': 'Meeshy no puede leer esta conversación: solo se envía a nuestro equipo de moderación lo que decides adjuntar.',
  'externalInterop.report.reason': 'Motivo',
  'externalInterop.report.attach': 'Adjuntar el texto del mensaje',
  'externalInterop.report.attach.hint': 'El texto adjunto se envía sin cifrar a la moderación de Meeshy.',
  'externalInterop.report.block': 'Bloquear a este contacto en Meeshy',
  'externalInterop.report.submit': 'Enviar la denuncia',
  'externalInterop.report.submit.busy': 'Enviando…',
  'externalInterop.report.cancel': 'Cancelar',
  'externalInterop.report.done.title': 'Denuncia enviada',
  'externalInterop.report.done.blocked': 'Este contacto está bloqueado: ya no recibirás sus mensajes en Meeshy.',
  'externalInterop.report.done.orientation': 'Meeshy no puede actuar sobre su cuenta de WhatsApp. Para que se retire este contenido de WhatsApp, usa la denuncia que ofrece Meta.',
  'externalInterop.report.done.close': 'Cerrar',
  'externalInterop.report.error': 'No se ha podido enviar la denuncia. Inténtalo de nuevo.',
} satisfies ExternalInteropCatalog;

export default es;
