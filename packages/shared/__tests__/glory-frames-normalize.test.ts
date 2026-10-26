import { describe, expect, it } from 'vitest';
import { withDeclaredBirds } from '../scripts/apply-glory-bird-layouts';
import { birdLayoutOf, birdTableOf, normalizeColor, normalizeWindow, targetOfSlug, usageOfTarget } from '../scripts/glory-frames-normalize';

describe('le normaliseur lit la cible d’un cadre dans son identifiant, avec les clés de la loi', () => {
  it('rangs à division, rangs à décorations, Mythe', () => {
    expect(targetOfSlug('savane', 'ambassadeur-5')).toEqual({ appliesTo: { family: 'rank', rank: 'ambassadeur', division: 5 }, option: 'V' });
    expect(targetOfSlug('neon', 'oracle-b')).toEqual({ appliesTo: { family: 'rank', rank: 'oracle', division: null }, option: 'B' });
    expect(targetOfSlug('egypte', 'mythe-c')).toEqual({ appliesTo: { family: 'rank', rank: 'mythe', division: null }, option: 'C' });
  });

  it('moments et trésor ; jamais la prose du manifeste', () => {
    expect(targetOfSlug('moments', 'palier-aurore')?.appliesTo).toEqual({ family: 'tier', tier: 'aurore' });
    expect(targetOfSlug('moments', 'flamme-365')?.appliesTo).toEqual({ family: 'flame', days: 365 });
    expect(['1', '10', '100', '1000'].map((n) => targetOfSlug('moments', `meesh-${n}`)?.appliesTo)).toEqual(
      ['first', 'silver', 'gold', 'prism'].map((edition) => ({ family: 'meesh', edition })),
    );
    expect(targetOfSlug('moments', 'meesh-7')).toBeNull();
    expect(targetOfSlug('moments', 'jour-b')).toEqual({ appliesTo: { family: 'day' }, option: 'b' });
    expect(targetOfSlug('tresor', 'coffre-c')).toEqual({ appliesTo: { family: 'treasury', treasury: 'coffre' }, option: 'c' });
    expect(targetOfSlug('savane', 'coffre-c')).toBeNull();
  });

  it('les hauts faits (LS, #10168) : une rareté par slug dans la collection `succes`, le neutre sans rareté, et rien ailleurs', () => {
    expect(['common', 'rare', 'epic', 'legendary', 'mythic'].map((rarity) => targetOfSlug('succes', rarity))).toEqual(
      ['common', 'rare', 'epic', 'legendary', 'mythic'].map((rarity) => ({ appliesTo: { family: 'achievement', rarity }, option: null })),
    );
    expect(targetOfSlug('succes', 'neutre')).toEqual({ appliesTo: { family: 'achievement', rarity: null }, option: null });
    expect(targetOfSlug('moments', 'rare')).toBeNull();
    expect(targetOfSlug('succes', 'unique')).toBeNull();
  });

  it('un cadre de rang sert son RANG, toutes divisions (D3 : les cinq décorations du rang se proposent à chaque division)', () => {
    expect(usageOfTarget({ family: 'rank', rank: 'ambassadeur', division: 3 })).toEqual({ kind: 'rank', rank: 'ambassadeur' });
    expect(usageOfTarget({ family: 'treasury', treasury: 'bourse' })).toEqual({ kind: 'moment', family: 'treasury' });
    expect(usageOfTarget({ family: 'achievement', rarity: null })).toEqual({ kind: 'achievement' });
    expect(usageOfTarget({ family: 'achievement', rarity: 'epic' })).toEqual({ kind: 'achievement', rarity: 'epic' });
  });
});

describe('les couleurs deviennent des données #RRGGBBAA', () => {
  it('hex court, long, avec alpha, rgb() avec opacité', () => {
    expect(normalizeColor('#fff')).toBe('#FFFFFFFF');
    expect(normalizeColor('#E8B53C')).toBe('#E8B53CFF');
    expect(normalizeColor('#00000099')).toBe('#00000099');
    expect(normalizeColor('rgb(255, 244, 194)', 0.5)).toBe('#FFF4C280');
    expect(() => normalizeColor('gold')).toThrow();
  });
});

describe('la mise en page des oiseaux, ramenée à la liste fermée', () => {
  it('le premier mot du manifeste, accents et pluriels compris ; une paire seule est un duo ; le selfie reste nommé', () => {
    expect(birdLayoutOf('perchés (Mee coucou, Meo cool)', 2)).toBe('perches');
    expect(birdLayoutOf('côtés', 2)).toBe('cotes');
    expect(birdLayoutOf('pied : Mee et Meo', 1)).toBe('duo');
    expect(birdLayoutOf('selfie : Meo prend la photo', 1)).toBe('selfie');
    expect(birdLayoutOf('balustrade', 2)).toBe('libre');
  });
});

