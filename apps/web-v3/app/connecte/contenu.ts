/**
 * LA COPIE DE LA ZONE CONNECTÉE — celle du legacy, mot pour mot
 * (`apps/web/locales/fr/dashboard.json` et `conversations.json`).
 *
 * CE QUI N'ENTRE PAS, ET POURQUOI. Le tableau de bord du legacy affiche SIX
 * compteurs : conversations, communautés, messages de la semaine, conversations
 * actives, traductions du jour, liens créés. La v3 n'en sert que DEUX — ceux
 * qu'elle peut MESURER depuis `GET /conversations` : le nombre de conversations
 * et le total des messages non lus.
 *
 * Les quatre autres demandent des routes que ce lot n'appelle pas. Les afficher
 * à zéro serait pire qu'un tableau plus court : un compteur qui dit « 0
 * traduction aujourd'hui » à quelqu'un qui vient d'en recevoir dix n'est pas
 * une donnée manquante, c'est une donnée FAUSSE. Ils reviendront avec leurs
 * routes.
 */

export const TABLEAU_DE_BORD = {
  titre: 'Tableau de bord',
  salutationSansNom: 'Bonjour, Utilisateur ! 👋',
  apercu: 'Voici un aperçu de votre activité de messagerie aujourd’hui.',
  conversations: 'Conversations',
  total: 'Total',
  nonLus: 'Messages',
  nonLusPrecision: 'Non lus',
  recentes: 'Reprendre',
  voirTout: 'Tout voir',
  liens: 'Mes liens',
  liensVides: 'Aucun lien de partage',
  liensVidesPrecision:
    'Un lien de partage ouvre une conversation à qui le reçoit, sans compte. Vous n’en avez encore créé aucun.',
  emplois: 'utilisations',
  versLesChats: 'Mes conversations',
} as const;

export const CHATS = {
  titre: 'Conversations',
  accroche: 'Vos conversations, la plus récente en premier.',
  vide: 'Aucune conversation',
  videPrecision: 'Démarrez une nouvelle conversation pour discuter avec vos amis !',
  participants: 'participants',
  nonLus: 'non lus',
} as const;

export const PANNE = {
  titre: 'Le service ne répond pas',
  corps:
    'Vos conversations n’ont pas pu être chargées. Ce n’est pas votre connexion — réessayez dans un instant.',
  action: 'Réessayer',
} as const;

/**
 * L'ADRESSE PUBLIQUE D'UN LIEN DE PARTAGE — telle que le lecteur la COPIE.
 *
 * Ce n'est pas la route que la carte ouvre : la carte mène à la conversation du
 * lecteur (`/chats/:id`), dans l'interface connectée, tandis que ce texte est ce
 * qu'il colle dans une conversation WhatsApp. Les deux vivent côte à côte sur la
 * même ligne, et les confondre ferait envoyer à un invité une adresse qui le
 * renverrait se connecter.
 *
 * `meeshy.me` est le domaine de service, pas une couleur : il vient de la
 * variable que le déploiement pose déjà (`NEXT_PUBLIC_FRONTEND_URL`,
 * `docker-compose.prod.yml:368`), jamais d'une constante recopiée ici.
 */
export const adresseDuLien = (identifiant: string): string => {
  const base = (process.env.NEXT_PUBLIC_FRONTEND_URL ?? 'https://meeshy.me').replace(/\/+$/, '');
  return `${base.replace(/^https?:\/\//, '')}/chat/${identifiant}`;
};

/**
 * `salutation` prend le prénom quand la passerelle le donne. Le repli n'est pas
 * « Bonjour ! » mais la chaîne que le legacy emploie déjà dans le même cas
 * (`greetingFallback`) : le même écran, dans les deux zones, dit le même mot.
 */
export const salutation = (prenom: string | null): string =>
  prenom === null ? TABLEAU_DE_BORD.salutationSansNom : `Bonjour, ${prenom} ! 👋`;
