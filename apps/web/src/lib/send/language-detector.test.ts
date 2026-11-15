import { afterEach, describe, expect, test } from 'bun:test';

import { browserLanguageDetector, defaultLanguageDetector } from './language-detector';

/**
 * `browserLanguageDetector` — l'API native n'est prise que DÉJÀ disponible,
 * jamais téléchargée (#5828, § 4.3). `defaultLanguageDetector` (l'usine qui
 * retombe sur l'heuristique) est couverte par le comportement observable de
 * `use-compose-language.test.tsx` — la retomber ICI exigerait de mocker
 * `import()`, que `defaultLanguageDetector` n'expose pas comme un point
 * d'injection séparé.
 */
type FakeApi = {
  availability: () => Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
  create: () => Promise<{ detect: (text: string) => Promise<readonly { detectedLanguage: string; confidence: number }[]> }>;
};

const globals = globalThis as typeof globalThis & { LanguageDetector?: FakeApi };

afterEach(() => {
  delete globals.LanguageDetector;
});

describe('browserLanguageDetector — l’API native n’est prise que DÉJÀ disponible, jamais téléchargée', () => {
  test('API absente ⇒ null (⇒ l’usine retombe sur l’heuristique)', () => {
    expect(browserLanguageDetector()).toBeNull();
  });

  test('API présente, "downloadable" ⇒ null, ET create() n’est JAMAIS appelé', async () => {
    let createCalls = 0;
    globals.LanguageDetector = {
      availability: async () => 'downloadable',
      create: async () => {
        createCalls += 1;
        return { detect: async () => [] };
      },
    };
    const detector = browserLanguageDetector();
    expect(detector).not.toBeNull();
    const result = await detector!.detect('Do you confirm the mockup?');
    expect(result).toBeNull();
    expect(createCalls).toBe(0);
  });

  test('API présente, "available" ⇒ create() appelé UNE fois pour N détections, verdict projeté', async () => {
    let createCalls = 0;
    globals.LanguageDetector = {
      availability: async () => 'available',
      create: async () => {
        createCalls += 1;
        return { detect: async () => [{ detectedLanguage: 'en', confidence: 0.98 }] };
      },
    };
    const detector = browserLanguageDetector()!;
    expect(await detector.detect('Do you confirm?')).toEqual({ language: 'en', confidence: 0.98 });
    expect(await detector.detect('Are you sure?')).toEqual({ language: 'en', confidence: 0.98 });
    expect(createCalls).toBe(1);
  });

  test('detectedLanguage "und" ⇒ null', async () => {
    globals.LanguageDetector = {
      availability: async () => 'available',
      create: async () => ({ detect: async () => [{ detectedLanguage: 'und', confidence: 0.99 }] }),
    };
    expect(await browserLanguageDetector()!.detect('???')).toBeNull();
  });

  test('create() qui REJETTE ⇒ null, jamais une exception qui sort', async () => {
    globals.LanguageDetector = {
      availability: async () => 'available',
      create: async () => {
        throw new Error('modèle indisponible');
      },
    };
    expect(await browserLanguageDetector()!.detect('Bonjour')).toBeNull();
  });

  test('availability() qui REJETTE ⇒ null également', async () => {
    globals.LanguageDetector = {
      availability: async () => {
        throw new Error('sonde indisponible');
      },
      create: async () => ({ detect: async () => [] }),
    };
    expect(await browserLanguageDetector()!.detect('Bonjour')).toBeNull();
  });
});

/**
 * L'USINE CASCADE, ELLE NE PARIE PAS (revue-correction #5828).
 *
 * Première forme : `if (browser !== null) return browser;` — dès que l'objet
 * `LanguageDetector` EXISTE, l'usine rendait l'adaptateur navigateur et rien
 * d'autre. Or cet adaptateur rend `null` tant que `availability() !==
 * 'available'` (jamais de téléchargement déclenché par une frappe), et Chrome
 * expose l'API en `'downloadable'` tant que le modèle n'est pas récupéré :
 * l'app n'avait alors AUCUNE détection, en silence, sur le navigateur même de
 * la recette — la pastille restait au rang 1 du lecteur et #5828 ne livrait
 * rien. Le motif du dépôt : « le mécanisme est écrit, testé, et jamais
 * activé ». L'heuristique locale sert donc de SECOND étage, toujours.
 */
describe('defaultLanguageDetector — l’heuristique locale est le SECOND étage, jamais un pari sur le navigateur', () => {
  /** Huit mots-outils français, aucun partagé : `detectByStopwords` rend `fr`
   * à confiance 1 (voir `stopword-language-detector.test.ts`). */
  const FRENCH = 'je ne suis pas dans le train avec vous';

  test('API absente ⇒ l’heuristique sert', async () => {
    expect(await defaultLanguageDetector().detect(FRENCH)).toEqual({ language: 'fr', confidence: 1 });
  });

  test('API présente mais "downloadable" ⇒ l’heuristique sert QUAND MÊME (jamais un silence)', async () => {
    globals.LanguageDetector = {
      availability: async () => 'downloadable',
      create: async () => ({ detect: async () => [] }),
    };
    expect(await defaultLanguageDetector().detect(FRENCH)).toEqual({ language: 'fr', confidence: 1 });
  });

  test('API présente et "available" ⇒ son verdict GAGNE, l’heuristique n’est pas consultée', async () => {
    globals.LanguageDetector = {
      availability: async () => 'available',
      create: async () => ({ detect: async () => [{ detectedLanguage: 'de', confidence: 0.91 }] }),
    };
    // Un texte que l'heuristique classerait `fr` : c'est bien le navigateur
    // qui répond, jamais le second étage par-dessus lui.
    expect(await defaultLanguageDetector().detect(FRENCH)).toEqual({ language: 'de', confidence: 0.91 });
  });

  test('API "available" mais SANS verdict ("und") ⇒ l’heuristique reprend la main', async () => {
    globals.LanguageDetector = {
      availability: async () => 'available',
      create: async () => ({ detect: async () => [{ detectedLanguage: 'und', confidence: 0 }] }),
    };
    expect(await defaultLanguageDetector().detect(FRENCH)).toEqual({ language: 'fr', confidence: 1 });
  });
});
