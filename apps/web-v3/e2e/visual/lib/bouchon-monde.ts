import {
  chargeDeMessage,
  PARTICIPANT_DE_L_INVITE,
  SESSION_DE_L_INVITE,
  UTILISATEUR_DU_MEMBRE,
} from './bouchon-socket';

/**
 * LE MONDE QUE LE BOUCHON SERT — un lien, une conversation, un membre, deux
 * pairs, un invité, et les quatre messages que `thread.png` dessine.
 *
 * Écrit UNE fois, lu par la passerelle de bouchon (`serveurs.ts`) et par ses
 * trois familles de routes (`bouchon-fil.ts`, `bouchon-lien.ts`,
 * `bouchon-compte.ts`) : les routes n'importent jamais `serveurs.ts`, qui les
 * monte — c'est ce qui garde le graphe acyclique quand le budget de taille
 * impose de découper. `serveurs.ts` ré-exporte ces noms : les specs gardent
 * leur unique porte d'entrée.
 */

export const NOM_DU_LIEN = 'Équipe Lagos';
export const PRENOM_DU_LECTEUR = 'Amina';
/** Le fil que le tableau de bord et la liste rendent — et la cible de sa carte. */
export const CONVERSATION_DU_LECTEUR = {
  id: '68f2a81417a557e8ce4ddfbb',
  titre: 'Équipe Lagos',
  membres: 12,
  nonLus: 3,
} as const;
/**
 * LE SECOND FIL DU BOUCHON — celui que la vue `rich` adresse.
 *
 * `vues.json` déclare `rich` sur `/chats/:id`, une route DISTINCTE du
 * `/chats/:cle` de `thread` : les deux vues ne sont pas en collision, elles
 * n'avaient simplement aucune DONNÉE derrière leur jeton. Les six formes
 * étaient bien construites (`messagesRiches`), mais raccordées à la
 * conversation UNIQUE que le spec sert dans son instance éphémère — jamais à
 * une conversation adressable par un identifiant propre dans la passerelle
 * PARTAGÉE que `compare-rendu.js` interroge.
 *
 * Le titre et le sous-titre sont ceux de la cible (`cible/rich.png`, index
 * `vues.json`) : la conformité se mesure sur ce que l'écran REND.
 */
export const CONVERSATION_RICHE = {
  id: 'fil-riche',
  titre: 'Types de messages',
  membres: 4,
} as const;

/**
 * LA SECONDE LIGNE DE `/chats` — un tête-à-tête, et le TÉMOIN de deux règles à
 * la fois.
 *
 * § 12.10.2 : à DEUX, le compte de participants se tait. Et le Prisme : son
 * dernier message est ESPAGNOL, avec une traduction française — un lecteur dont
 * le prisme commence par le français lit « Merci, je t'envoie le fichier », la
 * pastille annonçant `es`. C'est la ligne que `cible/chats.png` dessine.
 */
export const AUTRE_CONVERSATION = {
  id: '68f2a81417a557e8ce4ddfbc',
  titre: 'Marta Ruiz',
  membres: 2,
  nonLus: 0,
  apercu: 'Gracias, te envío el archivo',
  langueOriginale: 'es',
  traductions: { fr: 'Merci, je t’envoie le fichier' },
} as const;

/**
 * LA TROISIÈME LIGNE DE `/chats` (#5164, correction de revue) — un second
 * témoin de pastille de langue, ORIGINAL anglais traduit en français, sur un
 * tête-à-tête (`membres: 2`, § 12.10.2 : la méta se tait donc ici aussi,
 * comme sur `AUTRE_CONVERSATION`). C'est la ligne « Salon démo » de
 * `cible/chats.png`.
 */
export const TROISIEME_CONVERSATION = {
  id: '68f2a81417a557e8ce4ddfbd',
  titre: 'Salon démo',
  membres: 2,
  nonLus: 0,
  apercu: 'Tolu joined the conversation',
  langueOriginale: 'en',
  traductions: { fr: 'Tolu a rejoint la conversation' },
} as const;

/**
 * LA QUATRIÈME LIGNE — SANS pastille de langue (original français, aucune
 * traduction) ET SANS pastille de non-lus (`nonLus: 0`) : le témoin de la
 * règle 30 que la revue du #5164 réclamait, faute duquel le premier écran de
 * `/chats` à 360 × 844 ne pouvait montrer les TROIS lignes actionnables que la
 * charte règle 12 nomme (une carte mise en avant + deux lignes ne suffisent
 * pas). C'est la ligne « Support produit » de `cible/chats.png`.
 */
