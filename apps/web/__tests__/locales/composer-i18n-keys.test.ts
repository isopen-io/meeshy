/**
 * W2 — garde i18n de l'éventail. Modèle : `lentille-i18n-keys.test.ts`.
 *
 * `useI18n('common')` (`hooks/use-i18n.ts`) charge `common.json` puis — le
 * namespace étant AUSSI une clé du fichier — DESCEND dedans avant toute
 * résolution :
 *   `translations = data.default || data; if (ns in translations) translations = translations[ns]`
 * La portée réelle de `t(key)` est donc `data.common`, PAS la racine du
 * fichier. Une clé `composer.*` posée en SIBLING de `"common"` serait
 * INJOIGNABLE — c'est exactement le défaut que `lentille` a payé.
 *
 * Cette garde vérifie la PRÉSENCE dans les quatre JSON, jamais le rendu : la
 * signature `t(key, paramsOrFallback?: Record | string)` autorise un repli
 * inline, massivement utilisé dans le dépôt, qui rend l'anglais EN SILENCE. Un
 * écran vert ne prouve donc rien sur le catalogue.
 *
 * Le web est localisé en QUATRE langues. `lib/i18n.ts` accepte par ailleurs
 * `'zh'` sans catalogue correspondant : défaut antérieur, hors périmètre, et
 * surtout à NE PAS propager — aucune clé de ce lot n'est posée en `zh`.
 */

// Ce fichier est un MODULE, pas un script. Le modèle (`lentille-i18n-keys.test.ts`)
// n'importe rien et vit donc dans la portée globale de TypeScript, où il entre déjà
// en collision de déclaration avec `conversations-i18n-keys.test.ts` (`LOCALES`,
// `resolve`) — défaut antérieur, visible à `tsc --noEmit`, sans effet sur jest qui
// isole chaque suite. Reproduire ce modèle À LA LETTRE aurait ajouté trois erreurs
// de plus au même tas ; l'import ci-dessous referme la portée sans rien changer d'autre.
import { COMPOSER_FORMATS } from '@meeshy/shared/utils/composer-contract';

const LOCALES = ['en', 'fr', 'es', 'pt'] as const;

/** Reproduit l'extraction `loadTranslations` de `useI18n` : `data[ns] ?? data`. */
const scopeToNamespace = (data: Record<string, unknown>, namespace: string): Record<string, unknown> =>
  (namespace in data ? (data[namespace] as Record<string, unknown>) : data);

/** Reproduit la marche `key.split('.')` du `t()` de `useI18n`. */
const resolve = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === 'object' && segment in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);

const loadRawCommon = (locale: string): Record<string, unknown> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const data = require(`@/locales/${locale}/common.json`);
  return (data.default ?? data) as Record<string, unknown>;
};

const loadScopedCommon = (locale: string): Record<string, unknown> =>
  scopeToNamespace(loadRawCommon(locale), 'common');

/**
 * Les formats de la table des portes, DÉRIVÉS du contrat partagé — jamais
 * réécrits ici.
 *
 * Une liste recopiée à la main ne rougit pas le jour où un cinquième format
 * entre dans `ComposerFormat` : elle continue d'itérer sur quatre clés, les
 * quatre catalogues restent muets, et le défaut ne se découvre qu'à l'écran
 * (libellé brut dans les quatre langues). En partant de `COMPOSER_FORMATS`,
 * cette garde rougit d'elle-même tant que le format neuf n'a pas ses quatre
 * traductions.
 *
 * S'y ajoute le nom accessible du groupe : un `role="radiogroup"` sans nom est
 * muet au lecteur d'écran, et un `aria-label` anglais en dur serait la même
 * faute de localisation qu'un libellé visible.
 */
const FORMAT_KEYS = COMPOSER_FORMATS.map((format) => `composer.format.${format}`);

const COMPOSER_KEYS = [...FORMAT_KEYS, 'composer.format.groupLabel'];

