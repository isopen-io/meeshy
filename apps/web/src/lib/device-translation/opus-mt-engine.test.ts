import { describe, expect, test } from 'bun:test';

import { createOpusMtTranslator, type MarianPipeline } from './opus-mt-engine';

const rejection = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('la promesse a été tenue');
};

type Generation = { readonly model: string; readonly text: string; readonly max_new_tokens: number };

/** Un banc de faux modèles : ce qui se charge, ce qui se libère, ce qui se génère, et combien tiennent en mémoire à la fois. */
const bench = (answer: (model: string, text: string) => string = (model, text) => `${model.replace('Xenova/opus-mt-', '')}:${text}`) => {
  const loads: string[] = [];
  const disposals: string[] = [];
  const generations: Generation[] = [];
  let open = 0;
  let peak = 0;

  const load = async (model: string): Promise<MarianPipeline> => {
    loads.push(model);
    open += 1;
    peak = Math.max(peak, open);
    return {
      countTokens: (text) => text.split(/\s+/).filter(Boolean).length,
      generate: async (text, { max_new_tokens }) => {
        generations.push({ model, text, max_new_tokens });
        return answer(model, text);
      },
      dispose: async () => {
        disposals.push(model);
        open -= 1;
      },
    };
  };

  return { load, loads, disposals, generations, peak: () => peak };
};

