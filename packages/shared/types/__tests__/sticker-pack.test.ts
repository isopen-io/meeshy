import { describe, it, expect } from 'vitest';
import {
  BUILTIN_STICKER_PACKS,
  STICKER_LINE_HEIGHT,
  STICKER_PACK_LIMITS,
  fitStickerText,
  isStickerPackInstalled,
  layoutStickerText,
  longestStickerText,
  parseStickerPackTemplateId,
  stickerPackTemplateId,
  stickerTextWidth,
  validateStickerPackManifest,
} from '../sticker-pack';
import type { StickerTextZone } from '../sticker-pack';

const zone = (over: Partial<StickerTextZone> = {}): StickerTextZone => ({
  slot: 'name',
  label: 'Prénom',
  box: { x: 56, y: 380, width: 400, height: 100 },
  defaultText: 'Joyeux anniversaire',
  maxLength: 20,
  maxLines: 2,
  minFontSize: 16,
  maxFontSize: 48,
  color: '#1c1941',
  weight: 'black',
  align: 'center',
  ...over,
});

const item = (key: string, over: Record<string, unknown> = {}) => ({
  key,
  title: `Sticker ${key}`,
  emoji: '🎉',
  kind: 'static',
  asset: `${key}.png`,
  ...over,
});

const manifest = (over: Record<string, unknown> = {}) => ({
  slug: 'chats-de-paris',
  name: 'Chats de Paris',
  description: 'Des chats qui flânent sur les quais.',
  author: 'Studio Minou',
  items: [item('bonjour'), item('dodo', { kind: 'cinematic', asset: 'dodo.webp' }), item('fete', { kind: 'instant', zones: [zone()] })],
  ...over,
});

const codes = (input: unknown) => {
  const result = validateStickerPackManifest(input);
  return result.ok ? [] : result.problems.map((p) => `${p.path}:${p.code}`);
};

