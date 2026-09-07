import type { Conversation, Message } from './modele';

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

/** `aM(90)` = il y a 90 minutes. Le fil se lit donc toujours comme aujourd'hui. */
const aM = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();

const moi = { id: 'u-moi', nom: 'Vous', initiales: 'VO', teinte: 1, presence: 'en-ligne' } as const;
const amina = { id: 'u-amina', nom: 'Amina Diallo', initiales: 'AD', teinte: 2, presence: 'en-ligne' } as const;
const kwame = { id: 'u-kwame', nom: 'Kwame Mensah', initiales: 'KM', teinte: 3, presence: 'absent' } as const;

export const MESSAGES: readonly Message[] = [
  {
    id: 'm1',
    auteur: amina,
    deMoi: false,
    contenu: 'Good morning! Did the deployment finish last night?',
    langueOriginale: 'en',
    traductions: [{ langue: 'fr', texte: 'Bonjour ! Est-ce que le deploiement a fini cette nuit ?' }],
    envoyeA: aM(96),
    etat: 'lu',
  },
  {
    id: 'm2',
    auteur: moi,
    deMoi: true,
    contenu: 'Oui, tout est passe vers 3h. Je te montre le rapport.',
    langueOriginale: 'fr',
    traductions: [{ langue: 'en', texte: 'Yes, everything went through around 3am. Let me show you the report.' }],
    envoyeA: aM(94),
    etat: 'lu',
  },
  {
    id: 'm3',
    auteur: moi,
    deMoi: true,
    contenu: '',
    langueOriginale: 'fr',
    traductions: [],
    envoyeA: aM(93),
    etat: 'lu',
    pieces: [
      {
        genre: 'image',
        url: '',
        largeur: 1200,
        hauteur: 800,
        description: 'Capture du tableau de bord de deploiement, tout au vert',
      },
    ],
  },
  {
    id: 'm4',
    auteur: kwame,
    deMoi: false,
    contenu: 'Nice. One thing though — the cold start is still above two seconds on 3G.',
    langueOriginale: 'en',
    // Aucune traduction francaise : le Prisme doit servir l'ORIGINAL, jamais
    // retomber sur la premiere traduction venue.
    traductions: [{ langue: 'es', texte: 'Bien. Pero el arranque en frio sigue por encima de dos segundos en 3G.' }],
    envoyeA: aM(87),
    etat: 'lu',
  },
  {
    id: 'm5',
    auteur: amina,
    deMoi: false,
    contenu: '',
    langueOriginale: 'en',
    traductions: [],
    envoyeA: aM(85),
    etat: 'lu',
    pieces: [
      {
        genre: 'vocal',
        duree: 14,
        transcrit: "J'ai regarde les mesures, c'est surtout le routeur qui pese.",
        ondes: [
          0.2, 0.5, 0.8, 0.6, 0.9, 0.4, 0.7, 1, 0.6, 0.3, 0.5, 0.8, 0.9, 0.5, 0.2, 0.6, 0.8, 0.4, 0.7, 0.3, 0.5, 0.9,
          0.6, 0.2, 0.4, 0.7, 0.5, 0.3,
        ],
      },
    ],
  },
  {
    id: 'm6',
    auteur: moi,
    deMoi: true,
    contenu: 'Exact. On peut passer a un routeur plus leger, ca ferait -24 Ko.',
    langueOriginale: 'fr',
    traductions: [{ langue: 'en', texte: 'Right. We could move to a lighter router, that would save 24 KB.' }],
    envoyeA: aM(83),
    etat: 'remis',
    repondA: { id: 'm4', auteur: 'Kwame Mensah', extrait: 'the cold start is still above two seconds on 3G' },
    reactions: [{ glyphe: '👍', compte: 2, parMoi: false }],
  },
  {
    id: 'm7',
    auteur: moi,
    deMoi: true,
    contenu: 'Je pousse la mesure ce soir.',
    langueOriginale: 'fr',
    traductions: [],
    envoyeA: aM(82),
    etat: 'en-attente',
  },
];

export const CONVERSATIONS: readonly Conversation[] = [
  {
    id: 'c-equipe',
    titre: 'Equipe produit',
    initiales: 'EP',
    teinte: 1,
    estGroupe: true,
    participants: 6,
    presence: 'en-ligne',
    dernierMessage: {
      contenu: 'Je pousse la mesure ce soir.',
      langueOriginale: 'fr',
      traductions: [],
      auteur: 'Vous',
      a: aM(82),
    },
    nonLus: 0,
    enSourdine: false,
  },
  {
    id: 'c-amina',
    titre: 'Amina Diallo',
    initiales: 'AD',
    teinte: 2,
    estGroupe: false,
    participants: 2,
    presence: 'en-ligne',
    dernierMessage: {
      contenu: 'See you tomorrow at the office!',
      langueOriginale: 'en',
      traductions: [{ langue: 'fr', texte: 'A demain au bureau !' }],
      auteur: 'Amina Diallo',
      a: aM(116),
    },
    nonLus: 3,
    enSourdine: false,
  },
  {
    id: 'c-kwame',
    titre: 'Kwame Mensah',
    initiales: 'KM',
    teinte: 3,
    estGroupe: false,
    participants: 2,
    presence: 'absent',
    dernierMessage: {
      contenu: 'Sent the invoice',
      langueOriginale: 'en',
      traductions: [],
      auteur: 'Kwame Mensah',
      a: aM(1_000),
    },
    nonLus: 0,
    enSourdine: true,
  },
  {
    id: 'c-lagos',
    titre: 'Lagos · terrain',
    initiales: 'LT',
    teinte: 4,
    estGroupe: true,
    participants: 12,
    presence: 'inactif',
    dernierMessage: {
      contenu: 'Le relais de Yaba est de nouveau en ligne.',
      langueOriginale: 'fr',
      traductions: [{ langue: 'en', texte: 'The Yaba relay is back online.' }],
      auteur: 'Fatou',
      a: aM(1_265),
    },
    nonLus: 12,
    enSourdine: false,
  },
];
