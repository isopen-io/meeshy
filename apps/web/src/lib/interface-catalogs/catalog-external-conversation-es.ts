import type { ExternalConversationCatalog } from '@/lib/i18n-external-conversation-catalog';

const es = {
  'externalConversation.entry.title': 'Escribir a un amigo en WhatsApp',
  'externalConversation.entry.detail': 'Por su número, cifrado de extremo a extremo',
  'externalConversation.handle.label': 'Número de WhatsApp de tu amigo',
  'externalConversation.handle.hint': 'En formato internacional, con el prefijo del país: +34 612 34 56 78.',
  'externalConversation.handle.invalid': 'Este número no está en formato internacional. Empieza por + y el prefijo del país.',
  'externalConversation.submit': 'Escribir',
  'externalConversation.pending': 'Abriendo…',
  'externalConversation.cancel': 'Cancelar',
  'externalConversation.encrypted': 'Cifrado de extremo a extremo: Meeshy no puede leer tus mensajes. La traducción se hace en tu dispositivo, y las funciones que requieren leer el mensaje en nuestros servidores no existen en esta conversación.',
  'externalConversation.phoneUnverified': 'Verifica tu número para escribir a un amigo en WhatsApp.',
  'externalConversation.phoneVerified': 'Número verificado. Toca «Escribir» para abrir la conversación.',
  'externalConversation.refused.disabled': 'Escribir a un amigo en WhatsApp todavía no está disponible aquí.',
  'externalConversation.refused.reserved': 'Durante la fase de prueba, las conversaciones cifradas de extremo a extremo están reservadas a algunas cuentas.',
  'externalConversation.refused.limit': 'Ya tienes el número máximo de conversaciones de WhatsApp abiertas. Cierra una para abrir otra.',
  'externalConversation.refused.rateLimited': 'Demasiadas conversaciones abiertas en poco tiempo. Inténtalo de nuevo dentro de una hora.',
  'externalConversation.refused.offline': 'Sin conexión: vuelve a conectarte y toca de nuevo «Escribir».',
  'externalConversation.refused.failed': 'No se pudo abrir esta conversación. Inténtalo de nuevo en un momento.',
} satisfies ExternalConversationCatalog;

export default es;