/**
 * W3 — les deux messages de plafond média de la surface document. Le composer
 * hérité les portait EN DUR et EN ANGLAIS (`PostComposer.tsx:183` et `:200`) :
 * les absorber sans les localiser aurait gravé l'anglais dans un fichier neuf.
 *
 * Les deux interpolent : `{max}` pour le plafond, `{added}` pour le nombre
 * réellement retenu — la substitution de `useI18n` lit `/\{(\w+)\}/g`, donc un
 * marqueur mal orthographié resterait à l'écran tel quel.
 */
const MEDIA_KEYS = ['composer.media.limitReached', 'composer.media.limitPartial'] as const;

const ALL_COMPOSER_KEYS = [...COMPOSER_KEYS, ...MEDIA_KEYS];

/**
 * W4 — l'outil micro de `ComposerDocumentSurface`. Ces clés vivent sous
 * `postComposer`, siblings de `addPhoto`/`addVideo` (le mic est un outil de
 * PLUS dans la même rangée, pas un format) et de `mediaAlt`/`soundExtraction`
 * (même nesting `postComposer.audio.*`) — même portée `common` que
 * `ALL_COMPOSER_KEYS` ci-dessus, donc la même garde de résolution s'applique.
 */
const AUDIO_TOOL_KEYS = [
  'postComposer.addAudio',
  'postComposer.audio.start',
  'postComposer.audio.stop',
  'postComposer.audio.retry',
  'postComposer.audio.confirm',
  'postComposer.audio.error',
] as const;

describe("W2 — clés de l'éventail, joignables via useI18n('common')", () => {
  LOCALES.forEach((locale) => {
    const ns = loadScopedCommon(locale);

    ALL_COMPOSER_KEYS.forEach((key) => {
      it(`[${locale}] t('${key}') résout vers une chaîne non vide sous la portée réelle 'common'`, () => {
        const value = resolve(ns, key);
        expect(typeof value).toBe('string');
        expect((value as string).trim().length).toBeGreaterThan(0);
      });
    });
  });

  it('n\'expose PAS "composer" à la racine brute du fichier (le bloc aurait échappé à la portée "common")', () => {
    LOCALES.forEach((locale) => {
      expect(loadRawCommon(locale).composer).toBeUndefined();
    });
  });

  it('chaque format du contrat porte un libellé DISTINCT dans chaque locale', () => {
    LOCALES.forEach((locale) => {
      const ns = loadScopedCommon(locale);
      const labels = FORMAT_KEYS.map((key) => resolve(ns, key) as string);
      expect(new Set(labels).size).toBe(FORMAT_KEYS.length);
    });
  });

  it('la garde couvre TOUS les formats du contrat partagé — jamais une liste locale', () => {
    expect(FORMAT_KEYS).toHaveLength(COMPOSER_FORMATS.length);
    COMPOSER_FORMATS.forEach((format) => {
      expect(FORMAT_KEYS).toContain(`composer.format.${format}`);
    });
  });

  it('les deux messages de plafond média portent leurs marqueurs d’interpolation dans les quatre locales', () => {
    LOCALES.forEach((locale) => {
      const ns = loadScopedCommon(locale);
      expect(resolve(ns, 'composer.media.limitReached') as string).toContain('{max}');
      const partial = resolve(ns, 'composer.media.limitPartial') as string;
      expect(partial).toContain('{max}');
      expect(partial).toContain('{added}');
    });
  });
});

describe("W4 — les clés de l'outil micro, joignables via useI18n('common')", () => {
  LOCALES.forEach((locale) => {
    const ns = loadScopedCommon(locale);

    AUDIO_TOOL_KEYS.forEach((key) => {
      it(`[${locale}] t('${key}') résout vers une chaîne non vide sous la portée réelle 'common'`, () => {
        const value = resolve(ns, key);
        expect(typeof value).toBe('string');
        expect((value as string).trim().length).toBeGreaterThan(0);
      });
    });
  });

  it('les six libellés sont DISTINCTS dans chaque locale — un repli copié-collé se détecterait ici', () => {
    LOCALES.forEach((locale) => {
      const ns = loadScopedCommon(locale);
      const labels = AUDIO_TOOL_KEYS.map((key) => resolve(ns, key) as string);
      expect(new Set(labels).size).toBe(AUDIO_TOOL_KEYS.length);
    });
  });
});
