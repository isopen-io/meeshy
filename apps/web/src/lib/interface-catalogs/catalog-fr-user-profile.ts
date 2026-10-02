/**
 * LE PROFIL PUBLIC DE QUELQU'UN (#7083) — tranche du catalogue, extraite pour
 * tenir le budget de taille (motif `catalog-fr-contact-card.ts`, #9063).
 * Préfixe `userProfile.*` : le préfixe `profile.*` appartient à /me, et deux
 * écrans qui partageraient un préfixe partageraient ses retouches. Ce qui
 * EXISTE déjà est réutilisé, pas redit : `discover.connection.*` et
 * `discover.announce.*` (les mêmes gestes), `profile.stats.*`,
 * `profile.section.stats`, `profile.section.member_since`, `profile.retry`,
 * `profile.offline.title`.
 */
const frUserProfile = {
  'userProfile.self.edit': 'Modifier mon profil',
  'userProfile.title': 'Profil',
  'userProfile.loading': 'Chargement du profil',
  'userProfile.section.publications': 'PUBLICATIONS',
  'userProfile.section.relation': 'CONNEXION',
  'userProfile.section.conversations': 'CONVERSATIONS',
  'userProfile.conversations.empty': 'Aucune conversation en commun',
  'userProfile.conversations.emptyBody': 'Rien ne vous relie encore — « Écrire » ouvre la première.',
  'userProfile.conversations.error': 'Impossible de charger les conversations',
  'userProfile.conversations.loading': 'Chargement des conversations',
  'userProfile.refused.title': 'Ce profil n’est pas accessible',
  'userProfile.refused.body': 'Il n’existe pas, ou vous n’y avez pas accès.',
  'userProfile.throttled.title': 'Trop de demandes',
  'userProfile.throttled.body': 'Réessayez dans un instant.',
  'userProfile.error.title': 'Impossible de charger ce profil',
  'userProfile.error.body': 'Réessayez dans un instant.',
  'userProfile.offline.body': 'Le profil s’affichera à la reconnexion.',
  'userProfile.posts.empty': 'Aucune publication',
  'userProfile.posts.emptyBody': 'Rien de public à lire pour l’instant.',
  'userProfile.posts.emptyPosts': 'Aucun poste',
  'userProfile.posts.emptyReels': 'Aucun réel',
  'userProfile.posts.emptyFilter': 'Touchez à nouveau la tuile pour tout revoir.',
  'userProfile.posts.error': 'Impossible de charger les publications',
  'userProfile.posts.loadMore': 'Charger plus',
  'userProfile.posts.loaded': 'Publications ajoutées : {count}',
  'userProfile.posts.loadedNone': 'Aucune publication de plus à afficher',
  'userProfile.posts.loading': 'Chargement…',
  'userProfile.stat.posts': 'Postes',
  'userProfile.stat.reels': 'Réels',
  'userProfile.stat.stories': 'Stories',
  'userProfile.stat.filterLabel': 'Filtrer sur {name}',
  'userProfile.stat.filterClear': 'Tout afficher',
  'userProfile.context.received': '{name} souhaite entrer en contact avec vous. Acceptez pour échanger des messages.',
  'userProfile.context.sent': 'Vous avez envoyé une demande de connexion à {name}. En attente de sa réponse.',
  'userProfile.action.write': 'Écrire',
  'userProfile.action.writeLabel': 'Écrire à {name}',
  'userProfile.action.block': 'Bloquer',
  'userProfile.action.blockLabel': 'Bloquer {name}',
  'userProfile.blocked.title': 'Vous avez bloqué cette personne',
  'userProfile.blocked.body': 'Ses publications et ses statistiques restent masquées tant que le blocage dure.',
  'userProfile.signin.title': 'Connectez-vous pour entrer en contact',
  'userProfile.signin.body': 'Les demandes de connexion et les messages demandent un compte.',
  'userProfile.signin.cta': 'Se connecter',
  'userProfile.announce.blocked': 'Personne bloquée',
  'userProfile.announce.blockFailed': 'Impossible de bloquer',
  'userProfile.announce.writeFailed': 'Impossible d’ouvrir la conversation',
  'userProfile.presence.online': 'En ligne',
  'userProfile.presence.seen': 'Vu {ago}',
  'userProfile.presence.yesterdayAt': 'Vu hier à {time}',
  'userProfile.presence.beforeYesterdayAt': 'Vu avant-hier à {time}',
  'userProfile.presence.dateAt': 'Vu le {date} à {time}',
} as const;

export type UserProfileCatalogSlice = Readonly<Record<keyof typeof frUserProfile, string>>;

export default frUserProfile;
