import { describe, expect, test } from 'bun:test';

import { foldText, GALLERY_ORDER, paletteTone, searchTemplates, type TemplateVocabulary } from './message-card-search';
import { ALL_TEMPLATE_IDS, CARD_PALETTES, templateOf } from './message-card-templates';

const vocabulary: TemplateVocabulary = {
  typeface: { rond: 'Ronde', didone: 'Didone', plume: 'Plume', affiche: 'Affiche', futur: 'Futuriste', machine: 'Machine à écrire', marqueur: 'Marqueur', systeme: 'Système' },
  link: { orbite: 'Orbite', filet: 'Filet', guillemets: 'Guillemets', fleche: 'Flèche', bulles: 'Bulles', fil: 'Fil', silence: 'Silence' },
  tone: { dark: 'Sombre', light: 'Clair' },
};

describe('l’ordre de la galerie', () => {
  test('montre chaque template une fois et une seule', () => {
    expect(GALLERY_ORDER.length).toBe(ALL_TEMPLATE_IDS.length);
    expect(new Set(GALLERY_ORDER).size).toBe(ALL_TEMPLATE_IDS.length);
  });

  test('deux cartes voisines ne partagent ni palette, ni typographie, ni liaison', () => {
    for (const [i, id] of GALLERY_ORDER.slice(0, 60).entries()) {
      const next = GALLERY_ORDER[i + 1];
      if (next === undefined) continue;
      const [a, b] = [templateOf(id), templateOf(next)];
      expect(a.paletteId).not.toBe(b.paletteId);
      expect(a.typefaceId).not.toBe(b.typefaceId);
      expect(a.link).not.toBe(b.link);
    }
  });
});

describe('chercher un template', () => {
  test('une recherche vide rend toute la galerie', () => {
    expect(searchTemplates({ query: '  ', vocabulary }).length).toBe(784);
  });

  test('ignore la casse et les accents, et lit le début des mots', () => {
    const found = searchTemplates({ query: 'FLECHE pech', vocabulary });
    expect(found.length).toBe(8);
    expect(found.every((id) => id.startsWith('peche.') && id.endsWith('.fleche'))).toBe(true);
  });

  test('chaque mot tapé resserre la recherche', () => {
    expect(searchTemplates({ query: 'plume', vocabulary }).length).toBe(98);
    expect(searchTemplates({ query: 'plume sombre', vocabulary }).length).toBe(49);
    expect(searchTemplates({ query: 'plume sombre bulles', vocabulary }).length).toBe(7);
  });

  test('le ton se filtre aussi sans le taper', () => {
    const light = searchTemplates({ query: '', vocabulary, tone: 'light' });
    expect(light.length).toBe(392);
    expect(light.every((id) => paletteTone(CARD_PALETTES[templateOf(id).paletteId]) === 'light')).toBe(true);
  });

  test('un mot qui ne nomme rien ne rend rien', () => {
    expect(searchTemplates({ query: 'zzz', vocabulary })).toEqual([]);
  });

  test('les templates déjà utilisés passent en tête, le plus utilisé d’abord', () => {
    const found = searchTemplates({ query: 'orbite', vocabulary, usage: { 'citron.machine.orbite': 2, 'lagon.futur.orbite': 5 } });
    expect(found.slice(0, 2)).toEqual(['lagon.futur.orbite', 'citron.machine.orbite']);
  });

  test('le nom d’une palette se trouve sans son accent', () => {
    expect(foldText('Éditorial Forêt')).toBe('editorial foret');
    expect(searchTemplates({ query: 'foret', vocabulary }).every((id) => id.startsWith('foret.'))).toBe(true);
  });
});
