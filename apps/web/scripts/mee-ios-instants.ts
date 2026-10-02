/**
 * LES INSTANTS DE MEE ET MEO POUR iOS, FILMÉS SANS LEUR TEXTE (#9069).
 *
 * Un Instant écrit, au moment de l'envoi, ce que l'utilisateur a saisi — un
 * message, l'heure, le lieu, la météo. Un film ne peut pas porter un texte
 * qu'on ne connaît pas encore : ce script filme donc chaque Instant SANS ce
 * qui dépend du texte, et MESURE ce texte pour qu'iOS le redessine en natif,
 * au même endroit, avec les mêmes règles.
 *
 * Ce qui dépend du texte, et comment iOS le reçoit :
 * - le BANDEAU (`data-mee-band`, `kit.band`) : sa forme change avec le texte
 *   (une ou deux lignes). L'index dit quel emplacement il porte en ligne forte
 *   et en ligne douce, et ses couleurs ; `MeeInstantOverlay` en rejoue les
 *   règles ;
 * - les TEXTES LIBRES (une pancarte, une bulle, un cœur) : l'index donne leur
 *   position et leur rotation dans la boîte de vue, leur graisse, leur couleur
 *   et leur taille selon la longueur saisie — sondée de 1 à 40 caractères,
 *   avec la longueur au-delà de laquelle le dessin coupe.
 *
 * Un support de texte ANIMÉ est figé dans le film : sinon le texte natif,
 * immobile, décrocherait de la pancarte qui bouge. Le personnage, lui, garde
 * son mouvement.
 *
 * Usage : `bun scripts/mee-ios-instants.ts` (`--index-only` : sans retourner
 * les films ; `--resume` : sans retourner ceux déjà tournés). Relancer après
 * toute retouche d'un Instant.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Page } from '@playwright/test';

import { meeStickersOfTab } from '../src/lib/mee/catalog';
import { MEE_VIEWBOX, renderMeeSticker } from '../src/lib/mee/render';
import type { MeeSlot, MeeSlots, MeeSticker } from '../src/lib/mee/types';
import { OUT, SIZE, STORY, filmShot, hasFilm, openPages, removeFilms } from './mee-ios-film';

const instants = meeStickersOfTab('instants');
const indexOnly = process.argv.includes('--index-only');
/** `--resume` garde les films déjà tournés : un tournage interrompu reprend où il s'est arrêté. */
const resume = process.argv.includes('--resume');
const PROBE = 40;

const sentinel = (slot: MeeSlot): string => `⟦${slot}⟧`;
const sentinels = (sticker: MeeSticker): MeeSlots => Object.fromEntries(sticker.slots.map((slot) => [slot, sentinel(slot)]));
const page360 = (sticker: MeeSticker, slots: MeeSlots): string =>
  `<html><body style="margin:0;background:transparent">${renderMeeSticker(sticker, { uid: 'ios', size: SIZE, slots })}</body></html>`;

type Band = { readonly main: MeeSlot; readonly sub: MeeSlot | null; readonly fill: string; readonly ink: string; readonly stroke: string };
type Free = {
  readonly slot: MeeSlot;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scale: number;
  readonly anchor: string;
  readonly weight: number;
  readonly fill: string;
  readonly opacity: number;
};
type Sizing = { readonly sizes: readonly (readonly [number, number])[]; readonly max: number | null };
type Measured = { readonly band: Band | null; readonly texts: readonly (Free & Sizing)[] };

/** Les ancêtres d'un texte libre perdent leur animation : son support reste immobile, comme son texte natif. */
async function freezeCarriers(page: Page, marks: readonly string[]): Promise<void> {
  await page.evaluate((all) => {
    const texts = Array.from(document.querySelectorAll('svg text'));
    texts.forEach((text) => {
      if (!all.some((mark) => (text.textContent ?? '').includes(mark))) return;
      for (let node: Element | null = text.parentElement; node !== null && node.tagName !== 'svg'; node = node.parentElement) {
        (node as SVGElement).style.animation = 'none';
      }
    });
  }, marks);
}

