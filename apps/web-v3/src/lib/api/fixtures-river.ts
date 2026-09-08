import type { Conversation, Message } from './types';
import {
  VIEWER_ID,
  amina,
  bruno,
  conversationDefaults,
  fatou,
  kwame,
  message,
  minutesAgo,
  translation,
  viewer,
} from './fixtures-base';

/**
 * LE SALON RIVIÈRE (#5648) — EXTRAIT de `fixtures.ts` (#5696, étape 4a) : le
 * fichier avait franchi le budget de taille (1000-1200 lignes, `CLAUDE.md`
 * § Code Style) — même geste que #5695 a fait pour `fixtures-catchup.ts`.
 * EXTRACTION PURE pour le corpus des 40 messages : aucune ligne de
 * comportement ne change, `fixtures.ts` importe désormais ces exports et
 * réexporte les deux témoins historiques (`fixtures.test.ts` ne bouge pas).
 *
 * L'OUVERTURE du Salon (`RIVER_OPENING_MESSAGES`) vit dans
 * `fixtures-river-opening.ts` — module SANS importateur de production, pour
 * qu'un corpus que aucune route ne sert ne parte pas dans le chunk `reader`
 * (revue-correction #5696).
 *
 * La SEULE conversation du jeu qui DÉFILE assez pour que la scène du fil
 * (armement, élection, aplatissement, révélé) soit observable et
 * capturable. `c-deploiement` (7 messages) ne remplit jamais `<main>`
 * au-delà de sa hauteur visible — `check-reading-mode.mjs` §10 sautait sa
 * propre mesure faute de « scrollSlack » (spécification #5648 §2), ce qui
 * ne PROUVAIT rien. Quarante messages alternés, un jour, cinq participants
 * (`memberCount: 5`, condition d'éligibilité de la Rivière, D-21) — la
 * forme exacte du corpus semé sur staging (`targets/seed.md` §« Salon
 * Rivière »).
 *
 * `RIVER_CONVERSATION_ID` porte son propre `conversationId` : `message()`
 * spreads `messageDefaults` (lié à `CONVERSATION_ID`, l'Équipe déploiement)
 * AVANT `partial` — chaque entrée le RÉÉCRIT explicitement, jamais un
 * message du Salon Rivière n'hérite du fil voisin.
 */
export const RIVER_CONVERSATION_ID = 'c-salon-riviere';

/** Les 40 phrases, dans l'ordre chronologique (la plus ancienne en tête). */
const RIVER_LINES: readonly string[] = [
  "On ouvre le salon pour la revue de la v3.1.",
  "Bonjour à toutes et tous.",
  "Je partage l'ordre du jour dans une minute.",
  "Parfait, on commence par le fil ou par la liste ?",
  "Le fil d'abord — c'est l'écran phare de cette itération.",
  "Focal s'ouvre bien par défaut chez moi, sur les deux plateformes.",
  "Même chose ici, et l'accent de la conversation est cohérent.",
  "On regarde l'élection au défilement soutenu ensuite.",
  "J'ai vu la carte se poser après quelques secondes de scroll.",
  "Chez moi elle s'arme presque tout de suite au trackpad.",
  "C'est attendu : la vitesse arme dès le premier geste franc.",
  "Et au repos, la carte se démonte en douceur.",
  "Oui, le fondu est propre dans les deux schémas.",
  "L'heure et les coches restent masquées hors du geste, bien vu.",
  "Elles reviennent bien pendant le défilement, dans les deux modes.",
  "Script ne montre jamais de carte, comme prévu.",
  "Confirmé, densité uniforme du premier au dernier message.",
  "On passe à la traduction maintenant.",
  "Le drapeau du pied ouvre bien l'original.",
  "Et la pastille du Prisme fait la même chose au même endroit.",
  "Les réactions restent visibles hors du mode Bulles, très bien.",
  "On vérifie la citation avec saut, tant qu'on y est.",
  "Le saut fonctionne, et le message cité se met en évidence.",
  "Un aparté : le composeur grandit bien avec le texte long.",
  "Et l'envoi reste optimiste même hors ligne, marqué en échec proprement.",
  "On teste vite le clavier sur le fil, pour la scène aussi.",
  "PageUp répété arme la scène comme le défilement à la souris.",
  "Bien vu, c'est la même intention côté clavier.",
  "On regarde les deux coques avant de clore ce point.",
  "La safe-area basse est respectée sur iOS cette fois.",
  "Le retour matériel Android ramène bien à la liste.",
  "Et la bascule sombre/clair à chaud est répercutée sans relancer.",
  "Trois défauts de coque soldés d'un coup, notable.",
  "On passe à la liste avant de refermer la revue.",
  "Le rail de stories est là, les filtres ont un effet réel.",
  "La recherche reste en bas, à portée du pouce.",
  "Le badge de non-lus est cohérent avec le fil ouvert.",
  "Je pense qu'on a fait le tour pour aujourd'hui.",
  "Merci à toutes et tous, on se retrouve la semaine prochaine.",
  "À bientôt !",
];