export const QUATRIEME_CONVERSATION = {
  id: '68f2a81417a557e8ce4ddfbe',
  titre: 'Support produit',
  membres: 2,
  nonLus: 0,
  apercu: 'Appel audio manqué',
  langueOriginale: 'fr',
  traductions: null as Readonly<Record<string, string>> | null,
} as const;

export const IDENTIFIANT_DU_LIEN_PARTAGE = 'lagos-q1';
export const DESCRIPTION_DU_LIEN = 'Le canal des opérations de terrain.';
/** Servi par l'aperçu, JAMAIS attendu dans le HTML : c'est le témoin de la fuite du § 5.1. */
export const CREATEUR_DU_LIEN = 'ibrahim-le-createur';

export const LIEN_DU_FIL = 'mshy_lagos';
/** Les identités que le bouchon SERT — un membre, deux pairs, un invité. */
export const MEMBRE = { id: UTILISATEUR_DU_MEMBRE, nom: 'Amina Diallo' } as const;
export const PAIR_ANGLOPHONE = { id: 'u2', nom: 'Ibrahim' } as const;
export const PAIR_HISPANOPHONE = { id: 'u3', nom: 'Marta Ruiz' } as const;
export const INVITE = { id: PARTICIPANT_DE_L_INVITE, nom: 'Tolu', session: SESSION_DE_L_INVITE } as const;
export const PSEUDO_DEJA_PRIS = 'ibrahim';
export const PSEUDO_SUGGERE = 'ibrahim2';

export type MessageServi = Record<string, unknown> & { readonly id: string; readonly createdAt: string };

/** Une ligne de `GET /conversations`, telle que `routes/conversations/core-list.ts:776-830` la sert. */
export type LigneDeConversationServie = {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly type: string;
  readonly memberCount: number;
  readonly unreadCount: number;
  readonly lastMessageAt: string;
  readonly lastMessage: { readonly id: string; readonly content: string };
  readonly lastMessageOriginalLanguage: string;
  readonly lastMessageTranslations: Readonly<Record<string, string>> | null;
  readonly participants?: readonly { readonly userId: string; readonly displayName: string }[];
};

/**
 * LES QUATRE LIGNES DE `/chats` (#5164, correction de revue — la cible en
 * dessine QUATRE : une carte mise en avant + trois lignes plates, dont une
 * SANS pastille de langue). Un TABLEAU EXPORTÉ, pour que `bouchon-compte.ts`
 * (déjà à 1 078 lignes) BOUCLE dessus plutôt que de porter le littéral —
 * c'est ce fichier-ci, pas lui, qui grossit d'une ligne de plus demain.
 */
export const LIGNES_DE_CONVERSATIONS_SERVIES: readonly LigneDeConversationServie[] = [
  {
    id: CONVERSATION_DU_LECTEUR.id,
    identifier: 'lagos',
    title: CONVERSATION_DU_LECTEUR.titre,
    type: 'group',
    memberCount: CONVERSATION_DU_LECTEUR.membres,
    unreadCount: CONVERSATION_DU_LECTEUR.nonLus,
    lastMessageAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    lastMessage: { id: 'm-apercu', content: 'On se cale à 15 h pour la revue ?' },
    lastMessageOriginalLanguage: 'fr',
    lastMessageTranslations: null,
  },
  {
    id: AUTRE_CONVERSATION.id,
    identifier: 'marta',
    title: AUTRE_CONVERSATION.titre,
    type: 'direct',
    memberCount: AUTRE_CONVERSATION.membres,
    unreadCount: AUTRE_CONVERSATION.nonLus,
    lastMessageAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    lastMessage: { id: 'm-apercu-2', content: AUTRE_CONVERSATION.apercu },
    lastMessageOriginalLanguage: AUTRE_CONVERSATION.langueOriginale,
    lastMessageTranslations: AUTRE_CONVERSATION.traductions,
    // L'AUTRE personne du tête-à-tête (§ 12.10.3) : son avatar, dans
    // `/chats`, ouvre son profil — `homologueDe` l'élit en excluant
    // `MEMBRE.id` de cette liste.
    participants: [
      { userId: PAIR_HISPANOPHONE.id, displayName: PAIR_HISPANOPHONE.nom },
      { userId: MEMBRE.id, displayName: MEMBRE.nom },
    ],
  },
  {
    id: TROISIEME_CONVERSATION.id,
    identifier: 'salon-demo',
    title: TROISIEME_CONVERSATION.titre,
    type: 'direct',
    memberCount: TROISIEME_CONVERSATION.membres,
    unreadCount: TROISIEME_CONVERSATION.nonLus,
    lastMessageAt: new Date(Date.now() - 26 * 3_600_000).toISOString(),
    lastMessage: { id: 'm-apercu-3', content: TROISIEME_CONVERSATION.apercu },
    lastMessageOriginalLanguage: TROISIEME_CONVERSATION.langueOriginale,
    lastMessageTranslations: TROISIEME_CONVERSATION.traductions,
  },
  {
    id: QUATRIEME_CONVERSATION.id,
    identifier: 'support-produit',
    title: QUATRIEME_CONVERSATION.titre,
    type: 'direct',
    memberCount: QUATRIEME_CONVERSATION.membres,
    unreadCount: QUATRIEME_CONVERSATION.nonLus,
    lastMessageAt: new Date(Date.now() - 4 * 24 * 3_600_000).toISOString(),
    lastMessage: { id: 'm-apercu-4', content: QUATRIEME_CONVERSATION.apercu },
    lastMessageOriginalLanguage: QUATRIEME_CONVERSATION.langueOriginale,
    lastMessageTranslations: QUATRIEME_CONVERSATION.traductions,
  },
];

