import { join } from 'path';

import {
  DOCTRINE_FILES,
  commentBlocks,
  depouiller,
  estUnPassageDeDoctrine,
  juger,
  sweepActivityOrderingDoctrine,
} from './activity-ordering-doctrine';

/**
 * **LE CLIQUET DE LA DOCTRINE D'ORDONNANCEMENT** (#20414) — inventaire de
 * violations VIDE.
 *
 * Il n'y a pas de doctrine locale légitime à porter : quand ce cliquet tombe,
 * la réparation est de renvoyer à la décision du 2026-11-27, jamais d'ajouter
 * une ligne d'inventaire.
 *
 * Ce qu'il garde, et qu'aucun cliquet voisin ne peut voir : les quatre
 * balayages de porte d'émission (`server-emit-door-sweep.ts`) commencent par
 * `stripComments`. Une doctrine écrite en commentaire leur est invisible par
 * construction — et c'est en commentaire qu'elle vivait, en deux exemplaires
 * contradictoires.
 */
const SRC = join(__dirname, '..', '..');

describe('la doctrine d’ordonnancement d’une activité à compteur ABSOLU est écrite UNE fois (#20414)', () => {
  it('le balayage regarde quelque chose — chaque site connu rend au moins un passage', () => {
    const { passages } = sweepActivityOrderingDoctrine(SRC);
    const parFichier = new Set(passages.map((p) => p.file));
    /* Une garde négative dont le balayage rend `[]` reste VERTE : elle doit
       d'abord prouver qu'elle lit les fichiers qu'elle prétend tenir. */
    for (const file of DOCTRINE_FILES) {
      expect(parFichier.has(file)).toBe(true);
    }
    expect(passages.length).toBeGreaterThanOrEqual(DOCTRINE_FILES.length);
  });

  it('aucun passage ne promet un ordre, et chacun renvoie à la décision', () => {
    const { violations } = sweepActivityOrderingDoctrine(SRC);
    expect(
      violations.map((v) => `${v.file} [${v.kind}] ${v.detail}\n    ${v.excerpt.slice(0, 180)}`),
    ).toEqual([]);
  });
});

describe('le cliquet TOMBE — les trois promesses refusées et la citation absente', () => {
  const passage = (excerpt: string) => ({ file: 'fixture.ts', excerpt });

  it.each([
    ['deux lectures concurrentes rendent le même total final (#20414)', 'rendent le même total final'],
    ["résolue avant l’écriture, l’émission reste synchrone juste après elle (#20414)", 'reste synchrone'],
    ["les rendre asynchrones décorrélait l'ORDRE du fil de l'ordre des écritures (#20414)", "l'ORDRE du fil de l'ordre des écritures"],
  ])('refuse « %s »', (excerpt, motif) => {
    const violations = juger(passage(excerpt));
    expect(violations.map((v) => v.kind)).toEqual(['promesse-d-ordre']);
    expect(violations[0]?.detail).toContain(motif);
  });

  it('refuse un passage qui réexplique la doctrine chez lui sans citer la décision', () => {
    const violations = juger(passage('la charge est ABSOLUE, donc résolue AVANT la mutation'));
    expect(violations.map((v) => v.kind)).toEqual(['citation-absente']);
  });

  it('un passage conforme ne rend aucune violation', () => {
    expect(juger(passage('charge ABSOLUE, résolue AVANT la mutation — doctrine : décision du 2026-11-27 (#20414)'))).toEqual([]);
  });
});

describe('le discriminant exige les DEUX marques, et ne lit QUE des commentaires', () => {
  it('une priorité ABSOLUE sans ordonnancement n’est pas un passage de doctrine', () => {
    expect(estUnPassageDeDoctrine('/** le Prisme lit `systemLanguage` en priorité ABSOLUE */')).toBe(false);
  });

  it('un ordonnancement sans charge absolue n’en est pas un non plus', () => {
    expect(estUnPassageDeDoctrine('/** la ligne est lue APRÈS la mutation, pour son roster */')).toBe(false);
  });

  it('les deux ensemble en font un', () => {
    expect(estUnPassageDeDoctrine('/** charge ABSOLUE, résolue AVANT la mutation */')).toBe(true);
  });

  it('une chaîne qui ressemble à un commentaire n’est pas lue', () => {
    const source = 'const url = "https://x/y"; // charge ABSOLUE, AVANT la mutation\nconst s = "/* charge ABSOLUE, AVANT la mutation */";\n';
    const blocks = commentBlocks(source);
    expect(blocks.filter(estUnPassageDeDoctrine)).toHaveLength(1);
  });

  it('le dépouillement replie un doc-comment sur une ligne lisible', () => {
    expect(depouiller('/**\n * charge ABSOLUE\n * AVANT la mutation\n */')).toBe('charge ABSOLUE AVANT la mutation');
  });
});