describe('createOpusMtTranslator — Opus-MT derrière des pipelines injectés (#9898)', () => {
  test('ne couvre que les sept langues du produit', () => {
    const engine = createOpusMtTranslator({ name: 'opus', load: bench().load });
    expect(engine.supports('fr', 'en')).toBe(true);
    expect(engine.supports('ar', 'pt')).toBe(true);
    expect(engine.supports('fr', 'sw')).toBe(false);
    expect(engine.supports('fr', 'fr')).toBe(false);
  });

  test('une paire directe charge un seul modèle et ne préfixe rien', async () => {
    const b = bench();
    const engine = createOpusMtTranslator({ name: 'opus', load: b.load });
    expect(await engine.translate('Bonjour', { source: 'fr', target: 'es' })).toBe('fr-es:Bonjour');
    expect(b.loads).toEqual(['Xenova/opus-mt-fr-es']);
    expect(b.generations.map((g) => g.text)).toEqual(['Bonjour']);
  });

  test('le jeton de langue cible précède le texte des modèles multi-cibles', async () => {
    const b = bench();
    const engine = createOpusMtTranslator({ name: 'opus', load: b.load });
    await engine.translate('Hello', { source: 'en', target: 'ar' });
    await engine.translate('Hello', { source: 'en', target: 'pt' });
    expect(b.generations.map((g) => g.text)).toEqual(['>>ara<< Hello', '>>pt<< Hello']);
  });

  test('sans modèle direct, la sortie du premier saut nourrit le second', async () => {
    const b = bench();
    const engine = createOpusMtTranslator({ name: 'opus', load: b.load });
    expect(await engine.translate('Bonjour', { source: 'fr', target: 'pt' })).toBe('en-ROMANCE:>>pt<< fr-en:Bonjour');
    expect(b.loads).toEqual(['Xenova/opus-mt-fr-en', 'Xenova/opus-mt-en-ROMANCE']);
    expect(b.generations.map((g) => g.text)).toEqual(['Bonjour', '>>pt<< fr-en:Bonjour']);
  });

  test('chaque ligne se traduit à part, et un saut finit toutes les lignes avant que le suivant ne commence', async () => {
    const b = bench();
    const engine = createOpusMtTranslator({ name: 'opus', load: b.load });
    expect(await engine.translate('salut\n\n  ça va\n', { source: 'fr', target: 'it' })).toBe('en-it:fr-en:salut\n\n  en-it:fr-en:ça va\n');
    expect(b.generations.map((g) => `${g.model.replace('Xenova/opus-mt-', '')}|${g.text}`)).toEqual([
      'fr-en|salut',
      'fr-en|ça va',
      'en-it|fr-en:salut',
      'en-it|fr-en:ça va',
    ]);
  });

  test('le budget de jetons est celui du serveur, calculé sur la ligne sans son jeton de langue', async () => {
    const b = bench();
    const engine = createOpusMtTranslator({ name: 'opus', load: b.load });
    await engine.translate('habari yako', { source: 'en', target: 'ar' });
    expect(b.generations.map((g) => g.max_new_tokens)).toEqual([16]);
  });

  test('un texte blanc n’éveille aucun modèle', async () => {
    const b = bench();
    const engine = createOpusMtTranslator({ name: 'opus', load: b.load });
    expect(await engine.translate('  \n ', { source: 'fr', target: 'en' })).toBe('  \n ');
    expect(b.loads).toEqual([]);
  });

  test('une paire hors des sept est refusée avec sa cause', async () => {
    const engine = createOpusMtTranslator({ name: 'opus', load: bench().load });
    expect(await rejection(engine.translate('habari', { source: 'sw', target: 'fr' }))).toBe('Opus-MT ne couvre pas sw→fr');
  });

  test('un modèle déjà chargé sert la traduction suivante sans se recharger', async () => {
    const b = bench();
    const engine = createOpusMtTranslator({ name: 'opus', load: b.load });
    await engine.translate('a', { source: 'fr', target: 'en' });
    await engine.translate('b', { source: 'fr', target: 'en' });
    expect(b.loads).toEqual(['Xenova/opus-mt-fr-en']);
  });

  test('deux modèles au plus en mémoire : le moins récemment servi est libéré AVANT de charger le suivant', async () => {
    const b = bench();
    const engine = createOpusMtTranslator({ name: 'opus', load: b.load });
    await engine.translate('a', { source: 'fr', target: 'en' });
    await engine.translate('a', { source: 'en', target: 'fr' });
    await engine.translate('a', { source: 'fr', target: 'en' });
    await engine.translate('a', { source: 'es', target: 'en' });
    expect(b.loads).toEqual(['Xenova/opus-mt-fr-en', 'Xenova/opus-mt-en-fr', 'Xenova/opus-mt-es-en']);
    expect(b.disposals).toEqual(['Xenova/opus-mt-en-fr']);
    expect(b.peak()).toBe(2);
  });

  test('une libération qui échoue n’empêche pas la traduction', async () => {
    const loads: string[] = [];
    const load = async (model: string): Promise<MarianPipeline> => {
      loads.push(model);
      return {
        countTokens: () => 1,
        generate: async (text) => `${model}:${text}`,
        dispose: async () => {
          throw new Error('session déjà fermée');
        },
      };
    };
    const engine = createOpusMtTranslator({ name: 'opus', load, capacity: 1 });
    await engine.translate('a', { source: 'fr', target: 'en' });
    expect(await engine.translate('b', { source: 'es', target: 'en' })).toBe('Xenova/opus-mt-es-en:b');
  });

  test('un modèle sans méthode de libération (banc, témoin) se remplace sans erreur', async () => {
    const load = async (model: string): Promise<MarianPipeline> => ({ countTokens: () => 1, generate: async (text) => `${model}:${text}` });
    const engine = createOpusMtTranslator({ name: 'opus', load, capacity: 1 });
    await engine.translate('a', { source: 'fr', target: 'en' });
    expect(await engine.translate('b', { source: 'de', target: 'en' })).toBe('Xenova/opus-mt-de-en:b');
  });

  test('un chargement raté se retente à la traduction suivante et ne laisse rien en mémoire', async () => {
    let attempts = 0;
    const b = bench();
    const engine = createOpusMtTranslator({
      name: 'opus',
      load: async (model) => {
        attempts += 1;
        if (attempts === 1) throw new Error('réseau coupé');
        return b.load(model);
      },
    });
    expect(await rejection(engine.translate('a', { source: 'fr', target: 'en' }))).toBe('réseau coupé');
    expect(await engine.translate('a', { source: 'fr', target: 'en' })).toBe('fr-en:a');
    expect(b.loads).toEqual(['Xenova/opus-mt-fr-en']);
  });

  test('deux demandes simultanées se traduisent l’une après l’autre, sans entrelacer leurs lignes', async () => {
    const order: string[] = [];
    const load = async (): Promise<MarianPipeline> => ({
      countTokens: () => 1,
      generate: async (text) => {
        order.push(`début ${text}`);
        await new Promise((resolve) => setTimeout(resolve, 1));
        order.push(`fin ${text}`);
        return text;
      },
      dispose: async () => undefined,
    });
    const engine = createOpusMtTranslator({ name: 'opus', load });
    await Promise.all([engine.translate('a1\na2', { source: 'fr', target: 'en' }), engine.translate('b1', { source: 'fr', target: 'en' })]);
    expect(order).toEqual(['début a1', 'fin a1', 'début a2', 'fin a2', 'début b1', 'fin b1']);
  });

  test('l’échec d’une demande ne bloque pas la suivante', async () => {
    const load = async (): Promise<MarianPipeline> => ({
      countTokens: () => 1,
      generate: async (text) => {
        if (text === 'casse') throw new Error('mémoire insuffisante');
        return text.toUpperCase();
      },
    });
    const engine = createOpusMtTranslator({ name: 'opus', load });
    const [first, second] = await Promise.allSettled([
      engine.translate('casse', { source: 'fr', target: 'en' }),
      engine.translate('sawa', { source: 'fr', target: 'en' }),
    ]);
    expect(first.status).toBe('rejected');
    expect(second).toEqual({ status: 'fulfilled', value: 'SAWA' });
  });

  test('porte le nom du moteur', () => {
    expect(createOpusMtTranslator({ name: 'device:opus-mt-q8', load: bench().load }).name).toBe('device:opus-mt-q8');
  });
});
