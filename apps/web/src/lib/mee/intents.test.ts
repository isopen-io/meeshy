import { describe, expect, test } from 'bun:test';

import ar from '../interface-catalogs/catalog-ar-composer-attach';
import de from '../interface-catalogs/catalog-de-composer-attach';
import en from '../interface-catalogs/catalog-en-composer-attach';
import es from '../interface-catalogs/catalog-es-composer-attach';
import fr from '../interface-catalogs/catalog-fr-composer-attach';
import it from '../interface-catalogs/catalog-it-composer-attach';
import pt from '../interface-catalogs/catalog-pt-composer-attach';
import { MEE_STICKERS, findMeeSticker, meeStickersOfTab } from './catalog';
import { MEE_INTENT_KEYS, meeIntentOf } from './intents';
import { MEE_CHARACTER_TABS, MEE_INTENTS } from './types';
import type { MeeIntent, MeeSticker } from './types';

/**
 * LES STICKERS SE RANGENT PAR CE QU'ON VEUT DIRE (#9058).
 *
 * Trois onglets de personnages — Mee seule, Meo seul, Mee & Meo — et, dans
 * chacun, des INTENTIONS plutôt que « seul / à deux ». Un message envoyé porte
 * `mee.<id>` : la liste ci-dessous fige les identifiants publiés avant le
 * rangement, aucun ne peut disparaître ni changer.
 */

const PUBLISHED_BEFORE_INTENTS = [
  'mee-coucou', 'mee-bisou-vole', 'mee-coeur-battant', 'mee-rougit', 'mee-pleure', 'mee-sanglote', 'mee-boude', 'mee-colere',
  'mee-evanouie', 'mee-morte-de-rire', 'mee-fond', 'mee-fete', 'mee-gateau', 'mee-danse', 'mee-dodo', 'mee-lettre', 'mee-rose',
  'mee-wow', 'mee-peur', 'mee-calin-moi', 'mee-merci', 'mee-oups', 'mee-jalouse', 'mee-bravo', 'mee-jackpot', 'mee-coeur-brise',
  'mee-courage', 'mee-cafe', 'mee-sourire', 'mee-amoureuse',
  'duo-mee-bisou', 'duo-mee-calin', 'duo-mee-coeur-lance', 'duo-mee-fleurs', 'duo-mee-cupidon', 'duo-mee-boude', 'duo-mee-repousse',
  'duo-mee-porte', 'duo-mee-console', 'duo-mee-parapluie', 'duo-mee-chatouille', 'duo-mee-tope-la', 'duo-mee-cadeau', 'duo-mee-bague',
  'duo-mee-jaloux', 'duo-mee-tu-me-tues', 'duo-mee-selfie', 'duo-mee-dodo', 'duo-mee-trinquer', 'duo-mee-bobo', 'duo-mee-dispute',
  'duo-mee-regime',
  'meo-salut', 'meo-clin', 'meo-bisou', 'meo-serenade', 'meo-muscles', 'meo-cool', 'meo-rit', 'meo-mdr-ko', 'meo-creuse', 'meo-zombie',
  'meo-non-merci', 'meo-rage', 'meo-facepalm', 'meo-bof', 'meo-effondre', 'meo-nuage-noir', 'meo-coeur-brise', 'meo-champagne',
  'meo-trophee', 'meo-feu-artifice', 'meo-dodo', 'meo-pizza', 'meo-peur', 'meo-quoi', 'meo-gene', 'meo-calin', 'meo-ok', 'meo-love',
  'meo-roi', 'meo-gamer',
  'duo-meo-bisou', 'duo-meo-calin', 'duo-meo-coeur-lance', 'duo-meo-fleurs', 'duo-meo-cupidon', 'duo-meo-boude', 'duo-meo-repousse',
  'duo-meo-porte', 'duo-meo-console', 'duo-meo-parapluie', 'duo-meo-chatouille', 'duo-meo-tope-la', 'duo-meo-cadeau', 'duo-meo-bague',
  'duo-meo-jaloux', 'duo-meo-tu-me-tues', 'duo-meo-selfie', 'duo-meo-dodo', 'duo-meo-trinquer', 'duo-meo-bobo', 'duo-meo-dispute',
  'duo-meo-regime',
] as const;

