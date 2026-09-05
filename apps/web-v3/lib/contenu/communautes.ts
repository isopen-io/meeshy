import { enUneLigne } from './fil';

/**
 * LA COPIE DE `/communities` — ce que l'écran DIT.
 *
 * `GET /communities` (§ 2.1 de la spécification, `services/gateway/src/
 * routes/communities/core.ts:99-239`) ne sert que des données — un nom, deux
 * comptes, un drapeau `isPrivate` — jamais une phrase composée. Toute la mise
 * en mots vit donc ici, comme `lib/contenu/appels.ts` le fait pour
 * l'historique des appels : un seul site pour l'unique peintre de cet écran
 * (le document servi — aucun module de participation, § 7 de la spécification).
 *
 * `sansNom` ET `conflit` SONT LA RÉPONSE À DEUX REFUS DISTINCTS DE
 * `POST /communities`, jamais le message anglais de la passerelle recopié :
 * la porte (`communautes-porte.ts`) choisit LEQUEL des deux poser dans
 * `EtatDesCommunautes.motif` selon ce qui a échoué (nom vide côté client, ou
 * 409 « identifier already exists » côté serveur) — la vue se contente de
 * peindre la chaîne qu'on lui donne, jamais de la recomposer.
 */
export const COMMUNAUTES = {
  titre: 'Communautés',
  sous: 'Vos espaces',
  retour: 'Retour à l’accueil',
  liste: 'Vos communautés',
  creer: 'Créer',
  creerTitre: 'Créer une communauté',
  fermer: 'Fermer',
  membres: 'membres',
  membre: 'membre',
  conversations: 'conversations',
  conversation: 'conversation',
  privee: 'privée',
  vide: 'Aucune communauté',
  videPrecision: 'Les communautés que vous rejoignez ou créez apparaîtront ici.',
  plus: 'Plus de communautés',
  /**
   * LE REPLI D'UNE LIGNE DE CONVERSATION SANS TITRE — même doctrine que
   * `APPELS.sansNom` (`lib/contenu/appels.ts`) : une ligne sans nom ne se
   * rend pas anonyme, elle dit « Conversation », jamais une chaîne vide.
   */
  sansTitre: 'Conversation',
  /**
   * LE REPLI D'UNE COMMUNAUTÉ OUVERTE PAR UN LIEN PROFOND — `?ouverte=<id>`
   * pour un id qui n'est pas sur la page COURANTE de la liste (pagination
   * dépassée). `GET /communities/:id/conversations` (§ 2.2) ne sert AUCUN
   * champ `name` : la surimpression ne connaît le nom d'une communauté que
   * par la liste déjà chargée (T5 — pas un troisième appel).
   */
  communauteSansNom: 'Communauté',
  participants: 'participants',
  refusPrivee: 'Cette communauté est privée',
  introuvable: 'Cette communauté n’existe plus',
  videConversations: 'Aucune conversation',
  videConversationsPrecision: 'Cette communauté n’a pas encore de conversation.',
  nomChamp: 'Nom',
  descriptionChamp: 'Description',
  priveeChamp: 'Communauté privée',
  /** Refus CÔTÉ CLIENT — aucun nom saisi, jamais envoyé à la passerelle. */
  sansNom: 'Donnez un nom à votre communauté.',
  /** Refus CÔTÉ SERVEUR — 409, l'identifiant auto-généré du nom est déjà pris. */
  conflit: 'Ce nom est déjà pris — essayez-en un autre.',
  /** Panne CÔTÉ SERVEUR à la création (réseau coupé, 5xx) — distincte du conflit. */
  echecCreation: 'La création a échoué. Réessayez dans un instant.',
} as const;

/**
 * LA MÉTA D'UNE LIGNE — « N membres · M conversations » pour une communauté
 * PUBLIQUE, « N membres · privée » pour une PRIVÉE (Q3 de la spécification,
 * la cible fait foi : la confidentialité prime sur l'exhaustivité du méta).
 * Les deux comptes sont SERVIS par la passerelle (`memberCount`,
 * `conversationCount`) — jamais recomptés ici.
 */
export const metaDeLaCommunaute = ({
  membres,
  conversations,
  prive,
}: {
  readonly membres: number;
  readonly conversations: number;
  readonly prive: boolean;
}): string =>
  enUneLigne([
    membres === 1 ? `1 ${COMMUNAUTES.membre}` : `${membres} ${COMMUNAUTES.membres}`,
    prive
      ? COMMUNAUTES.privee
      : conversations === 1
        ? `1 ${COMMUNAUTES.conversation}`
        : `${conversations} ${COMMUNAUTES.conversations}`,
  ]);