async function measure(sticker: MeeSticker, page: Page): Promise<Measured> {
  const marks = sticker.slots.map(sentinel);
  await page.setContent(page360(sticker, sentinels(sticker)));
  await freezeCarriers(page, marks);
  const found = await page.evaluate((all) => {
    const slotOf = (text: Element) => all.find((mark) => (text.textContent ?? '').includes(mark)) ?? null;
    const root = document.querySelector('svg') as SVGSVGElement;
    const toRoot = (root.getScreenCTM() as DOMMatrix).inverse();
    const bandGroup = document.querySelector('[data-mee-band]');
    const band = bandGroup === null ? null : (() => {
      const rect = bandGroup.querySelector('rect') as SVGRectElement;
      const lines = Array.from(bandGroup.querySelectorAll('text'));
      return {
        main: lines[0] === undefined ? null : slotOf(lines[0]),
        sub: lines[1] === undefined ? null : slotOf(lines[1]),
        fill: rect.getAttribute('fill') ?? '#ffffff',
        stroke: rect.getAttribute('stroke') ?? '#1c1941',
        ink: lines[0]?.getAttribute('fill') ?? '#1c1941',
      };
    })();
    const free = Array.from(document.querySelectorAll('svg text'))
      .filter((text) => text.closest('[data-mee-band]') === null && slotOf(text) !== null)
      .map((text) => {
        const element = text as SVGTextElement;
        const m = toRoot.multiply(element.getScreenCTM() as DOMMatrix);
        const x = element.x.baseVal.numberOfItems > 0 ? element.x.baseVal.getItem(0).value : 0;
        const y = element.y.baseVal.numberOfItems > 0 ? element.y.baseVal.getItem(0).value : 0;
        return {
          mark: slotOf(text) as string,
          x: m.a * x + m.c * y + m.e,
          y: m.b * x + m.d * y + m.f,
          rotation: Math.atan2(m.b, m.a),
          scale: Math.hypot(m.a, m.b),
          anchor: element.getAttribute('text-anchor') ?? 'start',
          weight: Number(element.getAttribute('font-weight') ?? '400'),
          fill: element.getAttribute('fill') ?? '#1c1941',
          opacity: Number(element.getAttribute('opacity') ?? '1'),
        };
      });
    return { band, free };
  }, marks);
  const slotOfMark = (mark: string | null): MeeSlot | null => sticker.slots.find((slot) => sentinel(slot) === mark) ?? null;
  const band: Band | null =
    found.band === null
      ? null
      : (() => {
          const main = slotOfMark(found.band.main);
          if (main === null) throw new Error(`${sticker.id} : le bandeau ne porte aucun emplacement`);
          return { main, sub: slotOfMark(found.band.sub), fill: found.band.fill, ink: found.band.ink, stroke: found.band.stroke };
        })();
  const texts = await found.free.reduce<Promise<readonly (Free & Sizing)[]>>(async (previous, text, order) => {
    const done = await previous;
    const slot = slotOfMark(text.mark);
    if (slot === null) return done;
    const sizing = await probe(sticker, slot, order, page);
    return [...done, { ...text, slot, ...sizing }];
  }, Promise.resolve([]));
  return { band, texts };
}

/** La taille et la coupe d'un texte libre selon la longueur saisie — sondées, jamais recopiées. */
async function probe(sticker: MeeSticker, slot: MeeSlot, order: number, page: Page): Promise<Sizing> {
  const lengths = Array.from({ length: PROBE }, (_, i) => i + 1);
  const readings = await lengths.reduce<Promise<readonly { readonly length: number; readonly size: number; readonly clipped: boolean }[]>>(
    async (previous, length) => {
      const done = await previous;
      await page.setContent(page360(sticker, { ...sentinels(sticker), [slot]: 'Q'.repeat(length) }));
      const read = await page.evaluate((index) => {
        const free = Array.from(document.querySelectorAll('svg text')).filter(
          (text) => text.closest('[data-mee-band]') === null && /Q|⟦/.test(text.textContent ?? ''),
        );
        const text = free[index];
        return text === undefined ? null : { size: Number(text.getAttribute('font-size') ?? '0'), content: text.textContent ?? '' };
      }, order);
      if (read === null) throw new Error(`${sticker.id} : le texte ${order} a disparu à ${length} caractères`);
      return [...done, { length, size: read.size, clipped: read.content.endsWith('…') }];
    },
    Promise.resolve([]),
  );
  const sizes = readings.reduce<readonly (readonly [number, number])[]>(
    (acc, reading) => (acc.at(-1)?.[1] === reading.size ? acc : [...acc, [reading.length, reading.size] as const]),
    [],
  );
  const firstClipped = readings.find((reading) => reading.clipped);
  return { sizes, max: firstClipped === undefined ? null : firstClipped.length - 1 };
}

