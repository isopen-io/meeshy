import type { Conversation, Message } from './model';

/**
 * Les donnees du POC. Fixture FIXE et non aleatoire : c'est ce qui permet aux
 * mesures de poids et aux captures de suivre le CODE et non les donnees (la v3
 * en avait fait la regle pour `documents_du_fil`).
 *
 * Les HORAIRES, en revanche, sont ancres sur MAINTENANT et non sur une date
 * ecrite en dur. Une fixture datee du 6 septembre affichait « Aujourd'hui »
 * le 6 et « Hier » le 7 : les captures changeaient de sens pendant la nuit, et
 * un temoin qui cherchait « Aujourd'hui » tombait sans qu'une ligne de code ait
 * bouge. Ce qui doit etre fixe, c'est la FORME du jeu (combien de messages, de
 * quels genres, dans quelles langues) — pas l'instant ou on le regarde.
 *
 * Le contenu est deliberement MULTILINGUE et desequilibre : un message ecrit en
 * anglais avec une traduction francaise, un ecrit en francais sans traduction,
 * un ecrit en anglais SANS traduction francaise. C'est le seul jeu qui fait
 * tomber un resolveur de Prisme faux — un jeu tout-francais rendrait vert
 * n'importe quelle implementation.
 */

/** `minutesAgo(90)` = il y a 90 minutes. Le fil se lit donc toujours comme aujourd'hui. */
const minutesAgo = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();

const mine = { id: 'u-moi', name: 'Vous', initials: 'VO', tint: 1, presence: 'online' } as const;
const amina = { id: 'u-amina', name: 'Amina Diallo', initials: 'AD', tint: 2, presence: 'online' } as const;
const kwame = { id: 'u-kwame', name: 'Kwame Mensah', initials: 'KM', tint: 3, presence: 'away' } as const;

export const MESSAGES: readonly Message[] = [
  {
    id: 'm1',
    author: amina,
    isMine: false,
    content: 'Good morning! Did the deployment finish last night?',
    originalLanguage: 'en',
    translations: [{ language: 'fr', text: 'Bonjour ! Est-ce que le deploiement a fini cette nuit ?' }],
    sentAt: minutesAgo(96),
    status: 'read',
  },
  {
    id: 'm2',
    author: mine,
    isMine: true,
    content: 'Oui, tout est passe vers 3h. Je te montre le rapport.',
    originalLanguage: 'fr',
    translations: [{ language: 'en', text: 'Yes, everything went through around 3am. Let me show you the report.' }],
    sentAt: minutesAgo(94),
    status: 'read',
  },
  {
    id: 'm3',
    author: mine,
    isMine: true,
    content: '',
    originalLanguage: 'fr',
    translations: [],
    sentAt: minutesAgo(93),
    status: 'read',
    attachments: [
      {
        kind: 'image',
        url: '',
        width: 1200,
        height: 800,
        description: 'Capture du tableau de bord de deploiement, tout au vert',
      },
    ],
  },
  {
    id: 'm4',
    author: kwame,
    isMine: false,
    content: 'Nice. One thing though — the cold start is still above two seconds on 3G.',
    originalLanguage: 'en',
    // Aucune traduction francaise : le Prisme doit servir l'ORIGINAL, jamais
    // retomber sur la premiere traduction venue.
    translations: [{ language: 'es', text: 'Bien. Pero el arranque en frio sigue por encima de dos segundos en 3G.' }],
    sentAt: minutesAgo(87),
    status: 'read',
  },
  {
    id: 'm5',
    author: amina,
    isMine: false,
    content: '',
    originalLanguage: 'en',
    translations: [],
    sentAt: minutesAgo(85),
    status: 'read',
    attachments: [
      {
        kind: 'voice',
        duration: 14,
        transcript: "J'ai regarde les mesures, c'est surtout le routeur qui pese.",
        waves: [
          0.2, 0.5, 0.8, 0.6, 0.9, 0.4, 0.7, 1, 0.6, 0.3, 0.5, 0.8, 0.9, 0.5, 0.2, 0.6, 0.8, 0.4, 0.7, 0.3, 0.5, 0.9,
          0.6, 0.2, 0.4, 0.7, 0.5, 0.3,
        ],
      },
    ],
  },
  {
    id: 'm6',
    author: mine,
    isMine: true,
    content: 'Exact. On peut passer a un routeur plus leger, ca ferait -24 Ko.',
    originalLanguage: 'fr',
    translations: [{ language: 'en', text: 'Right. We could move to a lighter router, that would save 24 KB.' }],
    sentAt: minutesAgo(83),
    status: 'delivered',
    repliesTo: { id: 'm4', author: 'Kwame Mensah', excerpt: 'the cold start is still above two seconds on 3G' },
    reactions: [{ glyph: '👍', count: 2, isMine: false }],
  },
  {
    id: 'm7',
    author: mine,
    isMine: true,
    content: 'Je pousse la mesure ce soir.',
    originalLanguage: 'fr',
    translations: [],
    sentAt: minutesAgo(82),
    status: 'pending',
  },
];

export const CONVERSATIONS: readonly Conversation[] = [
  {
    id: 'c-equipe',
    title: 'Equipe produit',
    initials: 'EP',
    tint: 1,
    isGrouped: true,
    participants: 6,
    presence: 'online',
    lastMessage: {
      content: 'Je pousse la mesure ce soir.',
      originalLanguage: 'fr',
      translations: [],
      author: 'Vous',
      at: minutesAgo(82),
    },
    unread: 0,
    muted: false,
  },
  {
    id: 'c-amina',
    title: 'Amina Diallo',
    initials: 'AD',
    tint: 2,
    isGrouped: false,
    participants: 2,
    presence: 'online',
    lastMessage: {
      content: 'See you tomorrow at the office!',
      originalLanguage: 'en',
      translations: [{ language: 'fr', text: 'A demain au bureau !' }],
      author: 'Amina Diallo',
      at: minutesAgo(116),
    },
    unread: 3,
    muted: false,
  },
  {
    id: 'c-kwame',
    title: 'Kwame Mensah',
    initials: 'KM',
    tint: 3,
    isGrouped: false,
    participants: 2,
    presence: 'away',
    lastMessage: {
      content: 'Sent the invoice',
      originalLanguage: 'en',
      translations: [],
      author: 'Kwame Mensah',
      at: minutesAgo(1_000),
    },
    unread: 0,
    muted: true,
  },
  {
    id: 'c-lagos',
    title: 'Lagos · terrain',
    initials: 'LT',
    tint: 4,
    isGrouped: true,
    participants: 12,
    presence: 'idle',
    lastMessage: {
      content: 'Le relais de Yaba est de nouveau en ligne.',
      originalLanguage: 'fr',
      translations: [{ language: 'en', text: 'The Yaba relay is back online.' }],
      author: 'Fatou',
      at: minutesAgo(1_265),
    },
    unread: 12,
    muted: false,
  },
];
