/**
 * #6091 — **aucun `false` littéral non justifié dans un instantané de droits
 * de `link-admission.ts`.**
 *
 * Deux sites de ce fichier composent un instantané `ParticipantPermissions` au
 * moment où quelqu'un entre par un lien de partage — l'un pour l'invité
 * anonyme, l'autre pour l'utilisateur nommé (`linkMemberFields`). Les deux
 * écrivaient `canSendVideos: false, canSendAudios: false` **en dur**, alors que
 * `ConversationShareLink` ne porte aucun drapeau vidéo ni audio : ce `false`
 * n'était pas un choix recopié, c'était une INVENTION du site qui recopie —
 * l'hôte n'avait jamais été consulté.
 *
 * Patron de `security/link-admission-single-source-guard.test.ts` (#4167 c.6)
 * et de `unit/utils/cursor-pagination-single-law-guard.test.ts` (#4175 c.5) :
 * une garde de SOURCE, qui lit le texte du fichier plutôt que son
 * comportement — le comportement est déjà couvert par
 * `unit/routes/link-admission.test.ts`, mais un témoin comportemental ne
 * protège que les cas qu'il énumère. Une garde de source protège contre un
 * TROISIÈME `false` qui apparaîtrait demain sur un droit que personne n'a
 * encore pensé à tester.
 *
 * ## Ce que la garde tolère, et pourquoi
 *
 * `canSendLocations: false` et `canSendLinks: false` restent dans le fichier
 * — ce sont des refus ASSUMÉS, alignés sur `NEW_MEMBER_PERMISSIONS`
 * (`services/participantRights.ts:119`) : le lien ne porte aucun drapeau
 * position/lien, et rien ne dit qu'un visiteur ou un nouveau membre devrait
 * les émettre avant un geste explicite. Les nommer dans un ALLOWLIST, plutôt
 * que de les laisser passer par accident, documente pourquoi la garde ne
 * rougit pas dessus.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PARTICIPANT_RIGHT_NAMES, type ParticipantRightName } from '../../services/participantRights';

const LINK_ADMISSION_PATH = join(__dirname, '../../routes/conversations/link-admission.ts');

/**
 * Refus ASSUMÉS — ils figurent tels quels dans `NEW_MEMBER_PERMISSIONS`, et un
 * lien de partage ne porte de toute façon aucun drapeau position/lien pour les
 * gouverner autrement.
 */
const REFUS_ASSUMES: ReadonlySet<ParticipantRightName> = new Set(['canSendLocations', 'canSendLinks']);

const RIGHT_NAME_ALTERNATION = PARTICIPANT_RIGHT_NAMES.join('|');
const DROIT_A_FALSE = new RegExp(`\\b(${RIGHT_NAME_ALTERNATION})\\s*:\\s*false\\b`, 'g');

/** Dépouille les commentaires — un `false` cité pour EXPLIQUER l'ancien bug n'est pas le bug. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

/**
 * Les droits fixés à `false` en dur, hors de l'ALLOWLIST — dans le CODE
 * uniquement, jamais dans un commentaire. Exposée pour être exercée sur du
 * texte SYNTHÉTIQUE : une garde négative dont on n'a pas prouvé qu'elle sait
 * rougir n'est pas une garde.
 */
export function droitsNonJustifies(source: string): ParticipantRightName[] {
  const code = sansCommentaires(source);
  const trouves = new Set<ParticipantRightName>();
  for (const match of code.matchAll(DROIT_A_FALSE)) {
    const droit = match[1] as ParticipantRightName;
    if (!REFUS_ASSUMES.has(droit)) trouves.add(droit);
  }
  return [...trouves].sort();
}

describe('le balayage sait reconnaître le motif — sinon la garde serait verte à vide', () => {
  it('reconnaît un `false` littéral sur un droit HORS allowlist', () => {
    expect(droitsNonJustifies('canSendVideos: false,')).toEqual(['canSendVideos']);
    expect(droitsNonJustifies('canSendAudios: false,')).toEqual(['canSendAudios']);
  });

  it('tolère `canSendLocations`/`canSendLinks` — refus ASSUMÉS, documentés ci-dessus', () => {
    expect(droitsNonJustifies('canSendLocations: false,\ncanSendLinks: false,')).toEqual([]);
  });

  it('ne compte pas un `false` cité en COMMENTAIRE', () => {
    expect(droitsNonJustifies('// avant #6091 : canSendVideos: false\nconst x = 1;')).toEqual([]);
    expect(droitsNonJustifies('/* canSendAudios: false — l\'ancien bug */')).toEqual([]);
  });

  it('ne compte pas une valeur DÉRIVÉE — seul le littéral `false` compte', () => {
    expect(droitsNonJustifies('canSendVideos: shareLink.allowAnonymousFiles,')).toEqual([]);
    expect(droitsNonJustifies('canSendAudios: someFlag ? false : true,')).toEqual([]);
  });

  it('dédoublonne : deux occurrences du MÊME droit ne comptent qu\'une fois', () => {
    expect(droitsNonJustifies('canSendVideos: false,\ncanSendVideos: false,')).toEqual(['canSendVideos']);
  });
});

describe('#6091 — link-admission.ts ne fige plus `canSendVideos`/`canSendAudios` à `false`', () => {
  it('aucun droit non justifié ne subsiste dans le fichier', () => {
    const source = readFileSync(LINK_ADMISSION_PATH, 'utf8');
    expect(droitsNonJustifies(source)).toEqual([]);
  });

  it('contre-épreuve — un `false` réintroduit sur `canSendVideos` ferait tomber la garde', () => {
    const source = readFileSync(LINK_ADMISSION_PATH, 'utf8');
    const reoffending = source.replace(
      'canSendVideos: shareLink.allowAnonymousFiles,',
      'canSendVideos: false,',
    );
    expect(reoffending).not.toEqual(source); // preuve que le remplacement a bien matché quelque chose
    expect(droitsNonJustifies(reoffending)).toEqual(['canSendVideos']);
  });

  it('contre-épreuve — un `false` réintroduit sur `canSendAudios` (site nommé) ferait tomber la garde', () => {
    const source = readFileSync(LINK_ADMISSION_PATH, 'utf8');
    const reoffending = source.replace(
      /canSendAudios: true,\n(\s*)\/\/ Refus ASSUMÉS/,
      'canSendAudios: false,\n$1// Refus ASSUMÉS',
    );
    expect(reoffending).not.toEqual(source);
    expect(droitsNonJustifies(reoffending)).toEqual(['canSendAudios']);
  });

  it('le fichier tolère toujours explicitement les deux refus assumés — la garde ne rougit pas dessus', () => {
    const source = readFileSync(LINK_ADMISSION_PATH, 'utf8');
    expect(source).toMatch(/canSendLocations:\s*false/);
    expect(source).toMatch(/canSendLinks:\s*false/);
  });
});