const characters = MEE_STICKERS.filter((s) => s.tab !== 'instants');
const ofTabAndIntent = (tab: MeeSticker['tab'], intent: MeeIntent) => meeStickersOfTab(tab).filter((s) => s.section === intent);

describe('les identifiants publiés', () => {
  test('les 104 identifiants d’avant le rangement sont tous là', () => {
    expect(PUBLISHED_BEFORE_INTENTS.length).toBe(104);
    expect(PUBLISHED_BEFORE_INTENTS.filter((id) => findMeeSticker(id) === undefined)).toEqual([]);
  });

  test('chaque identifiant est unique et s’écrit en `[a-z0-9-]`', () => {
    const ids = MEE_STICKERS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/));
  });
});

describe('les trois onglets de personnages', () => {
  test('Mee, Meo, puis Mee & Meo', () => {
    expect(MEE_CHARACTER_TABS).toEqual(['mee', 'meo', 'duo']);
    expect(new Set(characters.map((s) => s.tab))).toEqual(new Set(MEE_CHARACTER_TABS));
  });

  test('chaque onglet ne montre que les siens : Mee seule, Meo seul, puis tous les duos', () => {
    meeStickersOfTab('mee').forEach((s) => expect(s.id.startsWith('mee-')).toBe(true));
    meeStickersOfTab('meo').forEach((s) => expect(s.id.startsWith('meo-')).toBe(true));
    meeStickersOfTab('duo').forEach((s) => expect(s.id.startsWith('duo-')).toBe(true));
    expect(PUBLISHED_BEFORE_INTENTS.filter((id) => id.startsWith('duo-')).every((id) => findMeeSticker(id)?.tab === 'duo')).toBe(true);
  });

  test('une vingtaine de nouveaux stickers par onglet', () => {
    const published = new Set<string>(PUBLISHED_BEFORE_INTENTS);
    const fresh = (tab: MeeSticker['tab']) => meeStickersOfTab(tab).filter((s) => !published.has(s.id)).length;
    MEE_CHARACTER_TABS.forEach((tab) => {
      expect(fresh(tab)).toBeGreaterThanOrEqual(18);
      expect(fresh(tab)).toBeLessThanOrEqual(24);
    });
  });
});

describe('les intentions', () => {
  test('chaque sticker de personnage est rangé sous une intention', () => {
    characters.forEach((s) => expect(MEE_INTENTS as readonly string[]).toContain(s.section));
  });

  test('l’intention se déduit du sentiment…', () => {
    expect(meeIntentOf('salut')).toBe('bonjour');
    expect(meeIntentOf('amour')).toBe('amour');
    expect(meeIntentOf('celebration')).toBe('fete');
    expect(meeIntentOf('consolation')).toBe('soutien');
    expect(meeIntentOf('jalousie')).toBe('rale');
    expect(meeIntentOf('fatigue')).toBe('coup-de-mou');
    expect(meeIntentOf('peur')).toBe('surprise');
    expect(meeIntentOf('quotidien')).toBe('quotidien');
    expect(meeIntentOf('morbide')).toBe('humour-noir');
  });

  test('… mais un sticker se range à la main sous une autre', () => {
    const merci = findMeeSticker('mee-merci') as MeeSticker;
    expect(merci.feeling).toBe('joie');
    expect(meeIntentOf('joie')).toBe('fete');
    expect(merci.section).toBe('bonjour');
  });

  test('chaque intention a au moins trois stickers dans chacun des trois onglets', () => {
    const thin = MEE_CHARACTER_TABS.flatMap((tab) =>
      MEE_INTENTS.filter((intent) => ofTabAndIntent(tab, intent).length < 3).map((intent) => `${tab}:${intent}`),
    );
    expect(thin).toEqual([]);
  });

  test('chaque intention a un titre et une explication, dans les sept langues', () => {
    const slices: readonly Readonly<Record<string, string>>[] = [fr, en, es, de, it, ar, pt];
    MEE_INTENTS.forEach((intent) => {
      const { title, hint } = MEE_INTENT_KEYS[intent];
      slices.forEach((slice) => {
        expect(slice[title]?.trim().length ?? 0).toBeGreaterThan(0);
        expect(slice[hint]?.trim().length ?? 0).toBeGreaterThan(slice[title]?.length ?? 0);
      });
      [en, es, de, it, ar, pt].forEach((slice) => expect(slice[hint]).not.toBe(fr[hint]));
    });
  });
});
