import { describe, it, expect } from 'vitest';
import { ObjectV3Schema } from '../types/canvas-v3';
import {
  FULL_MEDIA_CROP,
  MINIMUM_CROP_SIDE,
  clampMediaCrop,
  effectiveMediaRatio,
  isFullMediaCrop,
  mediaCropStyle,
  readMediaCrop,
} from '../utils/media-crop';

/**
 * #5085 — **le recadrage traversait la passerelle sans aucun lecteur.**
 *
 * Ces témoins tiennent la LOI du fil, celle que les trois clients projettent.
 * Ils sont la moitié qui manquait : le lot iOS avait ses témoins Swift, et
 * personne n'éprouvait que le champ soit LISIBLE ailleurs.
 */
describe('readMediaCrop — la lecture du fil', () => {
  it('rend null quand aucune borne ne voyage', () => {
    expect(readMediaCrop({})).toBeNull();
    expect(readMediaCrop(null)).toBeNull();
    expect(readMediaCrop(undefined)).toBeNull();
  });

  it('lit les quatre bornes ensemble', () => {
    expect(readMediaCrop({ cropX: 0.1, cropY: 0.2, cropW: 0.5, cropH: 0.6 })).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.5,
      height: 0.6,
    });
  });

  /**
   * **Un recadrage amputé n'a pas de repli sensé.** Compléter par un défaut
   * fabriquerait un cadrage que personne n'a posé, et le rendrait
   * indiscernable d'un vrai — le pire des deux mondes, puisqu'il aurait l'air
   * d'une intention.
   */
  it('refuse un recadrage amputé plutôt que de le compléter', () => {
    expect(readMediaCrop({ cropX: 0.1, cropY: 0.2, cropW: 0.5 })).toBeNull();
    expect(readMediaCrop({ cropX: 0.1, cropW: 0.5, cropH: 0.6 })).toBeNull();
  });

  it('refuse ce qui n’est pas un nombre fini', () => {
    expect(readMediaCrop({ cropX: '0.1', cropY: 0.2, cropW: 0.5, cropH: 0.6 })).toBeNull();
    expect(readMediaCrop({ cropX: NaN, cropY: 0.2, cropW: 0.5, cropH: 0.6 })).toBeNull();
    expect(readMediaCrop({ cropX: Infinity, cropY: 0, cropW: 1, cropH: 1 })).toBeNull();
  });

  /**
   * **Le recadrage PLEIN est l'absence de recadrage.** L'émetteur Swift omet
   * les clés dans ce cas ; les lire quand même ne doit pas produire un objet
   * que les appelants devraient ensuite re-tester.
   */
  it('rend null pour un recadrage plein, comme pour une absence', () => {
    expect(readMediaCrop({ cropX: 0, cropY: 0, cropW: 1, cropH: 1 })).toBeNull();
  });
});

describe('clampMediaCrop — les bornes restent DANS la source', () => {
  it('ramène un débordement', () => {
    const borne = clampMediaCrop({ x: -0.5, y: 2, width: 3, height: 3 });
    expect(borne.x).toBe(0);
    expect(borne.y).toBeCloseTo(1 - MINIMUM_CROP_SIDE, 10);
    expect(borne.width).toBe(1);
    // `1 - 0.99` ne rend pas exactement `0.01` en binaire : la comparaison
    // stricte y ferait rougir une implémentation juste.
    expect(borne.height).toBeCloseTo(MINIMUM_CROP_SIDE, 10);
  });

  /**
   * **Une largeur nulle rendrait un média INVISIBLE sans rien signaler.** Le
   * plancher garde une bande étroite plutôt qu'un vide — même nombre que
   * `MediaCropRule.minimumSide` côté Swift : deux planchers différents
   * feraient deux bandes différentes pour un même geste.
   */
  it('garde une bande plutôt qu’un vide', () => {
    const serre = clampMediaCrop({ x: 0.2, y: 0.2, width: 0, height: -1 });
    expect(serre.width).toBe(MINIMUM_CROP_SIDE);
    expect(serre.height).toBe(MINIMUM_CROP_SIDE);
  });

  it('laisse un rectangle déjà valide intact', () => {
    const rect = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 };
    expect(clampMediaCrop(rect)).toEqual(rect);
  });

  it('reconnaît le recadrage plein', () => {
    expect(isFullMediaCrop(FULL_MEDIA_CROP)).toBe(true);
    expect(isFullMediaCrop({ x: 0, y: 0, width: 0.9, height: 1 })).toBe(false);
  });
});

describe('effectiveMediaRatio — un média recadré n’a plus les proportions de son fichier', () => {
  it('rend le rapport SOURCE quand rien n’est recadré', () => {
    expect(effectiveMediaRatio(0.5625, null)).toBe(0.5625);
    expect(effectiveMediaRatio(0.5625, FULL_MEDIA_CROP)).toBe(0.5625);
  });

  /**
   * Le témoin se pose sur un recadrage NON carré : un rectangle dont largeur
   * et hauteur sont égales rendrait le rapport source, et le témoin passerait
   * dans les deux mondes.
   */
  it('multiplie par le rapport du rectangle', () => {
    expect(effectiveMediaRatio(1, { x: 0, y: 0, width: 0.5, height: 1 })).toBe(0.5);
    expect(effectiveMediaRatio(2, { x: 0, y: 0, width: 1, height: 0.5 })).toBe(4);
  });

  it('miroir de MediaCropRule.effectiveRatio — 9:16 recadré en carré', () => {
    // 1080×1920 ⇒ 0,5625 ; on garde une bande carrée : 1080×1080 de la source
    // occupe 1 en largeur et 1080/1920 en hauteur.
    expect(effectiveMediaRatio(0.5625, { x: 0, y: 0.21875, width: 1, height: 0.5625 }))
      .toBeCloseTo(1, 5);
  });
});

