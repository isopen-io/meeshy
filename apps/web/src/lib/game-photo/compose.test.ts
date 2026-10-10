import { describe, expect, test } from 'bun:test';

import { photoLayout } from './layout';
import { paintPhoto, prepareSvgMarkup, rasterizeSvg, withAlpha, type PaintContext, type PhotoArt, type PhotoPalette } from './compose';
import { encodeQr } from '@/lib/qr';

import { rankMoment } from './moments';
import { QR_DARK, QR_LIGHT, referralQr, type QrSquare } from './referral-qr';

/**
 * LA COMPOSITION DE L'IMAGE (#9382) — conception, partie VI : « cadre du moment
 * en surimpression (emblème en haut, titre et date, Mee et Meo en bas) », image
 * 9:16 pour la story et 1:1 pour le profil. La peinture est une SUITE d'appels
 * sur un contexte 2D : un faux contexte les enregistre, et l'on vérifie l'ordre
 * des couches, la photo retournée comme dans l'aperçu, et que rien n'est laissé
 * dans un état « retourné » pour la suite.
 */

type Call = { readonly op: string; readonly args: readonly unknown[] };

function fakeContext() {
  const calls: Call[] = [];
  const props: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => void calls.push({ op, args });
  const gradients: { stops: [number, string][] }[] = [];
  const ctx = {
    save: record('save'),
    restore: record('restore'),
    translate: record('translate'),
    scale: record('scale'),
    drawImage: record('drawImage'),
    fillRect: record('fillRect'),
    fillText: (...args: unknown[]) => void calls.push({ op: 'fillText', args: [...args, props.font, props.fillStyle, props.textAlign] }),
    createLinearGradient: (...args: unknown[]) => {
      calls.push({ op: 'createLinearGradient', args });
      const gradient = { stops: [] as [number, string][], addColorStop: (offset: number, color: string) => void gradient.stops.push([offset, color]) };
      gradients.push(gradient);
      return gradient;
    },
    set fillStyle(value: unknown) {
      props.fillStyle = value;
      calls.push({ op: 'fillStyle', args: [value] });
    },
    set font(value: string) {
      props.font = value;
    },
    set textAlign(value: string) {
      props.textAlign = value;
    },
    set textBaseline(value: string) {
      props.textBaseline = value;
    },
    set shadowColor(value: string) {
      props.shadowColor = value;
    },
    set shadowBlur(value: number) {
      props.shadowBlur = value;
    },
  };
  return { ctx: ctx as unknown as PaintContext, calls, props, gradients };
}

const art = (): PhotoArt => ({
  emblem: { id: 'emblem' } as unknown as CanvasImageSource,
  mee: { id: 'mee' } as unknown as CanvasImageSource,
  meo: { id: 'meo' } as unknown as CanvasImageSource,
  signature: { id: 'signature' } as unknown as CanvasImageSource,
});

const palette: PhotoPalette = { top: '#0b1020', bottom: '#1e1b4b', ink: '#ffffff', inkSoft: '#c7d2fe', scrim: '#000000' };
const moment = rankMoment({ rank: 'voix', division: 2 });
const selfie = { image: { id: 'photo' } as unknown as CanvasImageSource, width: 1600, height: 900, mirror: true };

const paint = (format: 'story' | 'square', photo: typeof selfie | null) => {
  const fake = fakeContext();
  const layout = photoLayout(format);
  paintPhoto(fake.ctx, { layout, moment, dateLabel: '5 octobre 2026', photo, art: art(), palette, fontFamily: 'system-ui' });
  return { ...fake, layout };
};

const drawn = (calls: readonly Call[]): string[] =>
  calls.filter((c) => c.op === 'drawImage').map((c) => String((c.args[0] as { id: string }).id));

