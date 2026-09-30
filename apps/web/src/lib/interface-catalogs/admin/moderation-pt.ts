import type { AdminCatalogFragment } from './fragment';
import type fr from './moderation-fr';

/**
 * THE “moderation” FRAGMENT OF THE ADMINISTRATION CATALOG (#8876, #6726) —
 * the reports list and sheet. Same keys as the French source; the other
 * languages start from this text until their translation pass.
 */
const f = {
  'admin.moderation.subtitle': 'Os conteúdos e membros que a comunidade denunciou: assuma, decida, registre.',
  'admin.moderation.list.caption': 'Lista de denúncias',
  'admin.moderation.list.count': '{count} denúncia(s)',
  'admin.moderation.list.empty': 'Nenhuma denúncia',
  'admin.moderation.list.emptyHint': 'Quando um membro denuncia um conteúdo ou uma conta, aparece aqui.',
  'admin.moderation.list.filteredEmpty': 'Nenhuma denúncia corresponde a esses filtros',
  'admin.moderation.list.onEntity': 'Denúncias sobre um único item: remova o filtro para voltar a ver toda a fila.',
  'admin.moderation.list.onEntityReset': 'Ver toda a fila',

  'admin.moderation.stats.heading': 'Estado da fila',
  'admin.moderation.stats.ofTotal': 'de {total} denúncias',
  'admin.moderation.stats.average': 'Tempo médio de resolução',
  'admin.moderation.stats.averageNote': 'Exclui denúncias fechadas sem ação, que não têm data de resolução.',
  'admin.moderation.stats.averageNone': 'Nenhuma denúncia resolvida ou rejeitada por enquanto.',
  'admin.moderation.stats.byType': 'Motivos das denúncias',
  'admin.moderation.stats.byKind': 'Conteúdo denunciado',
  'admin.moderation.stats.top': 'Mais frequente: {label} ({count}).',

  'admin.moderation.filter.status': 'Estado',
  'admin.moderation.filter.reportType': 'Motivo',
  'admin.moderation.filter.reportedType': 'Conteúdo denunciado',
  'admin.moderation.filter.assigned': 'Processamento',
  'admin.moderation.filter.assigned.me': 'Por mim',
  'admin.moderation.filter.assigned.none': 'Não atribuído',
  'admin.moderation.filter.period': 'Recebido em',
  'admin.moderation.filter.period.all': 'Qualquer tempo',

  'admin.moderation.col.reported': 'Denunciado',
  'admin.moderation.col.reason': 'Motivo',
  'admin.moderation.col.status': 'Estado',
  'admin.moderation.col.reporter': 'Denunciado por',
  'admin.moderation.col.moderator': 'Moderador',
  'admin.moderation.col.received': 'Recebido',
  'admin.moderation.col.resolved': 'Resolvido',
  'admin.moderation.col.updated': 'Atualizado',

  'admin.moderation.reporter.anonymous': 'Anónimo',
  'admin.moderation.person.gone': 'Conta apagada',
  'admin.moderation.moderator.none': 'Não atribuído',

  'admin.moderation.entity.messageBy': 'Mensagem de {author}',
  'admin.moderation.entity.commentBy': 'Comentário de {author}',
  'admin.moderation.entity.inConversation': 'em {conversation}',
  'admin.moderation.entity.protected': 'Conteúdo protegido',

  'admin.moderation.fiche.loading': 'Carregando a denúncia',
  'admin.moderation.fiche.received': 'Denunciado por {reporter} · {when}',
  'admin.moderation.fiche.notFound': 'Esta denúncia já não existe',
  'admin.moderation.fiche.notFoundHint': 'Talvez tenha sido apagada por outro moderador.',
  'admin.moderation.fiche.back': 'Voltar às denúncias',

  'admin.moderation.stat.received': 'Recebido',
  'admin.moderation.stat.openFor': 'Aberto há',
  'admin.moderation.stat.handledIn': 'Processado em',
  'admin.moderation.stat.onEntity': 'Denúncias sobre este item',

  'admin.moderation.section.reported': 'Conteúdo denunciado',
  'admin.moderation.section.reason': 'Motivo da denúncia',
  'admin.moderation.section.handling': 'Processamento',
  'admin.moderation.section.timeline': 'Cronologia',
  'admin.moderation.section.siblings': 'Outras denúncias sobre este item',
  'admin.moderation.section.actions': 'Agir sobre o item denunciado',

  'admin.moderation.reported.kind': 'Tipo',
  'admin.moderation.reported.author': 'Autor',
  'admin.moderation.reported.creator': 'Criador',
  'admin.moderation.reported.conversation': 'Conversa',
  'admin.moderation.reported.excerpt': 'Trecho',
  'admin.moderation.reported.noText': 'Este conteúdo não tem texto.',
  'admin.moderation.reported.protected': 'Conteúdo protegido',
  'admin.moderation.reported.protectedHint': 'O autor o tornou privado ou efémero: seu texto não é exibido aqui.',
  'admin.moderation.reported.deleted': 'Este conteúdo foi apagado: não há texto para ler.',
  'admin.moderation.reported.unavailable': 'Este item já não está disponível.',

  'admin.moderation.reason.type': 'Motivo',
  'admin.moderation.reason.reporter': 'Denunciado por',
  'admin.moderation.reason.free': 'Detalhes do denunciante',
  'admin.moderation.reason.none': 'Nenhum detalhe',

  'admin.moderation.handling.status': 'Estado',
  'admin.moderation.handling.moderator': 'Moderador',
  'admin.moderation.handling.notes': 'Notas do moderador',
  'admin.moderation.handling.notesNone': 'Sem notas',
  'admin.moderation.handling.action': 'Ação registrada',
  'admin.moderation.handling.actionNone': 'Nenhuma ação registrada',
  'admin.moderation.handling.actionChoice': 'Ação a registrar com a decisão',
  'admin.moderation.handling.actionHint':
    'Registrada no arquivo: esta escolha não faz nada por si só. Banimento, remoção ou suspensão é feita nas fichas vinculadas abaixo.',

  'admin.moderation.timeline.received': 'Recebido',
  'admin.moderation.timeline.taken': 'Processado por {moderator}',
  'admin.moderation.timeline.takenUndated': 'Data não mantida: a denúncia foi processada depois.',
  'admin.moderation.timeline.closed': 'Fechado: {status}',

  'admin.moderation.siblings.none': 'Nenhuma outra denúncia tem este item como alvo.',
  'admin.moderation.siblings.seeAll': 'Ver as {count} denúncias',
  'admin.moderation.siblings.error': 'As outras denúncias não puderam ser carregadas.',

  'admin.moderation.actions.hint': 'Estes links abrem a ficha relevante: a denúncia em si não bane nem remove nada.',
  'admin.moderation.actions.memberSecurity': 'Banir ou suspender este membro',
  'admin.moderation.actions.authorSecurity': 'Examinar o autor: {name}',
  'admin.moderation.actions.post': 'Abrir a publicação para removê-la',
  'admin.moderation.actions.conversationReading': 'Ler a conversa (leitura soberana, motivo escrito obrigatório)',
  'admin.moderation.actions.conversation': 'Abrir a conversa',
  'admin.moderation.actions.community': 'Abrir a comunidade',
  'admin.moderation.actions.none': 'Nenhuma ficha vinculada para abrir neste item.',

  'admin.moderation.gesture.assign': 'Processar',
  'admin.moderation.gesture.resolve': 'Resolver',
  'admin.moderation.gesture.reject': 'Rejeitar',
  'admin.moderation.gesture.dismiss': 'Arquivar',
  'admin.moderation.gesture.reopen': 'Reabrir',
  'admin.moderation.gesture.delete': 'Apagar a denúncia',

  'admin.moderation.confirm.notes': 'Notas para o arquivo (opcional)',
  'admin.moderation.confirm.informs': 'O denunciante receberá uma resposta.',
  'admin.moderation.confirm.resolve.title': 'Resolver esta denúncia',
  'admin.moderation.confirm.resolve.body': 'A denúncia será marcada “Resolvida”, com a ação registrada “{action}”.',
  'admin.moderation.confirm.reject.title': 'Rejeitar esta denúncia',
  'admin.moderation.confirm.reject.body': 'A denúncia será marcada “Rejeitada”: não requer ação.',
  'admin.moderation.confirm.dismiss.title': 'Arquivar esta denúncia',
  'admin.moderation.confirm.dismiss.body': 'A denúncia será fechada sem ação. Não entrará no tempo médio de resolução.',
  'admin.moderation.confirm.reopen.title': 'Reabrir esta denúncia',
  'admin.moderation.confirm.reopen.body': 'A denúncia volta a “Pendente” e você se torna o moderador.',
  'admin.moderation.confirm.delete.title': 'Apagar esta denúncia',
  'admin.moderation.confirm.delete.body':
    'A denúncia é apagada permanentemente: apenas o rastro da sua exclusão permanece no log de auditoria. Esta ação é irreversível.',

  'admin.moderation.done.assigned': 'Denúncia processada',
  'admin.moderation.done.resolved': 'Denúncia resolvida',
  'admin.moderation.done.rejected': 'Denúncia rejeitada',
  'admin.moderation.done.dismissed': 'Denúncia arquivada',
  'admin.moderation.done.reopened': 'Denúncia reabierta',
  'admin.moderation.done.deleted': 'Denúncia apagada',

  'admin.moderation.meta.title': 'Metadados',
  'admin.moderation.meta.status': 'Estado',
  'admin.moderation.meta.reason': 'Motivo',
  'admin.moderation.meta.kind': 'Conteúdo denunciado',
  'admin.moderation.meta.received': 'Recebido',
  'admin.moderation.meta.updated': 'Última atualização',
  'admin.moderation.meta.resolved': 'Resolvido em',
  'admin.moderation.meta.resolvedDismissed': 'Denúncias arquivadas não têm data de resolução.',
  'admin.moderation.meta.resolvedOpen': 'A denúncia está aberta: ainda não tem data de resolução.',
} satisfies AdminCatalogFragment<typeof fr>;

export default f;