describe('la fenêtre photo (#10254) : le chemin de l’export passe au contrat, son absence aussi', () => {
  const mask = { src: 'export/window.webp', bytes: 12, sha256: 'f3a02fd90d1e7461'.padEnd(64, '0'), box: [128, 528, 824, 948] as [number, number, number, number] };

  it('un export qui porte `window.path` le transmet tel quel, le masque restant adressé par contenu', () => {
    expect(normalizeWindow({ box: [128, 528, 824, 948], path: 'M128 528h824v948h-824Z', mask, veilMaxAlpha: 0 })).toEqual({
      box: [128, 528, 824, 948],
      path: 'M128 528h824v948h-824Z',
      mask: { src: 'f3a02fd90d1e7461.webp', bytes: 12, sha256: mask.sha256, box: [128, 528, 824, 948] },
      veilMaxAlpha: 0,
    });
  });

  it('un export d’avant #10254 (sans chemin, ou `null` pour un masque vide) ne pose aucune clé `path`', () => {
    expect(normalizeWindow({ box: [128, 528, 824, 948], mask, veilMaxAlpha: 0 })).not.toHaveProperty('path');
    expect(normalizeWindow({ box: [128, 528, 824, 948], path: null, mask, veilMaxAlpha: 0 })).not.toHaveProperty('path');
  });
});

describe('les mises en page déclarées (#10277) : chaque mise en page validée passe au contrat avec son verdict', () => {
  const bird = (pose: string, x: number) => ({ pose, box: [x, 1300, 260, 260] as [number, number, number, number], rotate: 0, flip: false, opacity: 1, art: [0, 0.05, 1, 0.9] as [number, number, number, number] });
  const ok = { overlap: 12, depth: 1, face: 0 };

  it('une table déclarée devient `birds` : défaut, mises en page, verdicts, rectangle du dessin', () => {
    const table = birdTableOf({
      default: 'pied',
      layouts: {
        pied: { birds: [bird('mee-fete', 0), bird('meo-roi', 800)], validated: ok },
        selfie: { birds: [bird('meo-selfie', 600)], validated: { overlap: 9000, depth: 90, face: 0 } },
      },
    });
    expect(table.default).toBe('pied');
    expect(Object.keys(table.layouts)).toEqual(['pied', 'selfie']);
    expect(table.layouts.pied?.mee?.art).toEqual([0, 0.05, 1, 0.9]);
    expect(table.layouts.selfie).toEqual({ meo: { sticker: 'meo-selfie', box: [600, 1300, 260, 260], rotate: 0, flip: false, opacity: 1, art: [0, 0.05, 1, 0.9] } });
    expect(table.validated).toEqual({ pied: ok, selfie: { overlap: 9000, depth: 90, face: 0 } });
  });

  it('un export d’avant #10277 (les oiseaux dessinés seuls) garde sa mise en page unique, sans verdict', () => {
    const table = birdTableOf([bird('mee-fete', 0), bird('meo-roi', 800)], 'pied');
    expect(Object.keys(table.layouts)).toEqual(['pied']);
    expect(table).not.toHaveProperty('validated');
  });
});

describe('`glory-frames:bird-layouts` pose les mises en page déclarées sur les contrats versionnés, sans réexport', () => {
  const bird = (pose: string, x: number) => ({ pose, box: [x, 1300, 260, 260] as [number, number, number, number], rotate: 0, flip: false, opacity: 1, art: [0, 0, 1, 1] as [number, number, number, number] });
  const record = { frame: 'savane-orateur-a', drawn: 'selfie' as const, default: 'pied' as const, layouts: { pied: { birds: [bird('mee-fete', 0), bird('meo-roi', 800)], validated: { overlap: 0, depth: 0, face: 0 } } } };
  const document = { collection: 'savane', frames: [{ id: 'savane.orateur-a', formats: { story: { size: [1080, 1920], birds: { default: 'selfie', layouts: { selfie: {} } } }, square: null } }] };

  it('seul `birds` du format story change, champ pour champ', () => {
    const next = withDeclaredBirds(document, [record]);
    expect(next.frames[0]?.formats.story.birds.default).toBe('pied');
    expect(next.frames[0]?.formats.story.size).toEqual([1080, 1920]);
    expect(next.frames[0]?.formats.square).toBeNull();
  });

  it('un cadre sans relevé arrête tout : rien n’entre à moitié', () => {
    expect(() => withDeclaredBirds(document, [])).toThrow(/savane-orateur-a/);
  });
});
