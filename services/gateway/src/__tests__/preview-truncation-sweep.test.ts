/**
 * #8754 — un aperçu de contenu utilisateur se coupe par point de code.
 *
 * Le balayage garde la FORME qui a produit le défaut ; ces tests gardent le
 * balayage. Le premier vérifie que le scanner reconnaît encore la forme qu'il
 * interdit (même précaution que `apps/ios/scripts/check_pbxproj_quoting.sh`,
 * qui se mesure sur une fixture avant de juger le dépôt) ; sans lui, une
 * expression régulière cassée passerait au vert en annonçant zéro coupe.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  MOTIF_INTERDIT,
  PORTEURS,
  IMPORT_ATTENDU,
  RACINE,
  coupesInterdites,
} from './helpers/preview-truncation-sweep';

describe('la troncature des aperçus (#8754)', () => {
  it('le scanner reconnaît la forme qu’il interdit, et elle seule', () => {
    const interdites = [
      "commentPreview: comment.content?.slice(0, 80) ?? ''",
      'previewText: post.content.slice(0, PREVIEW_MAX)',
      '? params.subtitle.trim().slice(0, 160)',
      'const p = row.previewText.slice(0, 40);',
    ];
    const permises = [
      'commentPreview: sliceCodePoints(comment.content, 80)',
      'const contentType = header.slice(0, 16);',
      'const ids = participants.slice(0, 10);',
      "previewText: sliceCodePoints((post.content ?? '').trim(), PREVIEW_MAX),",
    ];
    expect(interdites.filter((l) => MOTIF_INTERDIT.test(l))).toEqual(interdites);
    expect(permises.filter((l) => MOTIF_INTERDIT.test(l))).toEqual([]);
  });

  it('aucune coupe d’aperçu en unités UTF-16 ne subsiste dans le gateway', () => {
    const coupes = coupesInterdites();
    expect(
      coupes.map((c) => `${c.fichier}:${c.ligne} — ${c.texte}`),
    ).toEqual([]);
  });

  it('les porteurs tiennent leur import du découpage par point de code', () => {
    const sans = PORTEURS.filter(
      (relatif) => !readFileSync(join(RACINE, relatif), 'utf8').includes(IMPORT_ATTENDU),
    );
    expect(sans).toEqual([]);
  });
});
