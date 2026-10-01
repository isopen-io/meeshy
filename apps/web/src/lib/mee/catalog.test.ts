import { describe, expect, test } from 'bun:test';

import { MEE_STICKERS, findMeeSticker, meeSlotsFor, meeStickerOfTemplate, meeStickersOfTab, meeTemplateId } from './catalog';
import { PRIMS, motionSignature, tellsAnAction } from './motion';
import { renderMeeSticker } from './render';
import { MEE_EMOTIONS } from './types';
import type { MeeSticker } from './types';

/**
 * LE PACK MEE ET MEO TIENT SES PROMESSES (#9034) — et les mesure.
 *
 * La commande du porteur : une centaine de stickers des deux personnages, une
 * centaine de stickers dynamiques (lieu, météo, heure, message) dont 60 %
 * animés, 70 % d'animés sur l'ensemble, des animations DIFFÉRENTES, et
 * 60 % des animés qui racontent une action portée par une émotion — pas un
 * battement qui gonfle et dégonfle.
 */

const animated = (list: readonly MeeSticker[]) => list.filter((s) => s.motion !== null);
const ratio = (part: number, whole: number) => part / whole;

describe('le volume et les ratios', () => {
  const characters = MEE_STICKERS.filter((s) => s.tab !== 'instants');
  const instants = meeStickersOfTab('instants');

  test('une centaine de stickers des personnages, une centaine de dynamiques', () => {
    expect(characters.length).toBeGreaterThanOrEqual(100);
    expect(instants.length).toBe(100);
  });

  test('60 % des stickers dynamiques sont animés', () => {
    expect(ratio(animated(instants).length, instants.length)).toBeGreaterThanOrEqual(0.6);
  });

  test('70 % de l’ensemble est animé', () => {
    expect(ratio(animated(MEE_STICKERS).length, MEE_STICKERS.length)).toBeGreaterThanOrEqual(0.7);
  });

  test('60 % des animés racontent une action portée par une émotion', () => {
    const all = animated(MEE_STICKERS);
    const meaningful = all.filter((s) => s.motion !== null && tellsAnAction(s.motion) && MEE_EMOTIONS.has(s.feeling));
    expect(ratio(meaningful.length, all.length)).toBeGreaterThanOrEqual(0.6);
  });

  test('les animations sont différentes : 70 % des chorégraphies sont uniques', () => {
    const all = animated(MEE_STICKERS);
    const signatures = new Set(all.map((s) => (s.motion === null ? '' : motionSignature(s.motion))));
    expect(ratio(signatures.size, all.length)).toBeGreaterThanOrEqual(0.7);
  });

  test('aucune primitive ne domine : la plus jouée anime moins d’un animé sur cinq', () => {
    const all = animated(MEE_STICKERS);
    const counts = new Map<string, number>();
    all.forEach((s) => new Set(Object.values(s.motion?.roles ?? {}).map((beat) => beat?.[0])).forEach((prim) => counts.set(String(prim), (counts.get(String(prim)) ?? 0) + 1)));
    expect(Math.max(...counts.values()) / all.length).toBeLessThan(0.2);
  });

  test('les sentiments couvrent amour, morbide, joie, célébration, rejet, consolation, frustration, seul et à deux', () => {
    const wanted = ['amour', 'morbide', 'joie', 'celebration', 'rejet', 'consolation', 'frustration', 'tristesse', 'colere', 'peur', 'jalousie'] as const;
    const solo = new Set(MEE_STICKERS.filter((s) => s.section === 'solo').map((s) => s.feeling));
    const duo = new Set(MEE_STICKERS.filter((s) => s.section === 'duo').map((s) => s.feeling));
    expect(wanted.filter((f) => !solo.has(f) && f !== 'rejet' && f !== 'consolation')).toEqual([]);
    expect(['amour', 'morbide', 'joie', 'celebration', 'rejet', 'consolation', 'colere', 'jalousie'].filter((f) => !duo.has(f as MeeSticker['feeling']))).toEqual([]);
  });
});

