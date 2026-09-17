import { describe, expect, test } from 'bun:test';

import { SERVED_TEXT_STYLES, sceneTextAppearance } from './text-appearance';

describe('sceneTextAppearance — ce qu’un texte de scène porte SANS télécharger un octet', () => {
  test('un payload nu rend le voile de lisibilité, centré, sans famille imposée', () => {
    const look = sceneTextAppearance({});
    expect(look.textAlign).toBe('center');
    expect(look.fontFamily).toBeUndefined();
    expect(look.textShadow).toBe('0 1px 4px rgba(0,0,0,0.5)');
  });

  test('les cinq familles SERVIES n’exigent aucune police embarquée', () => {
    expect([...SERVED_TEXT_STYLES]).toEqual(['bold', 'neon', 'classic', 'italic', 'typewriter']);
  });

  test('`classic` est Georgia, `typewriter` une chasse fixe, `italic` penche', () => {
    expect(sceneTextAppearance({ textStyle: 'classic' }).fontFamily).toContain('Georgia');
    expect(sceneTextAppearance({ textStyle: 'typewriter' }).fontFamily).toContain('monospace');
    expect(sceneTextAppearance({ textStyle: 'italic' }).fontStyle).toBe('italic');
  });

  test('une famille NON servie (police embarquée) ne fabrique pas une typo au hasard', () => {
    // `zapfino`, `papyrus`… exigent un WOFF2 que ce lot ne charge pas : le
    // texte reste sur la police système plutôt que de retomber sur un serif
    // qui ferait croire à la bonne famille.
    expect(sceneTextAppearance({ textStyle: 'calligraphy' }).fontFamily).toBeUndefined();
  });

  test('`fontWeight` du payload gagne sur la graisse de la famille', () => {
    expect(sceneTextAppearance({ textStyle: 'bold' }).fontWeight).toBe(800);
    expect(sceneTextAppearance({ textStyle: 'bold', fontWeight: 'thin' }).fontWeight).toBe(200);
  });

  test('un effet REMPLACE le voile — il ne s’y ajoute pas', () => {
    const look = sceneTextAppearance({ textEffect: 'neonPink' });
    expect(look.textShadow).toContain('rgba(255,45,149');
    expect(look.textShadow).not.toContain('0 1px 4px rgba(0,0,0,0.5)');
  });

  test('un effet inconnu vaut « aucun », jamais une exception (contrat tolérant du blob)', () => {
    expect(sceneTextAppearance({ textEffect: 'licorne' }).textShadow).toBe('0 1px 4px rgba(0,0,0,0.5)');
  });

  test('le contour des GLYPHES se pose en em, relatif à la taille du texte', () => {
    const look = sceneTextAppearance({ borderColor: 'FF2E63', borderWidth: 4.8, fontSize: 96 });
    expect(look.webkitTextStroke).toBe('0.05em #FF2E63');
  });

  test('sans `borderColor`, aucun contour — pas de booléen à deviner', () => {
    expect(sceneTextAppearance({ borderWidth: 8 }).webkitTextStroke).toBeUndefined();
  });

  test('une pastille SOLIDE se lit dans les trois dialectes du corpus', () => {
    expect(sceneTextAppearance({ textBg: '000000' }).backgroundColor).toBe('#000000');
    expect(sceneTextAppearance({ backgroundStyle: { solid: '6366F1' } }).backgroundColor).toBe('#6366F1');
    expect(sceneTextAppearance({ backgroundStyle: { type: 'solid', hex: '34D399' } }).backgroundColor).toBe('#34D399');
  });

  test('`backgroundStyle` gagne sur `textBg`, la clé LEGACY', () => {
    expect(sceneTextAppearance({ textBg: '000000', backgroundStyle: { solid: 'FFFFFF' } }).backgroundColor).toBe('#FFFFFF');
  });

  test('`glass` reste HORS TRANCHE — aucune pastille inventée', () => {
    expect(sceneTextAppearance({ backgroundStyle: { type: 'glass', radius: 24 } }).backgroundColor).toBeUndefined();
  });

  test('la forme du cadre décide du rayon, `pill` étant le plus rond', () => {
    expect(sceneTextAppearance({ textBg: '000000', frameShape: 'rectangle' }).borderRadius).toBe('0');
    expect(sceneTextAppearance({ textBg: '000000', frameShape: 'pill' }).borderRadius).toBe('999px');
    expect(sceneTextAppearance({ textBg: '000000' }).borderRadius).toBe('0.25em');
  });

  test('le liseré de la BOÎTE est distinct du contour des glyphes', () => {
    const look = sceneTextAppearance({ frameBorderWidth: 4.8, frameBorderColor: '08D9D6', fontSize: 96 });
    expect(look.border).toBe('0.05em solid #08D9D6');
    expect(look.webkitTextStroke).toBeUndefined();
  });

  test('un liseré sans couleur est BLANC (parité iOS), jamais absent', () => {
    expect(sceneTextAppearance({ frameBorderWidth: 2, fontSize: 96 }).border).toContain('#FFFFFF');
  });

  test('`framePaddingScale` module le retrait, et reste borné 0…3', () => {
    expect(sceneTextAppearance({ textBg: '000000', framePaddingScale: 2 }).padding).toBe('0.4em 1em');
    expect(sceneTextAppearance({ textBg: '000000', framePaddingScale: 99 }).padding).toBe('0.6em 1.5em');
  });

  test('sans pastille NI liseré, aucun retrait — le texte ne se décale pas tout seul', () => {
    expect(sceneTextAppearance({}).padding).toBeUndefined();
  });

  test('l’alignement ne retient que les trois valeurs du contrat', () => {
    expect(sceneTextAppearance({ textAlign: 'left' }).textAlign).toBe('left');
    expect(sceneTextAppearance({ textAlign: 'justifié' }).textAlign).toBe('center');
  });
});
