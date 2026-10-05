import { describe, expect, test } from 'bun:test';

import { STICKER_LINE_HEIGHT, fitStickerText, stickerTextWidth } from '@meeshy/shared/types/sticker-pack';

import { boxFromDrag, defaultZone, draftItemOf, draftProblems, kindOf, manifestOf, problemItem, problemKey, slugOf } from './draft';
import type { DraftItem, PackDraft } from './draft';
import { packSlotsFor, renderInstantSvg } from './render';

/**
 * PROPOSER UN PACK SE RÉSUME À DÉPOSER SES IMAGES ET LUI DONNER UN NOM (#9141)
 * — tout le reste se déduit, et ce que l'éditeur accepte, la passerelle
 * l'accepte (même validation).
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const GIF_FRAME = [0x21, 0xf9, 0x04, 0, 0, 0, 0, 0];
const ANIMATED_GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, ...GIF_FRAME, ...GIF_FRAME]);

const file = (name: string, bytes: Uint8Array<ArrayBuffer>, type: string) => new File([bytes], name, { type });

const item = async (name: string, bytes: Uint8Array<ArrayBuffer> = PNG, type = 'image/png', taken: ReadonlySet<string> = new Set()): Promise<DraftItem> => {
  const made = await draftItemOf(file(name, bytes, type), taken, name);
  if (made === null) throw new Error('not an image');
  return made;
};

describe('le brouillon d’un pack', () => {
  test('l’adresse vient du nom, sans accent ni ponctuation', () => {
    expect(slugOf('Chats de Paris !')).toBe('chats-de-paris');
    expect(slugOf('  Été — à Nîmes  ')).toBe('ete-a-nimes');
    expect(slugOf('x'.repeat(40)).length).toBe(24);
  });

  test('le genre se LIT dans les octets : un GIF qui bouge est cinématique, un PNG est fixe', async () => {
    const still = await item('bonjour_le-monde.png');
    const moving = await item('dodo.gif', ANIMATED_GIF, 'image/gif');
    expect([still.key, still.title, kindOf(still)]).toEqual(['bonjour-le-monde', 'Bonjour le monde', 'static']);
    expect(kindOf(moving)).toBe('cinematic');
    expect(kindOf({ ...still, instant: true })).toBe('instant');
    expect(await draftItemOf(file('notes.txt', new Uint8Array([1, 2, 3]), 'text/plain'), new Set(), 'x')).toBeNull();
  });

  test('deux fichiers du même nom ne se disputent pas leur clé', async () => {
    const second = await item('chat.png', PNG, 'image/png', new Set(['chat']));
    expect(second.key).toBe('chat-2');
  });

  test('un brouillon complet donne un manifeste que la passerelle accepte, avec ses fichiers nommés', async () => {
    const draft: PackDraft = {
      name: 'Chats de Paris',
      description: 'Des chats sur les quais',
      author: 'Studio Minou',
      items: [await item('a.png'), await item('b.gif', ANIMATED_GIF, 'image/gif'), { ...(await item('c.png')), instant: true, zones: [defaultZone(0)] }],
    };
    expect(draftProblems(draft)).toEqual([]);
    const { manifest, files } = manifestOf(draft);
    expect(manifest.items.map((i) => [i.kind, i.asset])).toEqual([
      ['static', 'a.png'],
      ['cinematic', 'b.gif'],
      ['instant', 'c.png'],
    ]);
    expect([...files.keys()]).toEqual(['a.png', 'b.gif', 'c.png']);
  });

  test('un Instant dont le texte le plus long déborderait est signalé sur SON sticker', async () => {
    const tight = { ...defaultZone(0), box: { x: 10, y: 10, width: 120, height: 40 }, maxLength: 30 };
    const draft: PackDraft = {
      name: 'Pack',
      description: 'Desc',
      author: 'Moi',
      items: [await item('a.png'), await item('b.png'), { ...(await item('c.png')), instant: true, zones: [tight] }],
    };
    const problems = draftProblems(draft);
    expect(problems.map((p) => [problemItem(p), problemKey(p)])).toContainEqual([2, 'stickerPacks.problem.longestOverflows']);
  });

  test('un pack de moins de trois stickers le dit', async () => {
    const problems = draftProblems({ name: 'Pack', description: 'D', author: 'A', items: [await item('a.png')] });
    expect(problems.map(problemKey)).toContain('stickerPacks.problem.count');
  });

  test('une zone tracée à l’écran est ramenée dans le carré du sticker, jamais plus petite qu’utile', () => {
    expect(boxFromDrag({ x: 200, y: 200 }, { x: 10, y: 150 }, 2)).toEqual({ x: 20, y: 300, width: 380, height: 100 });
    expect(boxFromDrag({ x: 250, y: 250 }, { x: 251, y: 251 }, 2)).toEqual({ x: 480, y: 480, width: 32, height: 32 });
  });
});

describe('le dessin d’un Instant', () => {
  const instant = { title: 'Bravo', zones: [defaultZone(0)] };

  test('écrit la valeur saisie, bornée à la longueur de sa zone, et le défaut sinon', () => {
    expect(packSlotsFor(instant, { texte: '  Joyeux anniversaire Léa  ' })).toEqual({ texte: 'Joyeux anniversa' });
    expect(packSlotsFor(instant, { texte: '   ', autre: 'x' })).toEqual({});
    const svg = renderInstantSvg(instant, { imageHref: 'https://x/y.png', slots: {}, uid: 'u1' });
    expect(svg).toContain('Ton texte');
    expect(svg).toContain('clip-path="url(#pk-u1-0)"');
  });

  test('le texte écrit tient dans sa zone, à la taille que la mise en page a choisie', () => {
    const zone = defaultZone(0);
    const svg = renderInstantSvg(instant, { imageHref: 'a', slots: { texte: 'MMMMMMMMMMMMMMMM' }, uid: 'u2' });
    const size = Number(/font-size="(\d+)"/.exec(svg)?.[1]);
    const layout = fitStickerText('MMMMMMMMMMMMMMMM', zone);
    expect(size).toBe(layout?.fontSize ?? -1);
    expect(stickerTextWidth('MMMMMMMMMMMMMMMM', size, 'black')).toBeLessThanOrEqual(zone.box.width);
    expect(size * STICKER_LINE_HEIGHT).toBeLessThanOrEqual(zone.box.height);
  });

  test('échappe ce que l’utilisateur écrit', () => {
    expect(renderInstantSvg(instant, { imageHref: 'a', slots: { texte: '<b>&' }, uid: 'u3' })).toContain('&lt;b&gt;&amp;');
  });
});
