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