describe('validateStickerPackManifest', () => {
  it('accepts a pack mixing the three kinds and fills the zone defaults', () => {
    const result = validateStickerPackManifest(manifest({ items: [item('a'), item('b'), item('c', { kind: 'instant', zones: [{ slot: 'name', label: 'Prénom', box: { x: 40, y: 400, width: 432, height: 80 }, defaultText: 'Léa', maxLength: 12 }] })] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const filled = result.manifest.items[2]?.zones?.[0];
    expect(filled).toMatchObject({ maxLines: 1, minFontSize: STICKER_PACK_LIMITS.minFontSize, weight: 'black', align: 'center' });
  });

  it('refuses a malformed pack, naming where', () => {
    expect(codes(manifest({ slug: 'Chats de Paris' }))).toContain('slug:invalid');
    expect(codes(manifest({ items: [item('a'), item('b')] }))).toContain('items:invalid');
  });

  it('keeps the names of the built-in packs for Meeshy', () => {
    expect(codes(manifest({ slug: 'mee' }))).toEqual(['slug:reserved-slug']);
  });

  it('refuses two stickers with the same key or the same file', () => {
    expect(codes(manifest({ items: [item('a'), item('a', { asset: 'b.png' }), item('c', { asset: 'a.png' })] }))).toEqual([
      'items.1.key:duplicate-key',
      'items.2.asset:duplicate-asset',
    ]);
  });

  it('requires text zones on an Instant and refuses them elsewhere', () => {
    expect(codes(manifest({ items: [item('a', { kind: 'instant' }), item('b', { zones: [zone()] }), item('c')] }))).toEqual([
      'items.0.zones:zones-required',
      'items.1.zones:zones-forbidden',
    ]);
  });

  it('refuses a zone that leaves the sticker or crosses another', () => {
    const outside = zone({ box: { x: 300, y: 400, width: 300, height: 100 } });
    expect(codes(manifest({ items: [item('a', { kind: 'instant', zones: [outside] }), item('b'), item('c')] }))).toEqual(['items.0.zones.0.box:zone-outside']);
    const crossing = [zone(), zone({ slot: 'place', box: { x: 100, y: 420, width: 200, height: 60 } })];
    expect(codes(manifest({ items: [item('a', { kind: 'instant', zones: crossing }), item('b'), item('c')] }))).toEqual(['items.0.zones.1.box:zones-overlap']);
  });

  it('refuses a default text that would not fit, even at the smallest size', () => {
    const tight = zone({ box: { x: 10, y: 10, width: 120, height: 40 }, maxLines: 1, defaultText: 'Joyeux anniversaire', maxLength: 20 });
    expect(codes(manifest({ items: [item('a', { kind: 'instant', zones: [tight] }), item('b'), item('c')] }))).toContain('items.0.zones.0.defaultText:default-overflows');
  });

  it('refuses a zone whose LONGEST admitted text would overflow — the promise is for every text, not the sample', () => {
    const generous = zone({ box: { x: 10, y: 10, width: 200, height: 40 }, maxLines: 1, defaultText: 'Léa', maxLength: 40 });
    expect(codes(manifest({ items: [item('a', { kind: 'instant', zones: [generous] }), item('b'), item('c')] }))).toEqual(['items.0.zones.0.maxLength:longest-overflows']);
  });
});

describe('fitStickerText', () => {
  it('picks the largest size at which the text fits', () => {
    const z = zone({ maxLines: 1 });
    const short = fitStickerText('Léa', z);
    const long = fitStickerText('Joyeux anniversaire', z);
    expect(short?.fontSize).toBe(48);
    expect(long).not.toBeNull();
    expect(long!.fontSize).toBeLessThan(48);
    expect(stickerTextWidth(long!.lines[0]!, long!.fontSize, 'black')).toBeLessThanOrEqual(z.box.width);
  });

  it('wraps over the allowed lines and never exceeds the height', () => {
    const z = zone();
    const layout = fitStickerText('Bon anniversaire ma petite étoile', z)!;
    expect(layout.lines.length).toBeLessThanOrEqual(z.maxLines);
    expect(layout.lines.length * layout.fontSize * STICKER_LINE_HEIGHT).toBeLessThanOrEqual(z.box.height);
    layout.lines.forEach((line) => expect(stickerTextWidth(line, layout.fontSize, z.weight)).toBeLessThanOrEqual(z.box.width));
  });

  it('proves the longest admitted text of a validated zone fits', () => {
    const z = zone();
    expect(fitStickerText(longestStickerText(z), z)).not.toBeNull();
  });
});

describe('layoutStickerText', () => {
  it('shortens with an ellipsis what the metric could not foresee, and always stays inside', () => {
    const z = zone({ maxLines: 1, box: { x: 0, y: 0, width: 160, height: 40 } });
    const layout = layoutStickerText('最高の誕生日をお祝いします本当におめでとう', z);
    expect(layout.truncated).toBe(true);
    expect(layout.lines).toHaveLength(1);
    expect(layout.lines[0]!.endsWith('…')).toBe(true);
    expect(stickerTextWidth(layout.lines[0]!, layout.fontSize, z.weight)).toBeLessThanOrEqual(z.box.width);
  });

  it('leaves a fitting text untouched', () => {
    expect(layoutStickerText('Léa', zone())).toMatchObject({ lines: ['Léa'], truncated: false });
  });
});

describe('installation of a pack', () => {
  it('installs the built-in packs until the user removes them, and nothing else by default', () => {
    expect(BUILTIN_STICKER_PACKS.map((p) => p.slug)).toEqual(['mee', 'meo', 'mee-et-meo']);
    expect(isStickerPackInstalled('mee', undefined)).toBe(true);
    expect(isStickerPackInstalled('mee', { installed: false })).toBe(false);
    expect(isStickerPackInstalled('chats-de-paris', undefined)).toBe(false);
    expect(isStickerPackInstalled('chats-de-paris', { installed: true })).toBe(true);
  });
});

describe('pack template id', () => {
  it('round-trips and refuses anything else', () => {
    const id = stickerPackTemplateId('chats-de-paris', 'bonjour');
    expect(id).toBe('pack.chats-de-paris.bonjour');
    expect(parseStickerPackTemplateId(id)).toEqual({ slug: 'chats-de-paris', key: 'bonjour' });
    expect(parseStickerPackTemplateId('mee.coucou')).toBeNull();
    expect(parseStickerPackTemplateId('pack.a.b.c')).toBeNull();
    expect(parseStickerPackTemplateId('pack.A.b')).toBeNull();
    expect(id.length).toBeLessThanOrEqual(64);
    expect(stickerPackTemplateId('x'.repeat(STICKER_PACK_LIMITS.maxSlugLength), 'y'.repeat(STICKER_PACK_LIMITS.maxKeyLength)).length).toBeLessThanOrEqual(64);
  });
});
