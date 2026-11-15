import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { FACT_CEILING_MS } from './await-fact.mjs';
// @ts-expect-error — module JS sans déclarations, importé pour son comportement.
import { ROW_SETTLE_INTERVAL_MS, requireRowSettled, waitForRowSettled } from './check-media.mjs';

/**
 * **UNE ATTENTE DE RANGÉE PEUT ÉCHOUER, ET LE DIRE** (#9264).
 *
 * `waitForRowSettled` attendait la stabilisation d'une rangée par quarante
 * essais de 100 ms — un plafond de 4 s — et, si la rangée n'apparaissait
 * JAMAIS, rendait la main **normalement**. L'appelant lisait alors la rangée
 * par un locator NU, dont le défaut Playwright de 30 s LEVAIT ;
 * `lib/browser.mjs` transforme toute exception non rattrapée en
 * `process.exit(1)`, qui jette les témoins déjà verts. Le job mourait sur un
 * `uncaughtException` au lieu de nommer la rangée manquante.
 *
 * Ce témoin tient les trois moitiés du remède :
 *   1. l'attente rend `false` quand le fait n'arrive pas — elle ne peut plus
 *      être confondue avec un succès ;
 *   2. son plafond vient de `FACT_CEILING_MS` (#7054), « proportionné à la
 *      charge », jamais d'un nombre nu ;
 *   3. tout site qui MESURE ensuite la rangée passe par `requireRowSettled`,
 *      qui nomme la rangée dans son échec.
 *
 * La troisième porte une EXCEPTION ÉCRITE : `settleTileInView`
 * (`check-media-grid.mjs`) ignore volontairement le verdict, parce que
 * `paintedAt` refuse la coordonnée et nomme le défaut juste après — « deux
 * gardes valent mieux qu'une exception », dit son doc-comment. Le garde la
 * cite nominativement : une exception tolérée se nomme, sinon ce n'est plus
 * une exception, c'est un trou.
 */

type Sondage = { readonly predicate: unknown; readonly arg: unknown; readonly timeout: number | undefined };

/**
 * Une page de façade. Playwright n'appelle le prédicat qu'avec `arg` — tout le
 * reste (`document`, `window`, `performance`) vient de la page. La façade les
 * installe donc sur `globalThis`, **et les rend aussitôt** : le prédicat est
 * synchrone, donc la fenêtre d'emprunt se referme avant tout `await`.
 *
 * CE `try/finally` N'EST PAS UNE PRÉCAUTION DE STYLE. La première version de ce
 * fichier les installait sans jamais les rendre : les fichiers de tests voisins,
 * qui partagent le processus `bun test`, recevaient un `document` estropié et
 * rougissaient sur `document.addEventListener is undefined` (`src/lib/router.tsx`,
 * `src/lib/api/query-client.ts`). C'est exactement le défaut que #9303 décrit —
 * un témoin qui laisse derrière lui un état de processus —, commis ici par la
 * main qui venait de l'instruire. Une clé ABSENTE avant l'emprunt est **supprimée**
 * au retour, jamais posée à `undefined` : remettre la clé changerait la forme de
 * l'objet global.
 */
const pageQui = (tops: readonly (number | null)[]) => {
  const sondages: Sondage[] = [];
  const fenetre: Record<string, unknown> = {};
  let horloge = 0;
  let index = 0;
  const global = globalThis as unknown as Record<string, unknown>;
  const CLES = ['window', 'document', 'performance'] as const;

  const emprunte = <T>(top: number | null, faire: () => T): T => {
    const avant = CLES.map((cle) => [cle, cle in global, global[cle]] as const);
    global.window = fenetre;
    global.performance = { now: () => horloge };
    global.document = {
      querySelector: (_sel: string) => (top === null ? null : { getBoundingClientRect: () => ({ top }) }),
    };
    try {
      return faire();
    } finally {
      for (const [cle, existait, valeur] of avant) {
        if (existait) global[cle] = valeur;
        else delete global[cle];
      }
    }
  };

  return {
    sondages,
    evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => emprunte(null, () => fn(arg)),
    waitForFunction: async (predicate: (arg: unknown) => boolean, arg: unknown, options?: { timeout?: number }) => {
      sondages.push({ predicate, arg, timeout: options?.timeout });
      const plafond = options?.timeout ?? 0;
      while (horloge <= plafond) {
        const top = tops[Math.min(index, tops.length - 1)] ?? null;
        index += 1;
        if (emprunte(top, () => predicate(arg))) return true;
        horloge += 25;
      }
      throw new Error('Timeout');
    },
  };
};