describe('les couches, dans l’ordre', () => {
  test('photo, puis emblème, puis Mee et Meo, puis la Signature', () => {
    const { calls } = paint('story', selfie);
    expect(drawn(calls)).toEqual(['photo', 'emblem', 'mee', 'meo', 'signature']);
  });

  test('le texte se pose après l’emblème et avant les oiseaux', () => {
    const { calls } = paint('story', selfie);
    const ops = calls.map((c) => (c.op === 'drawImage' ? `img:${(c.args[0] as { id: string }).id}` : c.op));
    const lastText = ops.lastIndexOf('fillText');
    expect(ops.indexOf('img:emblem')).toBeLessThan(ops.indexOf('fillText'));
    expect(lastText).toBeLessThan(ops.indexOf('img:mee'));
  });

  test('les trois lignes de texte : le haut, le titre, la date — aux positions de la mise en page', () => {
    const { calls, layout } = paint('story', selfie);
    const texts = calls.filter((c) => c.op === 'fillText');
    expect(texts.map((t) => t.args[0])).toEqual(['NOUVEAU RANG', 'Voix II', '5 octobre 2026']);
    expect(texts.map((t) => t.args[1])).toEqual([layout.kicker.x, layout.title.x, layout.date.x]);
    expect(texts.map((t) => t.args[2])).toEqual([layout.kicker.y, layout.title.y, layout.date.y]);
  });

  test('chaque ligne a sa taille, le titre en gras et le plus grand', () => {
    const { calls, layout } = paint('story', selfie);
    const fonts = calls.filter((c) => c.op === 'fillText').map((t) => String(t.args[3]));
    expect(fonts[1]).toContain('700');
    expect(fonts[1]).toContain(`${layout.title.size}px`);
    expect(fonts[0]).toContain(`${layout.kicker.size}px`);
    expect(fonts[2]).toContain('system-ui');
  });
});

describe('les dessins gardent leur proportion', () => {
  test('un emblème plus large que haut est centré dans son cadre, jamais étiré', () => {
    const fake = fakeContext();
    const layout = photoLayout('story');
    const wide = { ...art(), emblem: { id: 'emblem', width: 200, height: 100 } as unknown as CanvasImageSource };
    paintPhoto(fake.ctx, { layout, moment, dateLabel: 'x', photo: null, art: wide, palette, fontFamily: 'system-ui' });
    const call = fake.calls.find((c) => c.op === 'drawImage' && (c.args[0] as { id: string }).id === 'emblem');
    const [, x, y, w, h] = call?.args ?? [];
    expect(Number(w) / Number(h)).toBeCloseTo(2, 5);
    expect(Number(x) + Number(w) / 2).toBeCloseTo(layout.emblem.x + layout.emblem.w / 2, 5);
    expect(Number(y) + Number(h) / 2).toBeCloseTo(layout.emblem.y + layout.emblem.h / 2, 5);
  });
});

describe('la photo', () => {
  test('rognée pour remplir le cadre, sans déformation', () => {
    const { calls, layout } = paint('story', selfie);
    const photo = calls.find((c) => c.op === 'drawImage');
    const [, sx, sy, sw, sh, dx, dy, dw, dh] = photo?.args ?? [];
    expect([dx, dy, dw, dh]).toEqual([0, 0, layout.width, layout.height]);
    expect(Number(sw) / Number(sh)).toBeCloseTo(layout.width / layout.height, 5);
    expect(sy).toBe(0);
    expect(Number(sx)).toBeGreaterThan(0);
  });

  test('un selfie est retourné comme dans l’aperçu — le déclencheur montre ce qu’on obtient', () => {
    const { calls, layout } = paint('story', selfie);
    const ops = calls.map((c) => c.op);
    const first = ops.indexOf('drawImage');
    expect(calls[ops.indexOf('translate')]?.args).toEqual([layout.width, 0]);
    expect(calls[ops.indexOf('scale')]?.args).toEqual([-1, 1]);
    expect(ops.indexOf('scale')).toBeLessThan(first);
  });

  test('une photo de la galerie n’est PAS retournée', () => {
    const { calls } = paint('story', { ...selfie, mirror: false });
    expect(calls.some((c) => c.op === 'scale')).toBe(false);
  });

  test('le retournement ne déborde pas sur les couches suivantes : save et restore s’équilibrent', () => {
    const { calls } = paint('story', selfie);
    const saves = calls.filter((c) => c.op === 'save').length;
    const restores = calls.filter((c) => c.op === 'restore').length;
    expect(saves).toBe(restores);
    const ops = calls.map((c) => c.op);
    expect(ops.indexOf('restore')).toBeLessThan(ops.indexOf('fillText'));
  });

  test('un voile sombre en haut et en bas garde le texte lisible sur n’importe quelle photo', () => {
    const { calls, gradients } = paint('story', selfie);
    expect(calls.filter((c) => c.op === 'createLinearGradient')).toHaveLength(2);
    expect(gradients.every((g) => g.stops.length >= 2)).toBe(true);
  });
});