describe('les onglets Mee et Meo', () => {
  test('chaque onglet a ses stickers seuls et sa partie à deux', () => {
    (['mee', 'meo'] as const).forEach((tab) => {
      const list = meeStickersOfTab(tab);
      expect(list.filter((s) => s.section === 'solo').length).toBe(30);
      expect(list.filter((s) => s.section === 'duo').length).toBe(22);
    });
  });

  test('à deux, l’acteur s’inverse ET la scène change : jamais le même sticker d’un onglet à l’autre', () => {
    const duoOf = (tab: 'mee' | 'meo') => meeStickersOfTab(tab).filter((s) => s.section === 'duo');
    duoOf('mee').forEach((mine) => {
      const twin = findMeeSticker(mine.id.replace('duo-mee-', 'duo-meo-'));
      expect(twin).toBeDefined();
      const a = renderMeeSticker(mine, { uid: 'x' });
      const b = renderMeeSticker(twin as MeeSticker, { uid: 'x' });
      expect(a).not.toBe(b);
      const strip = (svg: string) => svg.replace(/#[0-9a-f]{6}/gi, '').replace(/xmee\d|xmeo\d/g, '');
      expect(strip(a)).not.toBe(strip(b));
    });
  });
});

describe('le contrat de message', () => {
  test('chaque identifiant est unique et devient un templateId accepté par la passerelle', () => {
    const ids = MEE_STICKERS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    MEE_STICKERS.forEach((s) => {
      expect(meeTemplateId(s)).toMatch(/^[a-z0-9][a-z0-9._-]*$/);
      expect(meeTemplateId(s).length).toBeLessThanOrEqual(64);
      expect(s.emoji.length).toBeLessThanOrEqual(16);
      expect(meeStickerOfTemplate(meeTemplateId(s))).toBe(s);
    });
  });

  test('un templateId étranger ne désigne aucun sticker Mee', () => {
    expect(meeStickerOfTemplate('heart-badge')).toBeUndefined();
    expect(meeStickerOfTemplate('mee.inconnu')).toBeUndefined();
    expect(meeStickerOfTemplate(undefined)).toBeUndefined();
  });

  test('un sticker ne garde que les valeurs qu’il déclare', () => {
    const sticker = findMeeSticker('instant-plage') as MeeSticker;
    expect(meeSlotsFor(sticker, { place: ' Biarritz ', weather: 'ignoré', message: '' })).toEqual({ place: 'Biarritz' });
  });

  test('un sticker animé porte sa chorégraphie, sous sa propre classe et sous la préférence de mouvement réduit', () => {
    const sticker = findMeeSticker('duo-meo-bisou') as MeeSticker;
    const svg = renderMeeSticker(sticker, { uid: 'a1' });
    expect(svg).toContain('@keyframes mee-faint');
    expect(svg).toMatch(/@media \(prefers-reduced-motion:no-preference\)\{.*\.mee-s-a1 \.b2\{animation:mee-faint/);
    expect(renderMeeSticker(sticker, { uid: 'a1', animated: false })).not.toContain('<style>');
    expect(renderMeeSticker(findMeeSticker('mee-cafe') as MeeSticker)).not.toContain('<style>');
  });

  test('chaque primitive jouée existe', () => {
    animated(MEE_STICKERS).forEach((s) => Object.values(s.motion?.roles ?? {}).forEach((beat) => expect(beat !== undefined && beat[0] in PRIMS).toBe(true)));
  });
});

describe('les stickers dynamiques', () => {
  const instants = meeStickersOfTab('instants');

  test('les quatre familles : météo, moment, lieu, message', () => {
    const count = (section: MeeSticker['section']) => instants.filter((s) => s.section === section).length;
    expect(count('meteo') + count('moment') + count('lieu') + count('message')).toBe(100);
    expect(Math.min(count('meteo'), count('moment'), count('lieu'), count('message'))).toBeGreaterThanOrEqual(20);
  });

  test('chaque dynamique écrit ce qu’on saisit — et sa valeur par défaut tant qu’on ne saisit rien', () => {
    instants.forEach((s) => {
      const key = s.slots[0];
      expect(key).toBeDefined();
      const typed = renderMeeSticker(s, { slots: { [String(key)]: 'Zanzibar' } });
      expect(typed).toContain('Zanzibar');
      const fallback = s.defaults[key as keyof typeof s.defaults];
      expect(fallback).toBeDefined();
      expect(renderMeeSticker(s)).toContain(String(fallback).slice(0, 6).replace(/’/g, '’'));
    });
  });

  test('un texte saisi ne peut pas injecter de balise', () => {
    instants.forEach((s) => {
      const svg = renderMeeSticker(s, { slots: { message: '<script>x</script>', place: '"><img onerror=1>', weather: '<b>', time: '&' } });
      expect(svg).not.toContain('<script');
      expect(svg).not.toContain('<img');
      expect(svg).not.toContain('<b>');
    });
  });
});
