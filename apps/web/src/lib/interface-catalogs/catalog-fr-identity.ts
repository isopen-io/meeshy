/**
 * L'IDENTITÉ D'UNE PERSONNE ET D'UNE CONVERSATION — tranche du catalogue `catalog-fr.ts`,
 * extraite pour tenir le budget de taille (CLAUDE.md) : le catalogue la
 * RÉPAND. Les libellés des liens d'avatar (#7241) et le menu d'appui long
 * d'un avatar (#7828), miroir `avatar.menu.*` d'iOS
 * (`MeeshyAvatar.swift:331-354`), et la feuille de détails d'une
 * conversation (#7829, miroir `ConversationInfoSheet.swift`), et la pile des
 * participants les plus actifs de l'en-tête (#7830).
 */
const frIdentity = {
  'a11y.avatar.profile': 'Voir le profil de {name}',
  'a11y.avatar.story': 'Voir la story de {name}',
  'avatar.menu.label': 'Actions pour {name}',
  'avatar.menu.view_profile': 'Voir le profil',
  'avatar.menu.view_story': 'Voir la story',
  'avatar.menu.conversation_details': 'Détails de la conversation',
  'conversation.details.title': 'Détails de la conversation',
  'conversation.details.open': 'Voir les détails de {name}',
  'conversation.details.type.direct': 'Discussion privée',
  'conversation.details.type.group': 'Groupe',
  'conversation.details.type.public': 'Conversation publique',
  'conversation.details.type.global': 'Conversation globale',
  'conversation.details.type.broadcast': 'Diffusion',
  'conversation.details.members.one': '{count} membre',
  'conversation.details.members.other': '{count} membres',
  'conversation.details.members.section': 'Membres',
  'conversation.details.members.loading': 'Chargement des membres',
  'conversation.details.members.error': 'Impossible de charger les membres.',
  'conversation.details.members.retry': 'Réessayer',
  'conversation.details.members.empty': 'Aucun membre à afficher.',
  'conversation.details.members.more': 'Afficher plus de membres',
  'conversation.details.members.you': 'Vous',
  'conversation.details.role.creator': 'Créateur',
  'conversation.details.role.admin': 'Administrateur',
  'conversation.details.role.moderator': 'Modérateur',
  'conversation.details.share': 'Partager un lien',
  'conversation.details.share.busy': 'Création du lien…',
  'conversation.details.share.copied': 'Lien copié — il ne reste qu’à le coller.',
  'conversation.details.share.failed': 'Impossible de créer le lien — réessayez dans un instant.',
  'conversation.details.share.unavailable': 'Partage impossible ici — copiez le lien : {url}',
  'thread.header.active_members': 'Participants les plus actifs',
} as const;

export default frIdentity;
