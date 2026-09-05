import { ATOUTS } from './contenu';

/**
 * LA PONCTUATION DE LA VITRINE — quel glyphe accompagne quel atout.
 *
 * POURQUOI UN FICHIER, ET PAS UN CHAMP DE `contenu.ts`
 *
 * `contenu.ts` porte la landing du legacy « mot pour mot » : c'est son contrat,
 * et il est gagé (`__tests__/vitrine.test.ts`). Un glyphe n'y est pas un mot du
 * legacy — c'est une décision de FORME de la v3 (charte § 12.5 règle 23 : « le
 * glyphe ponctue, il ne décore pas »). L'ajouter au contenu aurait rendu la
 * copie impossible à comparer à sa source le jour de la migration.
 *
 * POURQUOI UNE CARTE PAR TITRE, ET PAS UN TABLEAU PARALLÈLE
 *
 * Un tableau indexé se désaligne EN SILENCE dès qu'un atout est inséré au
 * milieu : la neuvième carte prendrait le glyphe de la huitième et rien ne
 * rougirait. La carte est indexée par le TITRE, donc un atout ajouté sans son
 * glyphe fait tomber `glypheDeLAtout` sur son repli — et le témoin
 * `glyphesManquants()` le NOMME avant qu'un lecteur ne le voie.
 *
 * Les neuf noms sont pris au sprite commité (`packages/icons/sprite.svg`) ;
 * `__tests__/vitrine.test.ts` vérifie qu'ils y ont tous un tracé.
 */

/** La pastille du héros — le badge « Traduction en temps réel » de la planche. */
export const GLYPHE_DU_BADGE = 'ph-translate';

/**
 * Le repli d'un atout dont personne n'a choisi le glyphe : une étincelle plutôt
 * qu'un trou. Un atout sans tuile casserait l'alignement de la grille, et le
 * lecteur paierait l'oubli du contributeur.
 */
export const GLYPHE_PAR_DEFAUT = 'ph-sparkle';

const GLYPHES: Readonly<Record<string, string>> = {
  'Traduction en temps réel': 'ph-translate',
  'Support multi-langues': 'ph-globe-hemisphere-west',
  'Privé et sécurisé': 'ph-lock-key',
  'Chats de groupe': 'ph-chats-circle',
  'Détection automatique': 'ph-sparkle',
  'Interface moderne': 'ph-paint-brush',
  'Traduction universelle': 'ph-arrow-bend-up-right',
  'Salles de classe multilingues': 'ph-users-three',
  'Collègues internationaux': 'ph-address-book',
};

export const glypheDeLAtout = (titre: string): string => GLYPHES[titre] ?? GLYPHE_PAR_DEFAUT;

/**
 * Les atouts que la carte ne connaît pas. Zéro entrée est la phrase du témoin ;
 * elle ne vaut que parce que `ATOUTS` est lu ici, et non recopié.
 */
export const glyphesManquants = (): readonly string[] =>
  ATOUTS.map((atout) => atout.titre).filter((titre) => GLYPHES[titre] === undefined);