describe('la carte seule', () => {
  const { calls, gradients, layout } = paint('square', null);

  test('aucune photo : un fond de la marque, plein cadre', () => {
    expect(drawn(calls)).toEqual(['emblem', 'mee', 'meo', 'signature']);
    const fill = calls.find((c) => c.op === 'fillRect');
    expect(fill?.args).toEqual([0, 0, layout.width, layout.height]);
    expect(gradients[0]?.stops.map((s) => s[1])).toEqual([palette.top, palette.bottom]);
  });

  test('le même texte, la même mise en page', () => {
    expect(calls.filter((c) => c.op === 'fillText').map((t) => t.args[0])).toEqual(['NOUVEAU RANG', 'Voix II', '5 octobre 2026']);
  });
});

describe('les deux formats', () => {
  test('1:1 comme 9:16 se peignent avec leur propre mise en page', () => {
    const story = paint('story', selfie);
    const square = paint('square', selfie);
    const photoDraw = (calls: readonly Call[]) => calls.find((c) => c.op === 'drawImage')?.args.slice(5);
    expect(photoDraw(story.calls)).toEqual([0, 0, 1080, 1920]);
    expect(photoDraw(square.calls)).toEqual([0, 0, 1080, 1080]);
  });
});

describe('prepareSvgMarkup — un SVG du document devient une image autonome', () => {
  const read = (name: string) => ({ '--game-edge': '#101828' })[name] ?? '';

  test('les jetons sont résolus, l’espace de noms et la taille posés', () => {
    const out = prepareSvgMarkup('<svg viewBox="0 0 10 10" width="40" height="40"><path stroke="var(--game-edge)"/></svg>', { size: 512, read });
    expect(out.markup).toContain('stroke="#101828"');
    expect(out.markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out.markup).toMatch(/width="512"/);
    expect(out.markup).toMatch(/height="512"/);
    expect(out.unresolved).toEqual([]);
  });

  test('la hauteur suit la proportion du dessin (viewBox), jamais un carré forcé', () => {
    const out = prepareSvgMarkup('<svg viewBox="0 0 200 184"><path/></svg>', { size: 400, read });
    expect(out.markup).toMatch(/width="400"/);
    expect(out.markup).toMatch(/height="368"/);
  });

  test('un xmlns déjà présent n’est pas doublé', () => {
    const out = prepareSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>', { size: 100, read });
    expect(out.markup.match(/xmlns=/g)).toHaveLength(1);
  });

  test('un jeton oublié est nommé', () => {
    const out = prepareSvgMarkup('<svg viewBox="0 0 1 1"><path fill="var(--oublie)"/></svg>', { size: 10, read });
    expect(out.unresolved).toEqual(['--oublie']);
  });
});