/** La présence de départ : Ibrahim en ligne, Marta hors ligne — ce que `thread.png` dessine (« 1 en ligne » chez le membre, leur ami). */
export const PRESENCES_INITIALES: readonly (readonly [string, boolean])[] = [
  [PAIR_ANGLOPHONE.id, true],
  [PAIR_HISPANOPHONE.id, false],
];

const ilYA = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();

/**
 * Les quatre messages que la cible `thread.png` dessine, tels que
 * `mapMessageRowForList` les sert (`routes/conversations/messages-list-query.ts:
 * 475-600`) : `senderId` = `User.id` d'un inscrit, `Participant.id` d'un
 * anonyme ; `translations` en TABLEAU `{ language, content }` ; les compteurs
 * d'accusé CALCULÉS.
 */
export const messagesInitiaux = (conversationId: string): MessageServi[] => [
  {
    ...chargeDeMessage({
      id: 'm1',
      conversationId,
      senderId: PAIR_ANGLOPHONE.id,
      content: 'Shall we meet at 3 pm for the review?',
      originalLanguage: 'en',
      sender: { id: 'p-ibrahim', displayName: PAIR_ANGLOPHONE.nom, userId: PAIR_ANGLOPHONE.id },
      translations: [{ language: 'fr', content: 'On se cale à 15 h pour la revue ?' }],
      createdAt: ilYA(29),
    }),
    senderParticipantId: 'p-ibrahim',
    deliveredCount: 2,
    readCount: 2,
    recipientCount: 3,
  },
  {
    ...chargeDeMessage({
      id: 'm2',
      conversationId,
      senderId: INVITE.id,
      content: 'Ça me va. J’apporte les chiffres de mars.',
      originalLanguage: 'fr',
      sender: { id: INVITE.id, displayName: INVITE.nom, type: 'anonymous' },
      createdAt: ilYA(27),
    }),
    senderParticipantId: INVITE.id,
  },
  {
    ...chargeDeMessage({
      id: 'm3',
      conversationId,
      senderId: PAIR_HISPANOPHONE.id,
      content: 'Perfecto, lo reviso esta tarde.',
      originalLanguage: 'es',
      sender: { id: 'p-marta', displayName: PAIR_HISPANOPHONE.nom, userId: PAIR_HISPANOPHONE.id },
      translations: [{ language: 'fr', content: 'Parfait, je le relis cet après-midi.' }],
      createdAt: ilYA(26),
    }),
    senderParticipantId: 'p-marta',
  },
  {
    ...chargeDeMessage({
      id: 'm4',
      conversationId,
      senderId: MEMBRE.id,
      content: 'Parfait, je crée le lien pour Marta.',
      originalLanguage: 'fr',
      sender: { id: 'p-amina', displayName: MEMBRE.nom, userId: MEMBRE.id },
      createdAt: ilYA(25),
    }),
    senderParticipantId: 'p-amina',
    deliveredCount: 3,
    readCount: 1,
    recipientCount: 3,
  },
];

/** Les deux pouces servis sur m3 (`thread.png`) — Ibrahim et Marta, jamais le lecteur : la pastille n'est pas la sienne. */
export const REACTIONS_INITIALES = { m3: { '👍': ['p-ibrahim', 'p-marta'] } } as const;