/**
 * CHAQUE message du Salon Rivière est TRADUIT, et un sur cinq est écrit en
 * ANGLAIS (correction de revue #5648). Sans traduction, la ligne basse ne
 * monte pas (`mountsBottomLine`) et la bande de focus de la rangée élue
 * n'existe jamais : le gate §10 « armait, élisait, aplatissait » sans
 * jamais faire naître la moitié de ce que l'élection AJOUTE — un corpus qui
 * ne peut pas faire échouer un témoin ne peut pas le valider. Un sur cinq en
 * anglais fait en plus naître la pastille du Prisme (`servedLanguage ≠
 * originalLanguage`, la seule condition qui la rende).
 *
 * Les huit lignes ANGLAISES du Salon Rivière (une sur cinq) — la langue
 * D'ORIGINE de ces messages ; leur traduction française est la ligne
 * correspondante de `RIVER_LINES`, celle que le Prisme sert au lecteur
 * francophone.
 */
const RIVER_ENGLISH: Readonly<Record<number, string>> = {
  0: 'Opening the room for the v3.1 review.',
  5: 'Focal opens by default here, on both platforms.',
  10: "That's expected: velocity arms it on the first firm gesture.",
  15: 'Script never shows a card, as planned.',
  20: 'Reactions stay visible outside Bubbles mode, very good.',
  25: "Let's quickly test the keyboard on the thread, for the scene too.",
  30: 'The Android hardware back button does return to the list.',
  // `RIVER_LINES[35]` est « La recherche reste en bas, à portée du pouce. » —
  // ce libellé (rail de stories) est celui de `RIVER_LINES[34]`, un
  // décalage d'un cran hérité d'une réécriture antérieure du corpus
  // (correction de revue #5648, défaut majeur 4). Réutilisé tel quel comme
  // traduction anglaise de `RIVER_LINES_EN[34]` ci-dessous.
  35: 'The search stays at the bottom, within thumb’s reach.',
};

/**
 * LES TRENTE-DEUX TRADUCTIONS ANGLAISES RÉELLES des lignes françaises du
 * Salon Rivière (correction de revue #5648, défaut majeur 4) — table
 * PARALLÈLE à `RIVER_LINES`, symétrique de `RIVER_ENGLISH` : celle-ci porte
 * les huit messages D'ORIGINE anglaise, celle-là la traduction anglaise des
 * trente-deux messages D'ORIGINE française. Avant ce lot, la branche
 * française de `RIVER_MESSAGES` servait `content` (le français) comme SA
 * PROPRE traduction « en » : ouvrir 🇬🇧 sur un message français affichait le
 * français. Les huit indices de `RIVER_ENGLISH` sont ici IGNORÉS (la branche
 * anglaise ne lit jamais cette table), mais renseignés pour que le tableau
 * reste la traduction anglaise de CHAQUE ligne, sans trou.
 */
const RIVER_LINES_EN: readonly string[] = [
  'Opening the room for the v3.1 review.',
  'Hello everyone.',
  "I'll share the agenda in a minute.",
  'Great, do we start with the thread or the list?',
  "The thread first — it's the flagship screen this cycle.",
  'Focal opens by default here, on both platforms.',
  'Same here, and the conversation accent is consistent.',
  "Let's look at the election on sustained scroll next.",
  'I saw the card settle in after a few seconds of scrolling.',
  'Mine arms almost instantly on the trackpad.',
  "That's expected: velocity arms it on the first firm gesture.",
  'And at rest, the card flattens smoothly.',
  'Yes, the fade is clean in both schemes.',
  'The time and the checkmarks stay hidden outside the gesture, good catch.',
  'They do come back during scrolling, in both modes.',
  'Script never shows a card, as planned.',
  'Confirmed, uniform density from the first message to the last.',
  "Let's move on to translation now.",
  'The footer flag does open the original.',
  'And the Prism pastille does the same thing in the same spot.',
  'Reactions stay visible outside Bubbles mode, very good.',
  "Let's check the reply jump while we're at it.",
  'The jump works, and the quoted message gets highlighted.',
  'Side note: the composer grows nicely with long text.',
  'And sending stays optimistic even offline, marked as failed properly.',
  "Let's quickly test the keyboard on the thread, for the scene too.",
  'Repeated PageUp arms the scene just like scrolling with the mouse.',
  'Good catch, same intent on the keyboard side.',
  "Let's look at both shells before closing this point.",
  'The bottom safe area is respected on iOS this time.',
  'The Android hardware back button does return to the list.',
  'And the dark/light switch is reflected live, without a relaunch.',
  'Three shell defects fixed in one go, worth noting.',
  "Let's move to the list before we wrap up the review.",
  'The story rail is there, the filters have a real effect.',
  'The search stays at the bottom, within thumb’s reach.',
  'The unread badge is consistent with the open thread.',
  "I think we've covered everything for today.",
  'Thanks everyone, see you next week.',
  'See you soon!',
];