describe('rasterizeSvg', () => {
  const env = () => {
    const state = { revoked: [] as string[], created: [] as Blob[], src: '' };
    return {
      state,
      env: {
        createImage: () => {
          const image: { onload: (() => void) | null; onerror: (() => void) | null; src: string; decode?: () => Promise<void> } = {
            onload: null,
            onerror: null,
            src: '',
          };
          Object.defineProperty(image, 'src', {
            set(value: string) {
              state.src = value;
              queueMicrotask(() => image.onload?.());
            },
            get: () => state.src,
          });
          return image as unknown as HTMLImageElement;
        },
        createObjectUrl: (blob: Blob) => {
          state.created.push(blob);
          return 'blob:svg-1';
        },
        revokeObjectUrl: (url: string) => void state.revoked.push(url),
      },
    };
  };

  test('un Blob SVG devient une image, et l’adresse éphémère est rendue', async () => {
    const { env: e, state } = env();
    const image = await rasterizeSvg('<svg xmlns="http://www.w3.org/2000/svg"/>', e);
    expect(image).not.toBeNull();
    expect(state.created[0]?.type).toBe('image/svg+xml;charset=utf-8');
    expect(state.revoked).toEqual(['blob:svg-1']);
  });

  test('un SVG illisible rend null, sans exception', async () => {
    const failing = {
      createImage: () => {
        const image: { onload: (() => void) | null; onerror: (() => void) | null } = { onload: null, onerror: null };
        Object.defineProperty(image, 'src', { set: () => queueMicrotask(() => image.onerror?.()) });
        return image as unknown as HTMLImageElement;
      },
      createObjectUrl: () => 'blob:x',
      revokeObjectUrl: () => undefined,
    };
    expect(await rasterizeSvg('<svg/>', failing)).toBeNull();
  });
});

describe('withAlpha — le voile ne recouvre jamais la photo', () => {
  test('un hexadécimal à six chiffres gagne son octet d’opacité', () => {
    expect(withAlpha('#000000', 0.5)).toBe('#00000080');
    expect(withAlpha('#0b1020', 0)).toBe('#0b102000');
    expect(withAlpha('#0b1020', 1)).toBe('#0b1020ff');
  });

  test('toute autre forme de couleur se mélange à du transparent, elle ne reste pas opaque', () => {
    expect(withAlpha('oklch(20% 0.05 270)', 0.55)).toBe('color-mix(in srgb, oklch(20% 0.05 270) 55%, transparent)');
    expect(withAlpha('oklch(20% 0.05 270)', 0)).toBe('color-mix(in srgb, oklch(20% 0.05 270) 0%, transparent)');
  });
});

/**
 * LE BANDEAU DE PARRAINAGE PEINT (#7742) — au pied de la carte : un fond, la
 * Signature, « Rejoins-moi sur Meeshy », la Flamme et ses jours, et le lien en
 * CARRÉ QR (#9554) — il n'est plus écrit. Sans bandeau, la carte est peinte à
 * l'identique ; une Flamme éteinte ne laisse ni dessin ni jours.
 */