describe('mediaCropStyle — montrer une FRACTION sans ré-encoder', () => {
  /**
   * Le web n'a pas de `contentsRect`. La seule façon de montrer une fraction
   * sans toucher le pixel est d'agrandir puis de décaler sous un conteneur qui
   * coupe — ce que `contentsRect` fait en interne, d'où l'identité du rendu.
   */
  it('agrandit à l’inverse de la bande', () => {
    const style = mediaCropStyle({ x: 0, y: 0, width: 0.5, height: 0.25 });
    expect(style.width).toBe('200%');
    expect(style.height).toBe('400%');
  });

  it('décale de la position de la bande, à l’échelle agrandie', () => {
    const style = mediaCropStyle({ x: 0.25, y: 0.5, width: 0.5, height: 0.25 });
    expect(style.left).toBe('-50%');
    expect(style.top).toBe('-200%');
  });

  it('ne décale rien quand la bande commence à l’origine', () => {
    const style = mediaCropStyle({ x: 0, y: 0, width: 0.5, height: 0.5 });
    expect(style.left).toBe('0%');
    expect(style.top).toBe('0%');
  });

  /**
   * **Le plancher doit TENIR même quand l'origine déborde.** Écrit
   * naïvement, `clamp` borne l'origine à 1 puis la dimension à `1 - origine`
   * — et la seconde borne défait la première, rendant `0` : le média devient
   * invisible sans qu'aucun code n'échoue. Le témoin ne peut pas se poser sur
   * un rectangle valide, où les deux écritures s'accordent.
   */
  it('le plancher tient même quand l’origine déborde', () => {
    const serre = clampMediaCrop({ x: 5, y: 5, width: 0.5, height: 0.5 });
    expect(serre.width).toBeGreaterThanOrEqual(MINIMUM_CROP_SIDE);
    expect(serre.height).toBeGreaterThanOrEqual(MINIMUM_CROP_SIDE);
    expect(serre.x + serre.width).toBeLessThanOrEqual(1);
    expect(serre.y + serre.height).toBeLessThanOrEqual(1);
  });

  /** Un recadrage plein doit rendre le média intact : 100 %, aucun décalage. */
  it('rend le média intact pour un recadrage plein', () => {
    expect(mediaCropStyle(FULL_MEDIA_CROP)).toEqual({
      width: '100%',
      height: '100%',
      left: '0%',
      top: '0%',
    });
  });

  /** Une borne aberrante ne doit pas produire un style aberrant. */
  it('borne avant de convertir', () => {
    const style = mediaCropStyle({ x: -3, y: 0, width: 0, height: 5 });
    expect(style.width).toBe(`${100 / MINIMUM_CROP_SIDE}%`);
    expect(style.height).toBe('100%');
  });
});

/**
 * **Une règle partagée n'est pas un contrat.** `media-crop.ts` dit comment
 * LIRE les bornes ; ces témoins-ci tiennent le fait qu'elles EXISTENT au fil.
 *
 * Sans cette moitié, les quatre clés traversaient `payload` — déclaré
 * `z.record(z.string(), z.unknown())`, permissif par contrat — sans validation
 * ni refus, et surtout **sans qu'aucune garde puisse détecter le prochain
 * client qui les oublie** : il n'y avait rien à quoi le comparer.
 */
describe('ObjectV3Schema — le recadrage est DÉCLARÉ dans une charge permissive', () => {
  const objet = (kind: string, payload: Record<string, unknown>) => ({
    id: 'o1',
    kind,
    anchor: { t: 'free' as const, x: 0.5, y: 0.5 },
    plane: 'bg' as const,
    z: 0,
    transform: { scale: 1, rotation: 0, opacity: 1 },
    payload,
  });

  it('accepte un média sans recadrage — la charge reste permissive', () => {
    expect(ObjectV3Schema.safeParse(objet('media', { mediaURL: 'x', autreChose: 42 })).success).toBe(true);
  });

  it('accepte les quatre bornes ensemble', () => {
    expect(
      ObjectV3Schema.safeParse(objet('media', { cropX: 0, cropY: 0.5, cropW: 1, cropH: 0.5 })).success,
    ).toBe(true);
  });

  /**
   * Le refus se fait AU FIL pour qu'aucun lecteur n'ait à choisir — et surtout
   * pour que trois lecteurs ne choisissent pas différemment.
   */
  it('refuse un recadrage amputé, en NOMMANT ce qui manque', () => {
    const r = ObjectV3Schema.safeParse(objet('media', { cropX: 0, cropY: 0.5, cropW: 1 }));
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('CROP_INCOMPLETE:cropH');
  });

  it('refuse une borne hors de la source', () => {
    const r = ObjectV3Schema.safeParse(objet('media', { cropX: 0, cropY: 0, cropW: 1.5, cropH: 1 }));
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('CROP_OUT_OF_RANGE:cropW');
  });

  it('refuse une borne qui n’est pas un nombre', () => {
    const r = ObjectV3Schema.safeParse(objet('media', { cropX: '0', cropY: 0, cropW: 1, cropH: 1 }));
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('CROP_OUT_OF_RANGE:cropX');
  });

  /**
   * **Seul un `media` porte des bornes.** Un `text` qui en porterait décrirait
   * un cadrage que rien ne peut appliquer — et le silence en ferait une clé
   * morte de plus, indiscernable d'une clé que le lecteur a ratée.
   */
  it('refuse un recadrage sur un objet qui n’est pas un média', () => {
    const r = ObjectV3Schema.safeParse(objet('text', { text: 'a', cropX: 0, cropY: 0, cropW: 0.5, cropH: 0.5 }));
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('CROP_ON_NON_MEDIA:text');
  });
});