const measured = new Map<string, Measured>();
mkdirSync(OUT, { recursive: true });
if (!indexOnly && !resume) removeFilms(instants.map((sticker) => sticker.id));
const queue = [...instants];
await openPages(async (page, cdp) => {
  for (let sticker = queue.shift(); sticker !== undefined; sticker = queue.shift()) {
    const current = sticker;
    const result = await measure(current, page);
    measured.set(current.id, result);
    if (indexOnly || (resume && hasFilm(current.id))) continue;
    const marks = current.slots.map(sentinel);
    await filmShot(
      {
        id: current.id,
        svg: renderMeeSticker(current, { uid: 'ios', size: SIZE, slots: sentinels(current) }),
        motion: current.motion,
        prepare: async (filmed) => {
          await freezeCarriers(filmed, marks);
          await filmed.evaluate((all) => {
            document.querySelectorAll('[data-mee-band]').forEach((band) => band.setAttribute('visibility', 'hidden'));
            document.querySelectorAll('svg text').forEach((text) => {
              if (all.some((mark) => (text.textContent ?? '').includes(mark))) text.setAttribute('visibility', 'hidden');
            });
          }, marks);
        },
      },
      page,
      cdp,
    );
  }
});

const hex = (color: string): string => {
  const value = color.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`couleur illisible : ${color}`);
  return `0x${full.toUpperCase()}`;
};
const num = (value: number): string => String(Math.round(value * 1000) / 1000);
const swiftSlots = (slots: MeeSlots): string => {
  const pairs = Object.entries(slots).filter(([, value]) => value !== undefined);
  return pairs.length === 0 ? '[:]' : `[${pairs.map(([key, value]) => `.${key}: ${JSON.stringify(value)}`).join(', ')}]`;
};

const entry = (sticker: MeeSticker): string => {
  const { band, texts } = measured.get(sticker.id) as Measured;
  const bandSwift =
    band === null
      ? 'nil'
      : `.init(main: .${band.main}, sub: ${band.sub === null ? 'nil' : `.${band.sub}`}, fill: ${hex(band.fill)}, ink: ${hex(band.ink)}, stroke: ${hex(band.stroke)})`;
  const textSwift = texts.map(
    (t) =>
      `.init(slot: .${t.slot}, x: ${num(t.x)}, y: ${num(t.y)}, rotation: ${num(t.rotation)}, scale: ${num(t.scale)}, anchor: .${t.anchor === 'middle' ? 'middle' : t.anchor === 'end' ? 'end' : 'start'}, weight: ${t.weight}, fill: ${hex(t.fill)}, opacity: ${num(t.opacity)}, sizes: [${t.sizes.map(([from, size]) => `.init(from: ${from}, size: ${num(size)})`).join(', ')}], max: ${t.max === null ? 'nil' : t.max})`,
  );
  return `        MeeInstant(id: ${JSON.stringify(sticker.id)}, kind: .${sticker.section}, title: ${JSON.stringify(sticker.title)}, emoji: ${JSON.stringify(sticker.emoji)}, animated: ${sticker.motion !== null}, slots: [${sticker.slots.map((slot) => `.${slot}`).join(', ')}], defaults: ${swiftSlots(sticker.defaults)}, band: ${bandSwift}, texts: [${textSwift.join(', ')}]),`;
};

const [vx, vy, vw, vh] = MEE_VIEWBOX.split(' ').map(Number);
const index = `// GÉNÉRÉ par apps/web/scripts/mee-ios-instants.ts — ne pas modifier à la main (#9069).

import CoreGraphics

extension MeeInstantCatalog {
    /// La boîte de vue du dessin (\`MEE_VIEWBOX\`) : le cadre du film, dans le repère où l'index mesure.
    nonisolated public static let viewBox = CGRect(x: ${vx}, y: ${vy}, width: ${vw}, height: ${vh})

    nonisolated public static let all: [MeeInstant] = [
${instants.map(entry).join('\n')}
    ]
}
`;
writeFileSync(join(STORY, 'MeeInstantCatalog+Index.swift'), index);
process.stdout.write(`\n${instants.length} instants → ${OUT}\n`);