describe("l'attente de stabilisation d'une rangée peut échouer (#9264)", () => {
  test('une rangée qui n’apparaît jamais rend `false`, jamais un succès muet', async () => {
    const page = pageQui([null]);
    expect(await waitForRowSettled(page, 'media-2')).toBe(false);
  });

  test('une rangée stable rend `true`', async () => {
    const page = pageQui([120, 120, 120]);
    expect(await waitForRowSettled(page, 'media-2')).toBe(true);
  });

  test('le plafond vient de FACT_CEILING_MS, jamais d’un nombre nu', async () => {
    const page = pageQui([null]);
    await waitForRowSettled(page, 'media-2');
    expect(page.sondages[0]?.timeout).toBe(FACT_CEILING_MS);
    expect(ROW_SETTLE_INTERVAL_MS).toBe(100);
  });

  test('`requireRowSettled` nomme la rangée quand l’attente dit non', async () => {
    const page = pageQui([null]);
    const refus: string[] = [];
    await requireRowSettled(page, 'media-2', (ok: boolean, quoi: string) => {
      if (!ok) refus.push(quoi);
    });
    expect(refus).toHaveLength(1);
    expect(refus[0]).toContain('media-2');
  });
});

const SSOT = fileURLToPath(new URL('./check-media.mjs', import.meta.url));
const APPELANTS = [
  '../check-thread-states.mjs',
  './check-media.mjs',
  './check-media-transport.mjs',
  './check-media-grid.mjs',
] as const;

/**
 * Les DEUX seuls sites qui ont le droit d'appeler la forme booléenne, et la
 * raison de chacun :
 *   - `requireRowSettled` est la porte qui NOMME — c'est elle qui compose
 *     l'`expect` ; lui interdire l'appel serait lui interdire d'exister ;
 *   - `settleTileInView` (`check-media-grid.mjs`) jette volontairement le
 *     verdict, parce que `paintedAt` refuse la coordonnée et nomme le défaut
 *     juste après — « deux gardes valent mieux qu'une exception », dit son
 *     doc-comment.
 *
 * Une exception tolérée se NOMME : sinon ce n'est plus une exception, c'est un
 * trou dans le garde.
 */
const EXEMPTIONS = ['requireRowSettled', 'settleTileInView'] as const;

describe('aucune mesure de rangée ne suit une attente dont le verdict est jeté (#9264)', () => {
  test('tous les appelants passent par `requireRowSettled`, sauf l’exemption nommée', async () => {
    const trouves: string[] = [];
    for (const relatif of APPELANTS) {
      const chemin = fileURLToPath(new URL(relatif, import.meta.url));
      const source = await readFile(chemin, 'utf8');
      const lignes = source.split('\n');
      lignes.forEach((ligne, i) => {
        if (!ligne.includes('await waitForRowSettled(')) return;
        const contexte = lignes.slice(Math.max(0, i - 12), i).join('\n');
        if (EXEMPTIONS.some((nom) => contexte.includes(nom))) return;
        trouves.push(`${relatif}:${i + 1}`);
      });
    }
    expect(trouves).toEqual([]);
  });

  test('la SSOT délègue son attente à `awaitCondition`', async () => {
    const source = await readFile(SSOT, 'utf8');
    expect(source).toContain("import { awaitCondition, FACT_CEILING_MS } from './await-fact.mjs';");
    expect(source).toContain('export async function requireRowSettled(');
  });
});
