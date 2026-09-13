import type { InterfaceCatalog } from '@/lib/i18n-catalog';

const es = {
  'announce.messageSent': 'Mensaje enviado',
  'announce.messageCopied': 'Mensaje copiado',
  'announce.messagesCopied': 'Mensajes copiados',
  'announce.messageProtected': 'Mensaje protegido',
  'announce.selectionCap': 'Máximo {count} mensajes',
  'announce.nothingToCopy': 'Nada que copiar',

  'message.author.self': 'Tú',
  'message.excerpt.protected': 'contenido protegido',
  'a11y.message.menu.subject': 'Acciones del mensaje de {author}: {excerpt}',

  'typing.named': '{name} está escribiendo',
  'typing.double': '{first} y {second} están escribiendo',
  'typing.several': 'Varias personas están escribiendo',

  'root.menu.feed': 'Feed',
  'root.menu.links': 'Mis enlaces',
  'root.menu.notifications': 'Notificaciones',
  'root.menu.calls': 'Llamadas',
  'root.menu.discover': 'Descubrir',
  'root.menu.communities': 'Comunidades',
  'root.menu.settings': 'Ajustes',
  'root.menu.profile': 'Perfil',
  'a11y.floating.menu': 'Menú',
  'a11y.floating.menu.ladder': 'Navegación de Meeshy',

  'pending.back': 'Volver a las conversaciones',
  'pending.comingSoon': 'Esta pantalla llegará pronto.',
  'pending.feed.promise': 'Las publicaciones de las personas que sigues.',
  'pending.links.promise': 'Los enlaces compartidos en tus conversaciones se reunirán aquí.',
  'pending.notifications.promise': 'Lo que te espera — menciones, respuestas, invitaciones — se leerá aquí.',
  'pending.calls.promise': 'El historial de tus llamadas, y cómo hacer una.',
  'pending.discover.promise': 'Personas por conocer, elegidas por lo que tienen en común.',
  'pending.communities.promise': 'Las comunidades de las que formas parte, y las que se parecen a ti.',
  'pending.settings.promise': 'Tus idiomas, tu privacidad, tus notificaciones.',
  'pending.profile.promise': 'Tu identidad en Meeshy — nombre, foto, idiomas y lo que los demás ven de ella.',
} satisfies InterfaceCatalog;

export default es;