/**
 * LES SIX FORMES QUE `cible/rich.png` DESSINE — image, vidéo, audio, transfert,
 * réponse, story —, servies par les MÊMES routes que le reste du fil : c'est le
 * même écran (`/chats/:cle`, `app/connecte/fil-vue.ts`), avec des messages qui
 * portent et citent davantage. Un spec les ajoute par `ajouteUnMessage`.
 *
 * Chaque champ est celui que la passerelle sert, pris dans son émetteur :
 *
 *   • `attachments[]` — `attachmentMediaSelect` (`services/attachments/
 *     attachmentIncludes.ts:69-103`) : `fileUrl` RELATIF, `mimeType`,
 *     `fileSize`, `duration` (ms), `transcription` `{ text, language }` et
 *     `translations` — la carte `langue → { transcription, url }` que
 *     `cleanAttachmentsForApi` sert telle quelle (`messages-list-query.ts:101-127`) ;
 *   • `replyTo` — `messages-list-query.ts:262` (`include_replies` vaut
 *     `true` par défaut) : `id`, `content`, `originalLanguage`, `sender` aplati ;
 *   • `forwardedFromId` + `forwardedFromConversation` — l'enrichissement
 *     (`:643-762`), servi seulement quand la réciprocité de la source
 *     l'autorise ;
 *   • `postReplyTo` — le snapshot figé du post cité (`buildPostReplyTo`,
 *     `services/messaging/postReplySnapshot.ts:73`), hissé en champ de
 *     premier niveau (`messages-list-query.ts:768-790`).
 */
export const PISTE_TRADUITE = '/api/v1/attachments/file/2026/vocal-fr.m4a';

export const messagesRiches = (conversationId: string): MessageServi[] => [
  {
    ...chargeDeMessage({
      id: 'r1',
      conversationId,
      senderId: PAIR_ANGLOPHONE.id,
      content: 'The final review board.',
      originalLanguage: 'en',
      sender: { id: 'p-ibrahim', displayName: PAIR_ANGLOPHONE.nom, userId: PAIR_ANGLOPHONE.id },
      translations: [{ language: 'fr', content: 'Le tableau final de la revue.' }],
      attachments: [
        {
          id: 'ar1',
          fileUrl: '/api/v1/attachments/file/2026/tableau.jpg',
          originalName: 'tableau.jpg',
          mimeType: 'image/jpeg',
          fileSize: 430_080,
          width: 1200,
          height: 900,
        },
      ],
      createdAt: ilYA(24),
    }),
    senderParticipantId: 'p-ibrahim',
    deliveredCount: 3,
    readCount: 3,
  },
  {
    ...chargeDeMessage({
      id: 'r2',
      conversationId,
      senderId: PAIR_HISPANOPHONE.id,
      content: '',
      originalLanguage: 'es',
      sender: { id: 'p-marta', displayName: PAIR_HISPANOPHONE.nom, userId: PAIR_HISPANOPHONE.id },
      attachments: [
        {
          id: 'ar2',
          fileUrl: '/api/v1/attachments/file/2026/revue.mp4',
          originalName: 'revue.mp4',
          mimeType: 'video/mp4',
          fileSize: 3_100_000,
          duration: 42_000,
          transcription: { text: 'Repasamos las cifras de marzo.', language: 'es' },
          translations: { fr: { transcription: 'On repasse les chiffres de mars.' } },
        },
      ],
      createdAt: ilYA(22),
    }),
    senderParticipantId: 'p-marta',
  },
  {
    ...chargeDeMessage({
      id: 'r3',
      conversationId,
      senderId: INVITE.id,
      content: '',
      originalLanguage: 'yo',
      sender: { id: INVITE.id, displayName: INVITE.nom, type: 'anonymous' },
      attachments: [
        {
          id: 'ar3',
          fileUrl: '/api/v1/attachments/file/2026/vocal.m4a',
          originalName: 'vocal.m4a',
          mimeType: 'audio/mp4',
          fileSize: 96_000,
          duration: 21_000,
          transcription: { text: 'Mo n mú àwọn nọ́mbà oṣù Kẹta.', language: 'yo' },
          translations: { fr: { transcription: 'J’apporte les chiffres de mars, tout est prêt.', url: PISTE_TRADUITE } },
        },
      ],
      createdAt: ilYA(20),
    }),
    senderParticipantId: INVITE.id,
  },
  {
    ...chargeDeMessage({
      id: 'r4',
      conversationId,
      senderId: PAIR_ANGLOPHONE.id,
      content: 'Le glossaire partagé a été mis à jour hier soir.',
      originalLanguage: 'fr',
      sender: { id: 'p-ibrahim', displayName: PAIR_ANGLOPHONE.nom, userId: PAIR_ANGLOPHONE.id },
      createdAt: ilYA(18),
    }),
    senderParticipantId: 'p-ibrahim',
    forwardedFromId: 'x1',
    forwardedFromConversationId: 'c-diaspora',
    forwardedFromConversation: { id: 'c-diaspora', title: 'Diaspora FR-EN', identifier: 'diaspora', type: 'group', avatar: null },
  },
  {
    ...chargeDeMessage({
      id: 'r5',
      conversationId,
      senderId: MEMBRE.id,
      content: 'Je le mets dans le dossier de mars.',
      originalLanguage: 'fr',
      sender: { id: 'p-amina', displayName: MEMBRE.nom, userId: MEMBRE.id },
      createdAt: ilYA(16),
    }),
    senderParticipantId: 'p-amina',
    replyToId: 'r1',
    replyTo: {
      id: 'r1',
      content: 'The final review board.',
      originalLanguage: 'en',
      createdAt: ilYA(24),
      sender: { id: 'p-ibrahim', displayName: PAIR_ANGLOPHONE.nom, userId: PAIR_ANGLOPHONE.id },
    },
    deliveredCount: 3,
    readCount: 3,
  },
  {
    ...chargeDeMessage({
      id: 'r6',
      conversationId,
      senderId: PAIR_HISPANOPHONE.id,
      content: 'Superbe, c’était où ?',
      originalLanguage: 'fr',
      sender: { id: 'p-marta', displayName: PAIR_HISPANOPHONE.nom, userId: PAIR_HISPANOPHONE.id },
      createdAt: ilYA(14),
    }),
    senderParticipantId: 'p-marta',
    storyReplyToId: 'st1',
    postReplyTo: {
      id: 'st1',
      type: 'STORY',
      moodEmoji: null,
      previewText: 'Trois graphiques, deux surprises.',
      thumbnailUrl: null,
      reactionCount: 4,
      commentCount: 1,
      shareCount: 0,
      createdAt: ilYA(180),
      authorId: MEMBRE.id,
      authorName: MEMBRE.nom,
    },
  },
];

