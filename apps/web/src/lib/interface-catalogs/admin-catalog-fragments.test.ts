import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { ADMIN_LANGUAGES, type AdminLanguage } from '@/lib/i18n-admin-catalog';

/**
 * **LE CATALOGUE D'ADMINISTRATION EST UNE SOMME DE FRAGMENTS** (#8876).
 *
 * Dix lots de section travaillent en parallèle sans jamais éditer le même
 * fichier : chacun possède SON fragment, sous SES préfixes. Ce témoin tient les
 * quatre règles qui rendent cela sûr — mêmes clés dans les sept langues,
 * préfixes exclusifs, rien de la base sous un préfixe de fragment, aucune clé
 * dans deux fragments.
 */

type Fragment = Readonly<Record<string, string>>;

const FRAGMENT_PREFIXES: Readonly<Record<string, readonly string[]>> = {
  kit: ['admin.kit.', 'admin.group.', 'admin.value.', 'admin.enum.'],
  dashboard: ['admin.dash.'],
  statistiques: ['admin.analytics.', 'admin.lang.'],
  moderation: ['admin.moderation.'],
  contenus: ['admin.posts.', 'admin.community.'],
  liens: ['admin.shareLink.', 'admin.tracking.', 'admin.invitation.'],
  diffusions: ['admin.broadcast.'],
  'classement-supervision': ['admin.ranking.', 'admin.monitoring.'],
  'audit-reglages': ['admin.audit.', 'admin.settings.'],
  personnes: ['admin.people.'],
  'conversations-agent': ['admin.conversation.', 'admin.agentPanel.'],
};

const IDS = Object.keys(FRAGMENT_PREFIXES);

async function fragment(id: string, language: AdminLanguage): Promise<Fragment> {
  const module: { readonly default: Fragment } = await import(`./admin/${id}-${language}.ts`);
  return module.default;
}

async function base(language: AdminLanguage): Promise<Fragment> {
  const module: { readonly default: Fragment } = await import(`./catalog-admin-${language}.ts`);
  return module.default;
}

const startsWithAny = (key: string, prefixes: readonly string[]): boolean => prefixes.some((prefix) => key.startsWith(prefix));

describe('les fragments du catalogue d’administration', () => {
  test('la table des préfixes couvre les onze fragments de la spécification', () => {
    expect(IDS).toHaveLength(11);
  });

  for (const id of IDS) {
    test(`« ${id} » porte les mêmes clés dans les quatre langues de l’administration`, async () => {
      const source = Object.keys(await fragment(id, 'fr')).sort();
      for (const language of ADMIN_LANGUAGES) {
        const keys = Object.keys(await fragment(id, language)).sort();
        expect({ id, language, keys }).toEqual({ id, language, keys: source });
      }
    });

    test(`« ${id} » ne pose que des clés sous ses préfixes exclusifs`, async () => {
      const prefixes = FRAGMENT_PREFIXES[id] ?? [];
      const hors = Object.keys(await fragment(id, 'fr')).filter((key) => !startsWithAny(key, prefixes));
      expect({ id, hors }).toEqual({ id, hors: [] });
    });
  }

  test('aucune clé de la base ne commence par un préfixe de fragment', async () => {
    const tous = Object.values(FRAGMENT_PREFIXES).flat();
    const kit = new Set(Object.keys(await fragment('kit', 'fr')));
    const others = await Promise.all(IDS.filter((id) => id !== 'kit').map((id) => fragment(id, 'fr')));
    const dansUnFragment = new Set([...kit, ...others.flatMap((f) => Object.keys(f))]);
    const baseKeys = Object.keys(await base('fr')).filter((key) => !dansUnFragment.has(key));
    expect(baseKeys.filter((key) => startsWithAny(key, tous))).toEqual([]);
  });

  test('aucune clé n’est dans deux fragments', async () => {
    const seen = new Map<string, string>();
    const doubles: string[] = [];
    for (const id of IDS) {
      for (const key of Object.keys(await fragment(id, 'fr'))) {
        const first = seen.get(key);
        if (first !== undefined) doubles.push(`${key} (${first}, ${id})`);
        seen.set(key, id);
      }
    }
    expect(doubles).toEqual([]);
  });

  test('chaque langue somme ses fragments : toute clé d’un fragment est dans le catalogue', async () => {
    for (const language of ADMIN_LANGUAGES) {
      const catalog = await base(language);
      for (const id of IDS) {
        const manquantes = Object.keys(await fragment(id, language)).filter((key) => !(key in catalog));
        expect({ language, id, manquantes }).toEqual({ language, id, manquantes: [] });
      }
    }
  });
});

/**
 * L'administration n'est servie qu'en fr, en, es, pt : un fragment ou un
 * catalogue `de`, `it`, `ar` est du poids mort que personne ne charge (le
 * chargeur, `adminLanguageOf`, les lit en anglais) — et que le prochain lot
 * traduirait à tort « pour être complet ».
 */
describe('aucun catalogue d’administration hors des quatre langues', () => {
  const directory = fileURLToPath(new URL('.', import.meta.url));
  const adminFiles = [
    ...readdirSync(directory).filter((name) => name.startsWith('catalog-admin-')),
    ...readdirSync(new URL('./admin/', import.meta.url)).filter((name) => name.endsWith('.ts')),
  ];
  const languageOf = (name: string): string => /-([a-z]{2})\.ts$/.exec(name)?.[1] ?? '';

  test('la lecture du dossier voit des fichiers dans chacune des quatre langues', () => {
    expect([...new Set(adminFiles.map(languageOf).filter((language) => language !== ''))].sort()).toEqual(['en', 'es', 'fr', 'pt']);
  });

  test('aucun fichier de, it ou ar', () => {
    expect(adminFiles.filter((name) => ['de', 'it', 'ar'].includes(languageOf(name)))).toEqual([]);
  });
});
