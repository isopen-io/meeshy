import { describe, expect, test } from 'bun:test';

import { PHOTO_FORMATS, containFit, coverFit, photoLayout, type PhotoFormat, type Rect } from './layout';

/**
 * LA MISE EN PAGE DU CADRE (#9382) — conception, partie VI : « emblème en haut,
 * titre et date, Mee et Meo en bas », en 9:16 pour la story et 1:1 pour le
 * profil. La mise en page est une DONNÉE (des nombres, en fraction du côté) :
 * l'aperçu en direct et l'image finale la lisent toutes les deux, donc le cadre
 * qu'on voit au moment de déclencher est celui qu'on obtient.
 */
const FORMATS: readonly PhotoFormat[] = ['story', 'square'];

describe('les deux formats', () => {
  test('9:16 pour la story, 1:1 pour le profil', () => {
    expect(PHOTO_FORMATS.story).toEqual({ width: 1080, height: 1920 });
    expect(PHOTO_FORMATS.square).toEqual({ width: 1080, height: 1080 });
  });
});

for (const format of FORMATS) {
  describe(`le cadre ${format}`, () => {
    const layout = photoLayout(format);
    const { width, height } = PHOTO_FORMATS[format];
    const inside = (r: { x: number; y: number; w: number; h: number }) =>
      r.x >= 0 && r.y >= 0 && r.x + r.w <= width && r.y + r.h <= height;

    test('tout tient dans l’image', () => {
      expect(inside(layout.emblem)).toBe(true);
      expect(inside(layout.mee)).toBe(true);
      expect(inside(layout.meo)).toBe(true);
      expect(inside(layout.signature)).toBe(true);
    });

    test('l’emblème est en haut, centré', () => {
      expect(layout.emblem.x + layout.emblem.w / 2).toBeCloseTo(width / 2, 5);
      expect(layout.emblem.y + layout.emblem.h).toBeLessThan(height / 2);
    });

    test('Mee à gauche, Meo à droite, tous deux en bas', () => {
      expect(layout.mee.x).toBeLessThan(layout.meo.x);
      expect(layout.mee.y + layout.mee.h).toBeGreaterThan(height * 0.8);
      expect(layout.meo.y + layout.meo.h).toBeGreaterThan(height * 0.8);
    });

    test('Mee et Meo ne se chevauchent pas', () => {
      expect(layout.mee.x + layout.mee.w).toBeLessThanOrEqual(layout.meo.x);
    });

    test('le texte se lit entre l’emblème et les oiseaux, dans cet ordre', () => {
      expect(layout.kicker.y).toBeGreaterThan(layout.emblem.y + layout.emblem.h);
      expect(layout.title.y).toBeGreaterThan(layout.kicker.y);
      expect(layout.date.y).toBeGreaterThan(layout.title.y);
      expect(layout.date.y).toBeLessThan(Math.min(layout.mee.y, layout.meo.y));
    });

    test('le texte est centré et lisible : une taille minimale pour chaque ligne', () => {
      for (const line of [layout.kicker, layout.title, layout.date]) {
        expect(line.x).toBe(width / 2);
        expect(line.size).toBeGreaterThanOrEqual(width * 0.03);
      }
      expect(layout.title.size).toBeGreaterThan(layout.kicker.size);
    });

    test('la Signature de la marque est tout en bas, au centre', () => {
      expect(layout.signature.x + layout.signature.w / 2).toBeCloseTo(width / 2, 5);
      expect(layout.signature.y).toBeGreaterThan(height * 0.85);
    });

    test('les marges de sécurité : rien ne touche le bord', () => {
      expect(layout.emblem.y).toBeGreaterThanOrEqual(height * 0.04);
      expect(layout.mee.x).toBeGreaterThanOrEqual(width * 0.04);
      expect(layout.meo.x + layout.meo.w).toBeLessThanOrEqual(width * 0.96);
    });
  });
}

/**
 * LE BANDEAU DE PARRAINAGE (#7742) — au pied de la carte : la Signature, « Rejoins-moi
 * sur Meeshy », le lien court et la Flamme. Quand il est là, Mee et Meo montent
 * AU-DESSUS ; sans lien, la carte part comme avant, à l'identique.
 */