/**
 * UN PDF — le quatrième genre de la table (`GENRES_DE_PIECE`), que
 * `messagesRiches` ne porte pas : `v3-medias.spec.ts` en a besoin pour
 * couvrir l'onglet « Fichiers » de la galerie, et `media` (`cible/media.png`)
 * en a besoin pour la même raison — exporté ici plutôt que recopié, sous
 * peine de jumelle au premier champ qui dérive.
 */
export const messageDeFichier = (conversationId: string): MessageServi => ({
  ...chargeDeMessage({
    id: 'r7',
    conversationId,
    senderId: INVITE.id,
    content: '',
    originalLanguage: 'fr',
    sender: { id: INVITE.id, displayName: INVITE.nom, type: 'anonymous' },
    attachments: [
      {
        id: 'ar7',
        fileUrl: '2026/09/ar7/budget.pdf',
        originalName: 'budget.pdf',
        mimeType: 'application/pdf',
        fileSize: 1_258_291,
      },
    ],
    createdAt: ilYA(17),
  }),
  senderParticipantId: INVITE.id,
});

/**
 * UN MESSAGE PROTÉGÉ QUI PORTE UNE PHOTO — le témoin du cycle 125 (CLAUDE.md,
 * § Prisme) posé sur la galerie : elle ne doit JAMAIS servir l'URL d'une pièce
 * à vue unique. Même provenance que `messageDeFichier` ci-dessus.
 */
export const messageProtege = (conversationId: string): MessageServi => ({
  ...chargeDeMessage({
    id: 'r8',
    conversationId,
    senderId: INVITE.id,
    content: '',
    originalLanguage: 'fr',
    sender: { id: INVITE.id, displayName: INVITE.nom, type: 'anonymous' },
    attachments: [
      {
        id: 'ar8',
        fileUrl: '/api/v1/attachments/file/2026/secret-vue-unique.jpg',
        originalName: 'secret-vue-unique.jpg',
        mimeType: 'image/jpeg',
        fileSize: 512_000,
      },
    ],
    createdAt: ilYA(16),
  }),
  senderParticipantId: INVITE.id,
  isViewOnce: true,
});
