import type { AdminCatalogFragment } from './fragment';
import type fr from './moderation-fr';

/**
 * THE “moderation” FRAGMENT OF THE ADMINISTRATION CATALOG (#8876, #6726) —
 * the reports list and sheet. Same keys as the French source; the other
 * languages start from this text until their translation pass.
 */
const f = {
  'admin.moderation.subtitle': 'Los contenidos y miembros que la comunidad ha denunciado: asume el caso, decide, deja constancia.',
  'admin.moderation.list.caption': 'Lista de denuncias',
  'admin.moderation.list.count': '{count} denuncia(s)',
  'admin.moderation.list.empty': 'Ninguna denuncia',
  'admin.moderation.list.emptyHint': 'Cuando un miembro denuncia un contenido o una cuenta, aparece aquí.',
  'admin.moderation.list.filteredEmpty': 'Ninguna denuncia coincide con estos filtros',
  'admin.moderation.list.onEntity': 'Denuncias sobre un único elemento: quita el filtro para volver a ver toda la cola.',
  'admin.moderation.list.onEntityReset': 'Ver toda la cola',

  'admin.moderation.stats.heading': 'Estado de la cola',
  'admin.moderation.stats.ofTotal': 'de {total} denuncias',
  'admin.moderation.stats.average': 'Tiempo medio de resolución',
  'admin.moderation.stats.averageNote': 'No cuenta las denuncias archivadas sin acción, que no tienen fecha de resolución.',
  'admin.moderation.stats.averageNone': 'Todavía no hay ninguna denuncia resuelta ni rechazada.',
  'admin.moderation.stats.byType': 'Motivos de denuncia',
  'admin.moderation.stats.byKind': 'Contenidos denunciados',
  'admin.moderation.stats.top': 'El más frecuente: {label} ({count}).',

  'admin.moderation.filter.status': 'Estado',
  'admin.moderation.filter.reportType': 'Motivo',
  'admin.moderation.filter.reportedType': 'Contenido denunciado',
  'admin.moderation.filter.assigned': 'Atención',
  'admin.moderation.filter.assigned.me': 'Por mí',
  'admin.moderation.filter.assigned.none': 'Sin asignar',
  'admin.moderation.filter.period': 'Recibidas en',
  'admin.moderation.filter.period.all': 'Cualquier fecha',

  'admin.moderation.col.reported': 'Denunciado',
  'admin.moderation.col.reason': 'Motivo',
  'admin.moderation.col.status': 'Estado',
  'admin.moderation.col.reporter': 'Denunciante',
  'admin.moderation.col.moderator': 'Moderador',
  'admin.moderation.col.received': 'Recibida',
  'admin.moderation.col.resolved': 'Resuelta',
  'admin.moderation.col.updated': 'Actualizada',

  'admin.moderation.reporter.anonymous': 'Anónimo',
  'admin.moderation.person.gone': 'Cuenta eliminada',
  'admin.moderation.moderator.none': 'Sin asignar',

  'admin.moderation.entity.messageBy': 'Mensaje de {author}',
  'admin.moderation.entity.commentBy': 'Comentario de {author}',
  'admin.moderation.entity.inConversation': 'en {conversation}',
  'admin.moderation.entity.protected': 'Contenido protegido',

  'admin.moderation.fiche.loading': 'Cargando la denuncia',
  'admin.moderation.fiche.received': 'Denunciado por {reporter} · {when}',
  'admin.moderation.fiche.notFound': 'Esta denuncia ya no existe',
  'admin.moderation.fiche.notFoundHint': 'Es posible que otro moderador la haya eliminado.',
  'admin.moderation.fiche.back': 'Volver a las denuncias',

  'admin.moderation.stat.received': 'Recibida',
  'admin.moderation.stat.openFor': 'Abierta desde hace',
  'admin.moderation.stat.handledIn': 'Tratada en',
  'admin.moderation.stat.onEntity': 'Denuncias sobre este elemento',

  'admin.moderation.section.reported': 'Contenido denunciado',
  'admin.moderation.section.reason': 'Motivo de la denuncia',
  'admin.moderation.section.handling': 'Tratamiento',
  'admin.moderation.section.timeline': 'Cronología',
  'admin.moderation.section.siblings': 'Otras denuncias sobre este elemento',
  'admin.moderation.section.actions': 'Actuar sobre el elemento denunciado',

  'admin.moderation.reported.kind': 'Tipo',
  'admin.moderation.reported.author': 'Autor',
  'admin.moderation.reported.creator': 'Creador',
  'admin.moderation.reported.conversation': 'Conversación',
  'admin.moderation.reported.excerpt': 'Extracto',
  'admin.moderation.reported.noText': 'Este contenido no tiene texto.',
  'admin.moderation.reported.protected': 'Contenido protegido',
  'admin.moderation.reported.protectedHint': 'Su autor lo hizo privado o efímero: su texto no se muestra aquí.',
  'admin.moderation.reported.deleted': 'Este contenido fue eliminado: ya no queda texto que leer.',
  'admin.moderation.reported.unavailable': 'Este elemento ya no está disponible.',

  'admin.moderation.reason.type': 'Motivo',
  'admin.moderation.reason.reporter': 'Denunciado por',
  'admin.moderation.reason.free': 'Detalles del denunciante',
  'admin.moderation.reason.none': 'Sin detalles',

  'admin.moderation.handling.status': 'Estado',
  'admin.moderation.handling.moderator': 'Moderador',
  'admin.moderation.handling.notes': 'Notas del moderador',
  'admin.moderation.handling.notesNone': 'Sin notas',
  'admin.moderation.handling.action': 'Acción registrada',
  'admin.moderation.handling.actionNone': 'Ninguna acción registrada',
  'admin.moderation.handling.actionChoice': 'Acción que se registrará con la decisión',
  'admin.moderation.handling.actionHint': 'Queda registrada en el expediente: esta elección no desencadena nada por sí sola. Bloquear, retirar o suspender se hace desde las fichas enlazadas más abajo.',

  'admin.moderation.timeline.received': 'Recibida',
  'admin.moderation.timeline.taken': 'Asumida por {moderator}',
  'admin.moderation.timeline.takenUndated': 'Fecha no conservada: la denuncia ya se ha tratado desde entonces.',
  'admin.moderation.timeline.closed': 'Cerrada: {status}',

  'admin.moderation.siblings.none': 'Ninguna otra denuncia apunta a este elemento.',
  'admin.moderation.siblings.seeAll': 'Ver las {count} denuncias',
  'admin.moderation.siblings.error': 'No se pudieron cargar las otras denuncias.',

  'admin.moderation.actions.hint': 'Estos enlaces abren la ficha correspondiente: la denuncia por sí sola no bloquea ni retira nada.',
  'admin.moderation.actions.memberSecurity': 'Bloquear o suspender a este miembro',
  'admin.moderation.actions.authorSecurity': 'Revisar al autor: {name}',
  'admin.moderation.actions.post': 'Abrir la publicación para retirarla',
  'admin.moderation.actions.conversationReading': 'Leer la conversación (lectura soberana, requiere motivo escrito)',
  'admin.moderation.actions.conversation': 'Abrir la conversación',
  'admin.moderation.actions.community': 'Abrir la comunidad',
  'admin.moderation.actions.none': 'No hay ninguna ficha enlazada que abrir para este elemento.',

  'admin.moderation.gesture.assign': 'Asumir',
  'admin.moderation.gesture.resolve': 'Resolver',
  'admin.moderation.gesture.reject': 'Rechazar',
  'admin.moderation.gesture.dismiss': 'Archivar sin acción',
  'admin.moderation.gesture.reopen': 'Reabrir',
  'admin.moderation.gesture.delete': 'Eliminar la denuncia',

  'admin.moderation.confirm.notes': 'Notas para el expediente (opcional)',
  'admin.moderation.confirm.informs': 'El denunciante recibirá una respuesta.',
  'admin.moderation.confirm.resolve.title': 'Resolver esta denuncia',
  'admin.moderation.confirm.resolve.body': 'La denuncia se marcará como «Resuelta», con la acción registrada «{action}».',
  'admin.moderation.confirm.reject.title': 'Rechazar esta denuncia',
  'admin.moderation.confirm.reject.body': 'La denuncia se marcará como «Rechazada»: no requiere ninguna acción.',
  'admin.moderation.confirm.dismiss.title': 'Archivar esta denuncia sin acción',
  'admin.moderation.confirm.dismiss.body': 'La denuncia se cerrará sin acción. No contará para el tiempo medio de resolución.',
  'admin.moderation.confirm.reopen.title': 'Reabrir esta denuncia',
  'admin.moderation.confirm.reopen.body': 'La denuncia vuelve a «Pendiente» y tú pasas a ser su moderador.',
  'admin.moderation.confirm.delete.title': 'Eliminar esta denuncia',
  'admin.moderation.confirm.delete.body': 'La denuncia se elimina para siempre: solo queda la huella de su eliminación en el registro de auditoría. No se puede deshacer.',

  'admin.moderation.done.assigned': 'Denuncia asumida',
  'admin.moderation.done.resolved': 'Denuncia resuelta',
  'admin.moderation.done.rejected': 'Denuncia rechazada',
  'admin.moderation.done.dismissed': 'Denuncia archivada sin acción',
  'admin.moderation.done.reopened': 'Denuncia reabierta',
  'admin.moderation.done.deleted': 'Denuncia eliminada',

  'admin.moderation.meta.title': 'Metadatos',
  'admin.moderation.meta.status': 'Estado',
  'admin.moderation.meta.reason': 'Motivo',
  'admin.moderation.meta.kind': 'Contenido denunciado',
  'admin.moderation.meta.received': 'Recibida',
  'admin.moderation.meta.updated': 'Última actualización',
  'admin.moderation.meta.resolved': 'Resuelta el',
  'admin.moderation.meta.resolvedDismissed': 'Las denuncias archivadas sin acción no tienen fecha de resolución.',
  'admin.moderation.meta.resolvedOpen': 'La denuncia está abierta: todavía no tiene fecha de resolución.',
} satisfies AdminCatalogFragment<typeof fr>;

export default f;
