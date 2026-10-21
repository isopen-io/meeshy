import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { loadGameCatalog } from '../i18n-game-catalog';
import { loadOnboardingCatalog } from '../i18n-onboarding-catalog';
import type { InterfaceLanguage } from '../interface-language';

/**
 * **LES MÊMES CLÉS DISENT LES MÊMES MOTS SUR LE WEB ET SUR iOS** (épopée § 3.4 et
 * § 10, #11179) — le témoin de parité du jeu entre les catalogues du web et
 * `apps/ios/Meeshy/Localizable.xcstrings`.
 *
 * Une clé est COMMUNE quand l'app la porte (`game.*`, `game2.*`, `progression.*`,
 * `achievement.*`, `onboarding.recap.*`) sous le nom d'une clé du web (`game2.X`
 * est la jumelle de `game.X`) ET que les deux disent le même français : le
 * français est la source, et une phrase que l'app a réécrite pour sa place
 * (une pastille de 28 caractères, un ordinal qui entre dans une phrase) n'est pas
 * la même phrase. Pour chaque clé commune, chaque langue dit, sur iOS, le texte
 * du web au caractère près, paramètres mis de côté (`{name}` d'un côté, `%@`,
 * `%2$@`, `%lld` de l'autre) et espaces typographiques confondus : l'espace
 * insécable devant « % » est une règle de chaque plateforme, pas un mot.
 *
 * Ce témoin vit côté web parce que les catalogues du web sont des modules : il
 * les charge par leur chargeur, et lit le catalogue d'iOS, du JSON. La CI le
 * joue à chaque poussée, qu'elle touche l'un ou l'autre côté.
 */

const IOS_CATALOG = join(dirname(fileURLToPath(import.meta.url)), '../../../../ios/Meeshy/Localizable.xcstrings');

const GAME_PREFIXES = ['game.', 'game2.', 'progression.', 'achievement.', 'onboarding.recap.'] as const;

/** Les six langues traduites, et le nom que le catalogue d'iOS donne à chacune. */
const TRANSLATED: readonly { readonly web: InterfaceLanguage; readonly ios: string }[] = [
  { web: 'en', ios: 'en' },
  { web: 'es', ios: 'es' },
  { web: 'de', ios: 'de' },
  { web: 'it', ios: 'it' },
  { web: 'pt', ios: 'pt-BR' },
  { web: 'ar', ios: 'ar' },
];

/**
 * Les clés que l'app partage avec le web mais dont elle a réécrit le français
 * pour sa place : un plafond, jamais une cible. Il ne monte pas ; chaque phrase
 * réalignée sur le web le fait descendre (#11334).
 */
const IOS_OWN_FRENCH_CEILING = 62;

/**
 * Les deux seules clés communes dont une langue, sur iOS, ne peut pas dire le
 * texte du web : l'arabe du web tait le nombre à la forme `.one` (« خطوة واحدة »),
 * et iOS, qui choisit la clé `.one` à la main et non par une règle de pluriel,
 * exige la substitution du français (`LocalizationCatalogGuardTests`).
 */
const IOS_KEEPS_THE_COUNT: ReadonlySet<string> = new Set(['ar:game2.season.stars.one', 'ar:game2.door.showcase.count.one']);

const unitSchema = z.object({ stringUnit: z.object({ value: z.string() }) });
const xcstringsSchema = z.object({
  strings: z.record(z.string(), z.object({ localizations: z.record(z.string(), z.unknown()).optional() })),
});

type Catalog = Readonly<Record<string, string>>;
type IosTable = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** `game2.X` est la jumelle de la clé web `game.X`. */
const sharedKey = (key: string): string => (key.startsWith('game2.') ? `game.${key.slice('game2.'.length)}` : key);

const IOS_SUBSTITUTION = /%(?:\d+\$)?(?:@|lld|ld|d)/g;
const WEB_PARAMETER = /\{[^{}]*\}/g;

const fromIos = (value: string): string => value.replaceAll('%%', '\u0000').replace(IOS_SUBSTITUTION, '§').replaceAll('\u0000', '%');
const fromWeb = (value: string): string => value.replace(WEB_PARAMETER, '§');
const withPlainSpaces = (value: string): string => value.replace(/[  ]/g, ' ');