describe('le bandeau de parrainage', () => {
  const LINK = 'https://meeshy.me/signup/affiliate/aff_abc';
  const squareFor = (rtl = false): QrSquare | null => referralQr({ url: LINK }, photoLayout('story', { banner: true, rtl }).banner?.qr.w ?? 0);
  const bannerText = { headline: 'Rejoins-moi sur Meeshy', qr: squareFor(), flameLabel: '23 j' as string | null };
  /** Les rectangles remplis, chacun avec la couleur posée juste avant lui. */
  const filled = (calls: readonly Call[]): readonly { readonly style: unknown; readonly rect: readonly number[] }[] =>
    calls.reduce<{ readonly style: unknown; readonly out: readonly { readonly style: unknown; readonly rect: readonly number[] }[] }>(
      (state, call) => {
        if (call.op === 'fillStyle') return { ...state, style: call.args[0] };
        if (call.op !== 'fillRect') return state;
        return { ...state, out: [...state.out, { style: state.style, rect: call.args as readonly number[] }] };
      },
      { style: undefined, out: [] },
    ).out;
  const artWithFlame = (): PhotoArt => ({ ...art(), flame: { id: 'flame' } as unknown as CanvasImageSource });

  const paintBanner = (patch: { flame?: boolean; rtl?: boolean; format?: 'story' | 'square'; text?: Partial<typeof bannerText> } = {}) => {
    const fake = fakeContext();
    const layout = photoLayout(patch.format ?? 'story', { banner: true, rtl: patch.rtl === true });
    paintPhoto(fake.ctx, {
      layout,
      moment,
      dateLabel: '5 octobre 2026',
      photo: null,
      art: patch.flame === false ? art() : artWithFlame(),
      palette,
      fontFamily: 'system-ui',
      banner: { ...bannerText, ...patch.text },
    });
    return { ...fake, layout };
  };

  test('un fond au pied de la carte, posé AVANT la Signature qu’il porte', () => {
    const { calls, layout } = paintBanner();
    const frame = layout.banner?.frame;
    const rectIndex = calls.findIndex((c) => c.op === 'fillRect' && c.args[0] === frame?.x && c.args[1] === frame?.y && c.args[2] === frame?.w && c.args[3] === frame?.h);
    const signatureIndex = calls.findIndex((c) => c.op === 'drawImage' && (c.args[0] as { id: string }).id === 'signature');
    expect(rectIndex).toBeGreaterThanOrEqual(0);
    expect(rectIndex).toBeLessThan(signatureIndex);
  });

  test('la Signature est celle du bandeau : une seule, dans le cadre', () => {
    const { calls, layout } = paintBanner();
    const signatures = calls.filter((c) => c.op === 'drawImage' && (c.args[0] as { id: string }).id === 'signature');
    expect(signatures).toHaveLength(1);
    const banner = layout.banner;
    if (banner === undefined) throw new Error('bandeau attendu');
    const x = Number(signatures[0]?.args[1]);
    expect(x).toBeGreaterThanOrEqual(banner.frame.x);
    expect(x + Number(signatures[0]?.args[3])).toBeLessThanOrEqual(banner.frame.x + banner.frame.w);
  });

  test('la phrase, alignée à gauche, à la position de la mise en page', () => {
    const { calls, layout } = paintBanner();
    const headline = calls.filter((c) => c.op === 'fillText').find((t) => t.args[0] === bannerText.headline);
    expect(headline?.args.slice(1, 3)).toEqual([layout.banner?.headline.x, layout.banner?.headline.y]);
    expect(headline?.args[5]).toBe('left');
    expect(String(headline?.args[3])).toContain('800');
  });

  test('le lien n’est PLUS écrit sur l’image : aucun texte ne le porte, aucune chasse fixe (#9554)', () => {
    const { calls } = paintBanner();
    const texts = calls.filter((c) => c.op === 'fillText');
    expect(texts.map((t) => String(t.args[0])).filter((text) => /meeshy\.me|https?:|aff_abc/i.test(text))).toEqual([]);
    expect(texts.map((t) => String(t.args[3])).filter((font) => font.includes('monospace'))).toEqual([]);
    expect(texts.map((t) => t.args[0])).toEqual(['NOUVEAU RANG', 'Voix II', '5 octobre 2026', 'Rejoins-moi sur Meeshy', '23 j']);
  });

  for (const format of ['story', 'square'] as const) {
    test(`${format} : un carré clair à la place du carré QR, puis les modules sombres — relus, ils redonnent le lien`, () => {
      const { calls, layout } = paintBanner({ format });
      const slot = layout.banner?.qr;
      const square = bannerText.qr;
      if (slot === undefined || square === null) throw new Error('carré attendu');
      const rects = filled(calls);
      const lightIndex = rects.findIndex((r) => r.style === QR_LIGHT);
      expect(rects[lightIndex]?.rect).toEqual([slot.x, slot.y, slot.w, slot.h]);
      expect(rects.filter((r) => r.style === QR_LIGHT)).toHaveLength(1);
      const dark = rects.filter((r) => r.style === QR_DARK);
      expect(rects.slice(lightIndex + 1)).toEqual([...dark]);

      const pixels = Array.from({ length: slot.h }, () => new Uint8Array(slot.w));
      for (const { rect } of dark) {
        const [x = 0, y = 0, w = 0, h = 0] = rect;
        for (const value of rect) expect(Number.isInteger(value)).toBe(true);
        for (let row = y; row < y + h; row += 1) pixels[row - slot.y]?.fill(1, x - slot.x, x - slot.x + w);
      }
      const center = (index: number): number => square.origin + index * square.module + Math.floor(square.module / 2);
      const read = Array.from({ length: square.size }, (_, y) => Array.from({ length: square.size }, (_, x) => pixels[center(y)]?.[center(x)] === 1));
      expect(read).toEqual(encodeQr(LINK)?.modules.map((row) => [...row]) ?? []);
      expect(square.module).toBeGreaterThanOrEqual(2);
      expect(Math.min(...dark.map((r) => r.rect[0] ?? 0)) - slot.x).toBeGreaterThanOrEqual(4 * square.module);
      expect(slot.x + slot.w - Math.max(...dark.map((r) => (r.rect[0] ?? 0) + (r.rect[2] ?? 0)))).toBeGreaterThanOrEqual(4 * square.module);
    });
  }

  test('de droite à gauche : la phrase s’ancre à droite, le carré QR passe en fin de ligne — à gauche', () => {
    const { calls, layout } = paintBanner({ rtl: true, text: { qr: squareFor(true) } });
    const ltr = photoLayout('story', { banner: true }).banner;
    const slot = layout.banner?.qr;
    if (slot === undefined || ltr === undefined) throw new Error('bandeau attendu');
    const headline = calls.filter((c) => c.op === 'fillText').find((t) => t.args[0] === bannerText.headline);
    expect(headline?.args[5]).toBe('right');
    expect(headline?.args[1]).toBe(layout.width - ltr.headline.x);
    expect(filled(calls).find((r) => r.style === QR_LIGHT)?.rect).toEqual([slot.x, slot.y, slot.w, slot.h]);
    expect(slot.x).toBeLessThan(layout.width / 2);
    const days = calls.filter((c) => c.op === 'fillText').find((t) => t.args[0] === '23 j');
    expect(days?.args[5]).toBe('center');
  });

  test('un lien que la place ne rend pas lisible : ni carré clair ni module, le reste du bandeau part', () => {
    const { calls } = paintBanner({ text: { qr: null } });
    expect(filled(calls).filter((r) => r.style === QR_LIGHT || r.style === QR_DARK)).toEqual([]);
    expect(calls.filter((c) => c.op === 'fillText').map((t) => t.args[0])).toContain('Rejoins-moi sur Meeshy');
  });

  test('la Flamme et ses jours, sous elle, centrés', () => {
    const { calls, layout } = paintBanner();
    expect(drawn(calls)).toEqual(['emblem', 'mee', 'meo', 'signature', 'flame']);
    const days = calls.filter((c) => c.op === 'fillText').find((t) => t.args[0] === '23 j');
    expect(days?.args.slice(1, 3)).toEqual([layout.banner?.flameDays.x, layout.banner?.flameDays.y]);
    expect(days?.args[5]).toBe('center');
  });

  test('Flamme éteinte : ni dessin ni jours', () => {
    const { calls } = paintBanner({ text: { flameLabel: null } });
    expect(drawn(calls)).not.toContain('flame');
    expect(calls.filter((c) => c.op === 'fillText').map((t) => t.args[0])).not.toContain('23 j');
  });

  test('la Flamme n’a pas pu être dessinée : on ne devine pas, les jours non plus', () => {
    const { calls } = paintBanner({ flame: false });
    expect(drawn(calls)).not.toContain('flame');
    expect(calls.filter((c) => c.op === 'fillText').map((t) => t.args[0])).not.toContain('23 j');
  });

  test('sans bandeau, la carte est peinte comme avant : une Signature au centre, pas de fond de bandeau', () => {
    const { calls, layout } = paint('story', null);
    expect(drawn(calls)).toEqual(['emblem', 'mee', 'meo', 'signature']);
    expect(layout.banner).toBeUndefined();
    expect(calls.filter((c) => c.op === 'fillText').map((t) => t.args[0])).toEqual(['NOUVEAU RANG', 'Voix II', '5 octobre 2026']);
  });

  test('sans jeton, le carré est un EMPLACEMENT VIDE en pointillé : aucun module, aucun fond clair, aucun texte de lien (#7742, #9554)', () => {
    const traced = (placeholder: boolean) => {
      const fake = fakeContext();
      const ops: { op: string; args: unknown[] }[] = [];
      const ctx = Object.assign(fake.ctx, {
        setLineDash: (segments: number[]) => void ops.push({ op: 'setLineDash', args: [segments] }),
        strokeRect: (...args: number[]) => void ops.push({ op: 'strokeRect', args }),
        strokeStyle: '',
        lineWidth: 1,
      });
      const layout = photoLayout('story', { banner: true });
      paintPhoto(ctx, { layout, moment, dateLabel: 'x', photo: null, art: art(), palette, fontFamily: 'system-ui', banner: placeholder ? { headline: bannerText.headline, flameLabel: null, qr: null, placeholder: true } : bannerText });
      return { ops, layout, calls: fake.calls };
    };
    const { ops, layout, calls } = traced(true);
    const slot = layout.banner?.qr;
    if (slot === undefined) throw new Error('bandeau attendu');
    const stroke = ops.find((o) => o.op === 'strokeRect')?.args as number[] | undefined;
    if (stroke === undefined) throw new Error('pointillé attendu');
    const [x = 0, y = 0, w = 0, h = 0] = stroke;
    expect(w).toBe(h);
    expect(x).toBeGreaterThanOrEqual(slot.x);
    expect(y).toBeGreaterThanOrEqual(slot.y);
    expect(x + w).toBeLessThanOrEqual(slot.x + slot.w);
    expect(y + h).toBeLessThanOrEqual(slot.y + slot.h);
    expect(w).toBeGreaterThan(slot.w * 0.9);
    expect((ops.find((o) => o.op === 'setLineDash')?.args[0] as number[]).length).toBeGreaterThan(0);
    expect(ops.at(-1)).toEqual({ op: 'setLineDash', args: [[]] });
    expect(filled(calls).filter((r) => r.style === QR_LIGHT || r.style === QR_DARK)).toEqual([]);
    expect(calls.filter((c) => c.op === 'fillText').map((t) => t.args[0])).toEqual(['NOUVEAU RANG', 'Voix II', 'x', 'Rejoins-moi sur Meeshy']);
    expect(traced(false).ops.filter((o) => o.op === 'strokeRect')).toHaveLength(0);
  });

  test('un fond arrondi quand le contexte sait tracer un rectangle arrondi', () => {
    const fake = fakeContext();
    const ops: string[] = [];
    const ctx = Object.assign(fake.ctx, {
      beginPath: () => void ops.push('beginPath'),
      roundRect: () => void ops.push('roundRect'),
      fill: () => void ops.push('fill'),
    });
    paintPhoto(ctx, { layout: photoLayout('story', { banner: true }), moment, dateLabel: 'x', photo: null, art: artWithFlame(), palette, fontFamily: 'system-ui', banner: bannerText });
    expect(ops).toEqual(['beginPath', 'roundRect', 'fill']);
  });
});
