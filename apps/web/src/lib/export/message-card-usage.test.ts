import { describe, expect, test } from 'bun:test';

import { FEATURED_TEMPLATE_IDS } from './message-card-templates';
import { MESSAGE_CARD_USAGE_KEY, popularTemplates, readTemplateUsage, recordTemplateUse } from './message-card-usage';

const memory = (initial: Readonly<Record<string, string>> = {}) => {
  const entries = new Map(Object.entries(initial));
  return { entries, getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => void entries.set(key, value) };
};

describe('le compteur d’usage des templates', () => {
  test('chaque carte enregistrée compte une fois pour son template', () => {
    const storage = memory();
    recordTemplateUse(storage, 'minuit.affiche.fleche');
    recordTemplateUse(storage, 'minuit.affiche.fleche');
    recordTemplateUse(storage, 'neige.systeme.bulles');
    expect(readTemplateUsage(storage)).toEqual({ 'minuit.affiche.fleche': 2, 'neige.systeme.bulles': 1 });
    expect(storage.entries.has(MESSAGE_CARD_USAGE_KEY)).toBe(true);
  });

  test('une valeur abîmée ou un template disparu ne compte pour rien', () => {
    expect(readTemplateUsage(memory({ [MESSAGE_CARD_USAGE_KEY]: '{oops' }))).toEqual({});
    expect(readTemplateUsage(memory({ [MESSAGE_CARD_USAGE_KEY]: '[1,2]' }))).toEqual({});
    const mixed = JSON.stringify({ 'aurore.rond.orbite': 3, 'neon.rond.orbite': 9, 'lagon.futur.filet': -1, 'neige.systeme.bulles': 1.5 });
    expect(readTemplateUsage(memory({ [MESSAGE_CARD_USAGE_KEY]: mixed }))).toEqual({ 'aurore.rond.orbite': 3 });
  });

  test('les plus utilisés d’abord, puis la vitrine pour compléter, sans doublon', () => {
    const popular = popularTemplates({ 'neige.systeme.bulles': 1, 'braise.marqueur.silence': 5, 'aurore.rond.orbite': 2 }, 6);
    expect(popular.slice(0, 3)).toEqual(['braise.marqueur.silence', 'aurore.rond.orbite', 'neige.systeme.bulles']);
    expect(popular.length).toBe(6);
    expect(new Set(popular).size).toBe(6);
  });

  test('un appareil qui n’a rien exporté voit la vitrine', () => {
    expect(popularTemplates({}, 4)).toEqual(FEATURED_TEMPLATE_IDS.slice(0, 4));
  });
});