for (const format of FORMATS) {
  describe(`le bandeau de parrainage — ${format}`, () => {
    const plain = photoLayout(format);
    const layout = photoLayout(format, { banner: true });
    const { width, height } = PHOTO_FORMATS[format];
    const banner = layout.banner;
    const inside = (r: Rect): boolean => r.x >= 0 && r.y >= 0 && r.x + r.w <= width && r.y + r.h <= height;
    const within = (r: Rect, frame: Rect): boolean => r.x >= frame.x && r.y >= frame.y && r.x + r.w <= frame.x + frame.w && r.y + r.h <= frame.y + frame.h;

    test('sans bandeau, la mise en page est celle d’avant, sans aucun champ de plus', () => {
      expect(plain.banner).toBeUndefined();
      expect(photoLayout(format, { banner: false })).toEqual(plain);
    });

    test('le bandeau est au pied de la carte, centré, dans les marges de sécurité', () => {
      if (banner === undefined) throw new Error('bandeau attendu');
      expect(inside(banner.frame)).toBe(true);
      expect(banner.frame.x + banner.frame.w / 2).toBeCloseTo(width / 2, 5);
      expect(banner.frame.y + banner.frame.h).toBeGreaterThan(height * 0.9);
      expect(banner.frame.x).toBeGreaterThanOrEqual(width * 0.04);
    });

    test('Mee et Meo montent AU-DESSUS du bandeau, sans le toucher', () => {
      if (banner === undefined) throw new Error('bandeau attendu');
      for (const bird of [layout.mee, layout.meo]) expect(bird.y + bird.h).toBeLessThanOrEqual(banner.frame.y);
      expect(layout.mee.y).toBeLessThan(plain.mee.y);
    });

    test('le texte du cadre reste entre l’emblème et les oiseaux', () => {
      expect(layout.date.y).toBeLessThan(Math.min(layout.mee.y, layout.meo.y));
      expect(layout.kicker.y).toBeGreaterThan(layout.emblem.y + layout.emblem.h);
    });

    test('les quatre pièces du bandeau tiennent dedans : Signature, phrase, lien, Flamme', () => {
      if (banner === undefined) throw new Error('bandeau attendu');
      expect(within(banner.signature, banner.frame)).toBe(true);
      expect(within(banner.flame, banner.frame)).toBe(true);
      for (const line of [banner.headline, banner.link, banner.flameDays]) {
        expect(line.x).toBeGreaterThanOrEqual(banner.frame.x);
        expect(line.x).toBeLessThanOrEqual(banner.frame.x + banner.frame.w);
        expect(line.y).toBeGreaterThan(banner.frame.y);
        expect(line.y).toBeLessThanOrEqual(banner.frame.y + banner.frame.h);
        expect(line.size).toBeGreaterThanOrEqual(width * 0.02);
      }
    });

    test('de gauche à droite : la Signature, puis la phrase, puis la Flamme', () => {
      if (banner === undefined) throw new Error('bandeau attendu');
      expect(banner.signature.x + banner.signature.w).toBeLessThanOrEqual(banner.headline.x);
      expect(banner.headline.x).toBeLessThan(banner.flame.x);
    });

    test('la phrase est au-dessus du lien', () => {
      if (banner === undefined) throw new Error('bandeau attendu');
      expect(banner.headline.y).toBeLessThan(banner.link.y);
    });

    test('la place du lien : il tient entre la Signature et la Flamme', () => {
      if (banner === undefined) throw new Error('bandeau attendu');
      expect(banner.maxTextWidth).toBeGreaterThan(width * 0.4);
      expect(banner.headline.x + banner.maxTextWidth).toBeLessThanOrEqual(banner.flame.x);
    });
  });
}

describe('coverFit — la photo remplit le cadre sans se déformer', () => {
  test('une photo plus large que le cadre est rognée sur les côtés, centrée', () => {
    expect(coverFit({ width: 1600, height: 900 }, { width: 1080, height: 1920 })).toEqual({
      sx: 1600 / 2 - (900 * (1080 / 1920)) / 2,
      sy: 0,
      sw: 900 * (1080 / 1920),
      sh: 900,
    });
  });

  test('une photo plus haute que le cadre est rognée en haut et en bas', () => {
    const fit = coverFit({ width: 900, height: 1600 }, { width: 1080, height: 1080 });
    expect(fit.sx).toBe(0);
    expect(fit.sw).toBe(900);
    expect(fit.sh).toBe(900);
    expect(fit.sy).toBe((1600 - 900) / 2);
  });

  test('la même proportion : rien n’est rogné', () => {
    expect(coverFit({ width: 540, height: 960 }, { width: 1080, height: 1920 })).toEqual({ sx: 0, sy: 0, sw: 540, sh: 960 });
  });

  test('une source de taille nulle ne divise pas par zéro', () => {
    expect(coverFit({ width: 0, height: 0 }, { width: 1080, height: 1920 })).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 });
  });
});

describe('containFit — un dessin non carré tient dans son cadre carré sans se déformer', () => {
  const frame = { x: 100, y: 200, w: 400, h: 400 };

  test('un dessin plus large que haut : centré, bandes en haut et en bas', () => {
    const rect = containFit({ width: 200, height: 100 }, frame);
    expect(rect).toEqual({ x: 100, y: 300, w: 400, h: 200 });
  });

  test('un dessin plus haut que large : centré, bandes sur les côtés', () => {
    const rect = containFit({ width: 100, height: 200 }, frame);
    expect(rect).toEqual({ x: 200, y: 200, w: 200, h: 400 });
  });

  test('un dessin carré remplit le cadre', () => {
    expect(containFit({ width: 50, height: 50 }, frame)).toEqual(frame);
  });

  test('la proportion de l’emblème de rang (200 × 184) est gardée', () => {
    const rect = containFit({ width: 200, height: 184 }, frame);
    expect(rect.w / rect.h).toBeCloseTo(200 / 184, 5);
    expect(rect.x + rect.w / 2).toBeCloseTo(300, 5);
    expect(rect.y + rect.h / 2).toBeCloseTo(400, 5);
  });

  test('une taille nulle rend le cadre tel quel', () => {
    expect(containFit({ width: 0, height: 0 }, frame)).toEqual(frame);
  });
});
