/**
 * LE FRAGMENT « moderation » DU CATALOGUE D’ADMINISTRATION (#8876, #6726) — la
 * liste et la fiche des signalements. Préfixe exclusif : `admin.moderation.`.
 *
 * Les libellés d’états, de motifs, de genres et d’actions consignées ne sont PAS
 * ici : ils vivent dans le fragment du kit (`admin.enum.report*`), source unique
 * de leur interprétation.
 */
const f = {
  'admin.moderation.subtitle': 'Les contenus et les membres que la communauté a signalés : prenez en charge, décidez, consignez.',
  'admin.moderation.list.caption': 'Liste des signalements',
  'admin.moderation.list.count': '{count} signalement(s)',
  'admin.moderation.list.empty': 'Aucun signalement',
  'admin.moderation.list.emptyHint': 'Quand un membre signale un contenu ou un compte, il arrive ici.',
  'admin.moderation.list.filteredEmpty': 'Aucun signalement pour ces filtres',
  'admin.moderation.list.onEntity': 'Signalements qui visent un seul élément : retirez le filtre pour revoir toute la file.',
  'admin.moderation.list.onEntityReset': 'Voir toute la file',

  'admin.moderation.stats.heading': 'État de la file',
  'admin.moderation.stats.ofTotal': 'sur {total} signalements',
  'admin.moderation.stats.average': 'Délai moyen de résolution',
  'admin.moderation.stats.averageNote': 'Hors dossiers classés sans suite, qui n’ont pas de date de résolution.',
  'admin.moderation.stats.averageNone': 'Aucun dossier résolu ou rejeté pour le moment.',
  'admin.moderation.stats.byType': 'Motifs des signalements',
  'admin.moderation.stats.byKind': 'Contenus signalés',
  'admin.moderation.stats.top': 'Le plus fréquent : {label} ({count}).',

  'admin.moderation.filter.status': 'Statut',
  'admin.moderation.filter.reportType': 'Motif',
  'admin.moderation.filter.reportedType': 'Contenu signalé',
  'admin.moderation.filter.assigned': 'Prise en charge',
  'admin.moderation.filter.assigned.me': 'Par moi',
  'admin.moderation.filter.assigned.none': 'Non assignés',
  'admin.moderation.filter.period': 'Reçus sur',
  'admin.moderation.filter.period.all': 'Toute la période',

  'admin.moderation.col.reported': 'Signalé',
  'admin.moderation.col.reason': 'Motif',
  'admin.moderation.col.status': 'Statut',
  'admin.moderation.col.reporter': 'Signalé par',
  'admin.moderation.col.moderator': 'Modérateur',
  'admin.moderation.col.received': 'Reçu',
  'admin.moderation.col.resolved': 'Résolu',
  'admin.moderation.col.updated': 'Mis à jour',

  'admin.moderation.reporter.anonymous': 'Anonyme',
  'admin.moderation.person.gone': 'Compte supprimé',
  'admin.moderation.moderator.none': 'Non assigné',

  'admin.moderation.entity.messageBy': 'Message de {author}',
  'admin.moderation.entity.commentBy': 'Commentaire de {author}',
  'admin.moderation.entity.inConversation': 'dans {conversation}',
  'admin.moderation.entity.protected': 'Contenu protégé',

  'admin.moderation.fiche.loading': 'Chargement du signalement',
  'admin.moderation.fiche.received': 'Signalé par {reporter} · {when}',
  'admin.moderation.fiche.notFound': 'Ce signalement n’existe plus',
  'admin.moderation.fiche.notFoundHint': 'Il a peut-être été supprimé par un autre modérateur.',
  'admin.moderation.fiche.back': 'Retour aux signalements',

  'admin.moderation.stat.received': 'Reçu',
  'admin.moderation.stat.openFor': 'Ouvert depuis',
  'admin.moderation.stat.handledIn': 'Traité en',
  'admin.moderation.stat.onEntity': 'Signalements sur cet élément',

  'admin.moderation.section.reported': 'Contenu signalé',
  'admin.moderation.section.reason': 'Motif du signalement',
  'admin.moderation.section.handling': 'Traitement',
  'admin.moderation.section.timeline': 'Chronologie',
  'admin.moderation.section.siblings': 'Autres signalements sur cet élément',
  'admin.moderation.section.actions': 'Agir sur l’élément signalé',

  'admin.moderation.reported.kind': 'Genre',
  'admin.moderation.reported.author': 'Auteur',
  'admin.moderation.reported.creator': 'Créateur',
  'admin.moderation.reported.conversation': 'Conversation',
  'admin.moderation.reported.excerpt': 'Extrait',
  'admin.moderation.reported.noText': 'Ce contenu ne porte pas de texte.',
  'admin.moderation.reported.protected': 'Contenu protégé',
  'admin.moderation.reported.protectedHint': 'L’auteur l’a rendu privé ou éphémère : son texte n’est pas affiché ici.',
  'admin.moderation.reported.deleted': 'Ce contenu a été supprimé : il n’y a plus de texte à lire.',
  'admin.moderation.reported.unavailable': 'Cet élément n’est plus disponible.',

  'admin.moderation.reason.type': 'Motif',
  'admin.moderation.reason.reporter': 'Signalé par',
  'admin.moderation.reason.free': 'Précisions du signalant',
  'admin.moderation.reason.none': 'Aucune précision',

  'admin.moderation.handling.status': 'Statut',
  'admin.moderation.handling.moderator': 'Modérateur',
  'admin.moderation.handling.notes': 'Notes du modérateur',
  'admin.moderation.handling.notesNone': 'Aucune note',
  'admin.moderation.handling.action': 'Action consignée',
  'admin.moderation.handling.actionNone': 'Aucune action consignée',
  'admin.moderation.handling.actionChoice': 'Action à consigner avec la décision',
  'admin.moderation.handling.actionHint':
    'Consignée dans le dossier : ce choix ne déclenche rien par lui-même. Bannir, retirer ou suspendre se fait depuis les fiches liées plus bas.',

  'admin.moderation.timeline.received': 'Reçu',
  'admin.moderation.timeline.taken': 'Pris en charge par {moderator}',
  'admin.moderation.timeline.takenUndated': 'Date non conservée : le signalement a été traité depuis.',
  'admin.moderation.timeline.closed': 'Clôturé : {status}',

  'admin.moderation.siblings.none': 'Aucun autre signalement ne vise cet élément.',
  'admin.moderation.siblings.seeAll': 'Voir les {count} signalements',
  'admin.moderation.siblings.error': 'Les autres signalements n’ont pas pu être chargés.',

  'admin.moderation.actions.hint': 'Ces liens ouvrent la fiche concernée : le signalement ne bannit ni ne retire rien lui-même.',
  'admin.moderation.actions.memberSecurity': 'Bannir ou suspendre ce membre',
  'admin.moderation.actions.authorSecurity': 'Examiner l’auteur : {name}',
  'admin.moderation.actions.post': 'Ouvrir la publication pour la retirer',
  'admin.moderation.actions.conversationReading': 'Lire la conversation (lecture souveraine, motif écrit requis)',
  'admin.moderation.actions.conversation': 'Ouvrir la conversation',
  'admin.moderation.actions.community': 'Ouvrir la communauté',
  'admin.moderation.actions.none': 'Aucune fiche liée à ouvrir pour cet élément.',

  'admin.moderation.gesture.assign': 'Prendre en charge',
  'admin.moderation.gesture.resolve': 'Résoudre',
  'admin.moderation.gesture.reject': 'Rejeter',
  'admin.moderation.gesture.dismiss': 'Classer sans suite',
  'admin.moderation.gesture.reopen': 'Rouvrir',
  'admin.moderation.gesture.delete': 'Supprimer le signalement',

  'admin.moderation.confirm.notes': 'Notes pour le dossier (facultatif)',
  'admin.moderation.confirm.informs': 'Le signalant recevra une réponse.',
  'admin.moderation.confirm.resolve.title': 'Résoudre ce signalement',
  'admin.moderation.confirm.resolve.body': 'Le signalement sera marqué « Résolu », avec l’action consignée « {action} ».',
  'admin.moderation.confirm.reject.title': 'Rejeter ce signalement',
  'admin.moderation.confirm.reject.body': 'Le signalement sera marqué « Rejeté » : il n’appelle aucune action.',
  'admin.moderation.confirm.dismiss.title': 'Classer ce signalement sans suite',
  'admin.moderation.confirm.dismiss.body': 'Le signalement sera clôturé sans action. Il n’entrera pas dans le délai moyen de résolution.',
  'admin.moderation.confirm.reopen.title': 'Rouvrir ce signalement',
  'admin.moderation.confirm.reopen.body': 'Le signalement repasse « En attente » et vous en devenez le modérateur.',
  'admin.moderation.confirm.delete.title': 'Supprimer ce signalement',
  'admin.moderation.confirm.delete.body':
    'Le signalement est supprimé définitivement : seule la trace de sa suppression reste dans le journal d’audit. Cette action est irréversible.',

  'admin.moderation.done.assigned': 'Signalement pris en charge',
  'admin.moderation.done.resolved': 'Signalement résolu',
  'admin.moderation.done.rejected': 'Signalement rejeté',
  'admin.moderation.done.dismissed': 'Signalement classé sans suite',
  'admin.moderation.done.reopened': 'Signalement rouvert',
  'admin.moderation.done.deleted': 'Signalement supprimé',

  'admin.moderation.meta.title': 'Métadonnées',
  'admin.moderation.meta.status': 'Statut',
  'admin.moderation.meta.reason': 'Motif',
  'admin.moderation.meta.kind': 'Contenu signalé',
  'admin.moderation.meta.received': 'Reçu',
  'admin.moderation.meta.updated': 'Dernière mise à jour',
  'admin.moderation.meta.resolved': 'Résolu le',
  'admin.moderation.meta.resolvedDismissed': 'Les dossiers classés sans suite n’ont pas de date de résolution.',
  'admin.moderation.meta.resolvedOpen': 'Le dossier est ouvert : il n’a pas encore de date de résolution.',
} as const;

export default f;
