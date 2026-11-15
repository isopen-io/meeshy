import { describe, expect, test } from 'bun:test';

import { SERVED_TEXT_STYLES, sceneTextAppearance } from './text-appearance';

describe('sceneTextAppearance — ce qu’un texte de scène porte SANS télécharger un octet', () => {
  test('un payload nu rend le voile de lisibilité, centré, sans famille imposée', () => {
    const look = sceneTextAppearance({});
    expect(look.textAlign).toBe('center');
    expect(look.fontFamily).toBeUndefined();
    expect(look.textShadow).toBe('0 1px 4px rgba(0,0,0,0.5)');
  });

  test('les DIX-HUIT familles d’iOS sont servies, dans l’ordre de ses pickers', () => {
    expect([...SERVED_TEXT_STYLES]).toEqual([
      'bold',
      'neon',
      'typewriter',
      'handwriting',
      'classic',
      'calligraphy',
      'cartoon',
      'futuristic',
      'fantasy',
      'curve',
      'tag',
      'italic',
      'retro',
      'elegant',
      'poster',
      'bubble',
      'note',
      'brush',
    ]);
  });

  test('`classic` est Georgia, `typewriter` une chasse fixe, `italic` penche', () => {
    expect(sceneTextAppearance({ textStyle: 'classic' }).fontFamily).toContain('Georgia');
    expect(sceneTextAppearance({ textStyle: 'typewriter' }).fontFamily).toContain('monospace');
    expect(sceneTextAppearance({ textStyle: 'italic' }).fontStyle).toBe('italic');
  });

  test('une famille à police embarquée porte SA pile, jamais un générique', () => {
    // `calligraphy` (Zapfino côté iOS) est peinte par le substitut redistribuable
    // que `story-fonts.ts` déclare ; derrière lui vient la pile NATIVE, pour
    // qu'un fichier qui n'arrive pas rende la police système plutôt qu'un
    // serif qui ferait croire à la bonne famille.
    expect(sceneTextAppearance({ textStyle: 'calligraphy' }).fontFamily).toBe("'Italianno', var(--font-native)");
    expect(sceneTextAppearance({ textStyle: 'fantasy' }).fontFamily).toBe("'Metamorphous', var(--font-native)");
  });

  test('la graisse d’une famille substituée est celle que le FICHIER porte', () => {
    // Déclarer 700 sur un fichier qui n'a que du 400 ferait graisser le glyphe
    // par le navigateur — un faux gras, que personne n'a dessiné.
    expect(sceneTextAppearance({ textStyle: 'brush' }).fontWeight).toBe(700);
    expect(sceneTextAppearance({ textStyle: 'note' }).fontWeight).toBe(400);
    expect(sceneTextAppearance({ textStyle: 'poster' }).fontWeight).toBe(400);
  });

  test('un `textStyle` inconnu reste sur la police système', () => {
    expect(sceneTextAppearance({ textStyle: 'licorne' }).fontFamily).toBeUndefined();
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