/**
 * DEUX RANGÉES-TÉMOINS DU DÉFAUT 1 (#5648, correction de revue) — avant ce
 * lot, `RIVER_MESSAGES` alternait STRICTEMENT l'auteur et traduisait CHAQUE
 * message : `mountsBottomLine` (`reading-mode/meta.ts`) ne pouvait donc
 * JAMAIS rendre `false` sur ce corpus — aucune rangée n'était ni une
 * CONTINUATION (`tail === false`) ni SANS traduction ni réaction, si bien
 * que le témoin §10 de `check-reading-mode.mjs` ne pouvait pas faire
 * échouer la garde « le tampon de focus ne recouvre jamais le texte qu'il
 * élit » sur une rangée SANS ligne basse — exactement la forme où le
 * recouvrement de 9 px a été mesuré. Un corpus qui ne peut pas faire
 * échouer un témoin ne peut pas le valider.
 *
 * - `RIVER_CONTINUATION_INDEX` (5) partage son auteur avec le message
 *   SUIVANT (6, forcé au même auteur ci-dessous) : `tail === false`,
 *   traduit, sans réaction — la forme « message qui n'est pas le dernier de
 *   son groupe ».
 * - `RIVER_NO_TRANSLATION_INDEX` (12) ne porte NI traduction NI réaction —
 *   la forme « message sans traduction ni réaction ». `frenchOriginals`
 *   (`fixtures.test.ts`) l'exclut explicitement de son invariant « chaque
 *   original français porte une traduction anglaise » : c'est le témoin
 *   VOULU qui le viole, pas un oubli.
 *
 * NI L'UN NI L'AUTRE index n'est choisi au hasard : le geste soutenu PAR
 * DÉFAUT de `check-reading-mode.mjs` §10 (4 200 ms à 400 px/s depuis le bas,
 * ~1 680 px, ~16 rangées de 104 px) élit une rangée proche de l'index ~23 —
 * les DEUX témoins restent loin de cette zone pour que le geste GÉNÉRIQUE
 * continue d'élire une rangée AVEC ligne basse (les witnesses historiques
 * de §10, boutons de la bande compris, le supposent) pendant que le geste
 * CIBLÉ (`electRow`, même script) vise ces deux-ci EXPLICITEMENT.
 */
const RIVER_CONTINUATION_INDEX = 5;
const RIVER_NO_TRANSLATION_INDEX = 12;
export const RIVER_CONTINUATION_WITNESS_ID = `riv-${RIVER_CONTINUATION_INDEX}`;
export const RIVER_NO_TRANSLATION_WITNESS_ID = `riv-${RIVER_NO_TRANSLATION_INDEX}`;

export const RIVER_MESSAGES: readonly Message[] = RIVER_LINES.map((content, i) => {
  // Le message suivant `RIVER_CONTINUATION_INDEX` est forcé au MÊME auteur
  // que lui (`amina`, la valeur que l'alternance lui donne déjà à cet
  // index) : c'est ce qui rend ce message non-`tail` — une continuation.
  const isForcedContinuation = i === RIVER_CONTINUATION_INDEX + 1;
  const author = isForcedContinuation ? amina : i % 2 === 0 ? viewer : amina;
  const id = `riv-${i}`;
  const speaksEnglish = i % 5 === 0;
  const isNoTranslationWitness = i === RIVER_NO_TRANSLATION_INDEX;
  return message({
    id,
    conversationId: RIVER_CONVERSATION_ID,
    senderId: author.userId ?? VIEWER_ID,
    sender: author,
    content: speaksEnglish ? RIVER_ENGLISH[i] ?? content : content,
    originalLanguage: speaksEnglish ? 'en' : 'fr',
    translations: isNoTranslationWitness
      ? []
      : speaksEnglish
        ? [translation(id, 'fr', content)]
        : [translation(id, 'en', RIVER_LINES_EN[i] ?? content)],
    createdAt: minutesAgo(50 - i),
  });
});

const riverLastMessage = RIVER_MESSAGES[RIVER_MESSAGES.length - 1] as Message;

export const RIVER_CONVERSATION: Conversation = {
  ...conversationDefaults,
  id: RIVER_CONVERSATION_ID,
  title: 'Salon Rivière',
  type: 'group',
  memberCount: 5,
  participants: [viewer, amina, kwame, fatou, bruno],
  /**
   * `unreadCount: 3`, PAS 26 (#5648 §9 question 7) : à 26 la loi de choix
   * de mode élirait `summary` (Résumé), clampé `focal` faute de rendu —
   * vrai mais BRUYANT pour ce lot, qui vérifie l'élection FOCALE. #5695 a
   * choisi un corpus DISTINCT, `c-rattrapage`, parce que ce gate a besoin
   * d'un fil qui s'ouvre en FOCAL — un même corpus, deux lots, jamais deux
   * fixtures jumelles.
   */
  unreadCount: 3,
  lastMessage: riverLastMessage,
  lastMessageAt: riverLastMessage.createdAt,
  lastMessageOriginalLanguage: 'fr',
};