/** Les valeurs simples (sans variation plurielle) des clés du jeu de l'app : `clé → langue → valeur`. */
const iosGameTable = (raw: string): IosTable => {
  const { strings } = xcstringsSchema.parse(JSON.parse(raw));
  return Object.fromEntries(
    Object.entries(strings)
      .filter(([key]) => GAME_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .map(([key, entry]) => [
        key,
        Object.fromEntries(
          Object.entries(entry.localizations ?? {}).flatMap(([locale, localization]) => {
            const unit = unitSchema.safeParse(localization);
            return unit.success ? [[locale, unit.data.stringUnit.value]] : [];
          }),
        ),
      ]),
  );
};

type Partition = { readonly common: readonly string[]; readonly ownFrench: readonly string[] };

/** Les clés de l'app qui portent une clé du web : celles qui disent son français, et celles qui l'ont réécrit. */
const partition = (ios: IosTable, webFrench: Catalog): Partition => {
  const shared = Object.keys(ios)
    .filter((key) => ios[key]?.fr !== undefined && webFrench[sharedKey(key)] !== undefined)
    .sort();
  const saysTheWebFrench = (key: string): boolean =>
    withPlainSpaces(fromIos(ios[key]?.fr ?? '')) === withPlainSpaces(fromWeb(webFrench[sharedKey(key)] ?? ''));
  return { common: shared.filter(saysTheWebFrench), ownFrench: shared.filter((key) => !saysTheWebFrench(key)) };
};

type Drift = { readonly key: string; readonly ios: string | null; readonly web: string | null };

/** Les clés communes dont la langue, sur iOS, ne dit pas le texte du web. */
const driftsIn = (ios: IosTable, common: readonly string[], locale: string, web: Catalog): readonly Drift[] =>
  common.flatMap((key) => {
    if (IOS_KEEPS_THE_COUNT.has(`${locale}:${key}`)) return [];
    const iosValue = ios[key]?.[locale] ?? null;
    const webValue = web[sharedKey(key)] ?? null;
    const same = iosValue !== null && webValue !== null && withPlainSpaces(fromIos(iosValue)) === withPlainSpaces(fromWeb(webValue));
    return same ? [] : [{ key, ios: iosValue, web: webValue }];
  });

const engagementCatalog = async (language: InterfaceLanguage): Promise<Catalog> =>
  (await import(`../interface-catalogs/catalog-${language}-engagement.ts`)).default as Catalog;

/** Les catalogues du jeu d'une langue, fusionnés comme les lit la garde de vocabulaire. */
const webGameCatalog = async (language: InterfaceLanguage): Promise<Catalog> => ({
  ...(await loadGameCatalog(language)),
  ...(await engagementCatalog(language)),
  ...(await loadOnboardingCatalog(language)),
});

const ios = iosGameTable(readFileSync(IOS_CATALOG, 'utf8'));

describe('le témoin de parité lui-même', () => {
  const syntheticIos: IosTable = {
    'game.sparks.debt': { fr: 'Une ombre sur %@ étincelles', en: 'A shadow on %@ sparks' },
    'game2.league.place': { fr: 'Place %1$@ sur %2$@', en: 'Rank %1$@ of %2$@' },
    'game.tier.ordinal.1': { fr: 'premier', en: 'first' },
    'game.ios.only': { fr: 'Rien que pour iOS', en: 'Only for iOS' },
  };
  const syntheticWebFrench: Catalog = {
    'game.sparks.debt': 'Une ombre sur {debt} étincelles',
    'game.league.place': 'Place {place} sur {size}',
    'game.tier.ordinal.1': 'premier état',
  };
  const syntheticWebEnglish: Catalog = {
    'game.sparks.debt': 'A shadow on {debt} sparks',
    'game.league.place': 'Place {place} of {size}',
    'game.tier.ordinal.1': 'first phase',
  };

  test('une clé est commune quand l’app la porte sous le nom du web et dit le même français', () => {
    expect(partition(syntheticIos, syntheticWebFrench)).toEqual({
      common: ['game.sparks.debt', 'game2.league.place'],
      ownFrench: ['game.tier.ordinal.1'],
    });
  });

  test('il voit une langue qui diverge, et ne voit pas une différence de paramètres', () => {
    const { common } = partition(syntheticIos, syntheticWebFrench);
    expect(driftsIn(syntheticIos, common, 'en', syntheticWebEnglish)).toEqual([
      { key: 'game2.league.place', ios: 'Rank %1$@ of %2$@', web: 'Place {place} of {size}' },
    ]);
  });
});

const { common, ownFrench } = partition(ios, await webGameCatalog('fr'));

describe('les clés communes au web et à iOS disent les mêmes mots, dans chaque langue', () => {
  test('le témoin voit le jeu : plus de neuf cents clés communes', () => {
    expect(common.length).toBeGreaterThan(900);
  });

  test(`les phrases que l’app a réécrites pour sa place ne dépassent pas ${IOS_OWN_FRENCH_CEILING}`, () => {
    expect(ownFrench.length <= IOS_OWN_FRENCH_CEILING ? [] : ownFrench).toEqual([]);
  });

  for (const { web, ios: locale } of TRANSLATED) {
    test(`${locale} : chaque clé commune dit, sur iOS, le texte du web`, async () => {
      expect({ locale, drifts: driftsIn(ios, common, locale, await webGameCatalog(web)) }).toEqual({ locale, drifts: [] });
    });
  }
});
