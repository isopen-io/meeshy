// packages/shared/__tests__/ci/lentille-tokens-consumption-gate.test.ts
//
// R-b (réserve tracée Porte V1, `tasks/lentille-workshop-execution.md` §8) :
// « garde d'ensemble des tokens manquante — personne ne vérifie "token
// déclaré dans lentille-tokens.json ⇒ token consommé" ». Re-preuve : ni
// `apps/web/__tests__/styles/lentille-tokens.parity.test.ts` (JSON ⇔ CSS var
// VALEUR, jamais usage réel — `lentille-tokens.css` se documente lui-même
// « NOT imported anywhere by default … this file is inert ») ni
// `LentilleMetricsTests`/`FocalMetricsTests` (JSON ⇔ constante Swift VALEUR,
// même angle mort) ne prouvent qu'un token est CONSOMMÉ par une vue réelle.
// Ce fichier ferme ce trou : chaque FAMILLE de token (`list.<x>` /
// `thread.<x>` / `river.<x>` depuis R-131, le regroupement à la profondeur où
// vivent les enums Swift et les blocs de commentaires CSS) doit avoir au
// moins un consommateur RÉEL — Swift (référence au symbole
// `LentilleMetrics.<X>`/`FocalMetrics.<X>`/`RiverMetrics.<X>` hors définition
// et hors tests) OU CSS (variable `--lentille-<section>-<x>` utilisée hors le
// fichier de déclaration `lentille-tokens.css` et hors tests) — sinon
// figurer, datée et attribuée, dans `EXCLUDED_DEAD_FAMILIES` ci-dessous.
//
// **`river` (R-131/R-133)** — section ajoutée avec son premier consommateur
// DANS LE MÊME lot : `RiverMetrics.swift` (miroir Swift, comme
// `LentilleMetrics`/`FocalMetrics`) et la peau `Riviere/View/` qui le
// consomme (`RiverBubbleView`, `RiverLaneCanvas`, `RiverLaneHeaderStrip`) —
// c'est cette garde-ci qui interdirait de livrer les tokens SANS peau
// (« token déclaré ⇒ token consommé », cf. workshop §7bis/§7ter « Reste à
// faire »).
//
// **Placement.** Comme `ios-pr-compile-gate.test.ts` (même dossier) : ce
// garde lit des fichiers HORS `packages/shared` (l'app iOS, l'app web) —
// `packages/shared` est le paquet qui tourne sur CHAQUE PR (`ci.yml`), donc
// le seul point d'observation commun aux deux plateformes pour une garde
// transverse comme celle-ci.
//
// **Granularité « famille », pas « feuille ».** REV-4 a formulé ses trois
// tokens suspects par FAMILLE avec joker (`--lentille-list-tags-*`,
// `--lentille-thread-hidden-chrome-*`) ou par feuille unique quand la
// famille n'en a qu'une (`--lentille-list-muted-opacity`) — même grain que
// les enums Swift (`LentilleMetrics.Tags`, `FocalMetrics.HiddenChrome`) et
// les blocs `/* list.tags */` du CSS généré. Vérifier feuille par feuille
// aurait produit une garde illisible sans rien prouver de plus : un
// consommateur qui lit `LentilleMetrics.Tags.size` consomme la FAMILLE
// `tags`, pas la seule feuille `size`.
//
// **Correspondance JSON → symbole Swift NON mécanique.** La plupart des
// familles se retrouvent capitalisées telles quelles (`row` →
// `LentilleMetrics.Row`), mais `thread.line2` mappe à `FocalMetrics.Text`
// (choix de nommage documenté dans `FocalMetrics.swift`, mark « Texte du
// message ») — une dérivation automatique par simple mise en capitale
// aurait raté ce cas et fait un FAUX NÉGATIF. `SWIFT_SYMBOL_BY_FAMILY`
// ci-dessous est donc une table EXPLICITE, curatée à la main contre les
// commentaires de tête de chaque `enum` imbriqué des deux fichiers
// `*Metrics.swift` — jamais dérivée. `test_everyJsonFamily_hasAMappingEntry`
// (leçon 257) échoue bruyamment si une famille future manque à l'appel.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const TOKENS_JSON_PATH = join(REPO_ROOT, 'packages/shared/design/lentille-tokens.json');

const IOS_APP_ROOT = join(REPO_ROOT, 'apps/ios/Meeshy');
const WEB_APP_ROOT = join(REPO_ROOT, 'apps/web');

// Fichiers de DÉFINITION des miroirs Swift — une référence qualifiée
// `LentilleMetrics.Row` n'y apparaît jamais (en interne, l'enum s'écrit
// `Row`, pas `LentilleMetrics.Row`), mais on les exclut explicitement de
// toute façon : un futur refactor qui les ferait s'auto-référencer ne doit
// jamais compter comme un « consommateur ».
const IOS_DEFINITION_FILES = [
  'Features/Main/Lentille/Core/LentilleMetrics.swift',
  'Features/Main/Focal/Core/FocalMetrics.swift',
  'Features/Main/Riviere/Core/RiverMetrics.swift',
].map((p) => join(IOS_APP_ROOT, p));

// Fichier de déclaration CSS — se documente lui-même comme inerte/non
// importé (`apps/web/styles/lentille-tokens.css`, en-tête). Une variable qui
// n'apparaît QUE là n'est pas consommée, elle est seulement DÉCLARÉE.
const WEB_DECLARATION_FILE = join(WEB_APP_ROOT, 'styles/lentille-tokens.css');

// ---------------------------------------------------------------------------
// 1. Aplatir lentille-tokens.json en familles `<section>.<family>`
// ---------------------------------------------------------------------------

type TokenJson = Record<string, unknown>;

function loadTokensJson(): TokenJson {
  const raw = readFileSync(TOKENS_JSON_PATH, 'utf8');
  return JSON.parse(raw) as TokenJson;
}

type TokenSection = 'list' | 'thread' | 'river';

/** Familles = clés de profondeur 1 sous `list`/`thread`/`river` (`$source` exclu). */
function families(section: TokenSection, tokens: TokenJson): string[] {
  const node = tokens[section];
  if (typeof node !== 'object' || node === null) {
    throw new Error(`lentille-tokens.json : section « ${section} » absente ou non-objet.`);
  }
  return Object.keys(node as TokenJson).filter((k) => k !== '$source');
}

// ---------------------------------------------------------------------------
// 2. Table EXPLICITE JSON-famille → symbole Swift (voir note de tête)
// ---------------------------------------------------------------------------

const SWIFT_SYMBOL_BY_FAMILY: Record<string, string> = {
  'list.row': 'LentilleMetrics.Row',
  'list.avatar': 'LentilleMetrics.Avatar',
  'list.presenceDot': 'LentilleMetrics.PresenceDot',
  'list.name': 'LentilleMetrics.Name',
  'list.time': 'LentilleMetrics.Time',
  'list.line2': 'LentilleMetrics.Line2',
  'list.unreadDot': 'LentilleMetrics.UnreadDot',
  'list.focusCard': 'LentilleMetrics.FocusCard',
  'list.modeNotch': 'LentilleMetrics.ModeNotch',
  'list.sticker': 'LentilleMetrics.Sticker',
  'list.pill': 'LentilleMetrics.Pill',
  'list.rail': 'LentilleMetrics.Rail',
  'list.tags': 'LentilleMetrics.Tags',
  'list.muted': 'LentilleMetrics.Muted',
  'list.agent': 'LentilleMetrics.Agent',
  'thread.row': 'FocalMetrics.Row',
  'thread.avatar': 'FocalMetrics.Avatar',
  'thread.name': 'FocalMetrics.Name',
  'thread.time': 'FocalMetrics.Time',
  // Nommage volontairement différent de la clé JSON — voir note de tête.
  'thread.line2': 'FocalMetrics.Text',
  'thread.focusCard': 'FocalMetrics.FocusCard',
  'thread.quote': 'FocalMetrics.Quote',
  'thread.media': 'FocalMetrics.Media',
  'thread.hiddenChrome': 'FocalMetrics.HiddenChrome',
  'thread.pill': 'FocalMetrics.Pill',
  'thread.agent': 'FocalMetrics.Agent',
  // R-131 — `RiverMetrics.swift`, même patron nommé (miroir 1:1 des clés
  // JSON, aucun renommage comme `thread.line2` → `FocalMetrics.Text`).
  'river.line': 'RiverMetrics.Line',
  'river.lane': 'RiverMetrics.Lane',
  'river.bubble': 'RiverMetrics.Bubble',
  'river.connector': 'RiverMetrics.Connector',
  'river.row': 'RiverMetrics.Row',
  'river.laneHeader': 'RiverMetrics.LaneHeader',
};

/** camelCase → kebab-case (même règle que `apps/web/styles/lentille-tokens.css`, en-tête). */
function toKebab(family: string): string {
  return family.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function cssVarPrefix(section: TokenSection, family: string): string {
  return `--lentille-${section}-${toKebab(family)}`;
}

// ---------------------------------------------------------------------------
// 3. Exclusions EXPLICITES, DATÉES, ATTRIBUÉES — tokens morts DES DEUX côtés
// ---------------------------------------------------------------------------
//
// Chaque entrée a été re-prouvée CÔTÉ iOS (pas seulement web, où
// `lentille-tokens.css` est intégralement inerte à ce jour — donc TOUTE
// famille y est actuellement « morte côté web », ce qui rendrait cette liste
// inutile si elle ne re-prouvait que le web). La preuve iOS : grep de
// `LentilleMetrics.<X>` / `FocalMetrics.<X>` sur `apps/ios/Meeshy` HORS
// fichiers de définition et HORS `MeeshyTests` — zéro site dans les DEUX cas
// pour les deux familles ci-dessous (2026-08-16).
//
// `list.tags` et `list.muted` (les deux AUTRES tokens que REV-4 soupçonnait
// morts côté web, avec `thread.hiddenChrome`) ont été VÉRIFIÉS VIVANTS côté
// iOS lors de cette re-preuve — `LentilleMetrics.Tags` (tags/favori de rang,
// `LentilleConversationRow.swift`, `StoriesVivantsRail.swift`) et
// `LentilleMetrics.Muted` (opacité de sourdine, `LentilleConversationRow.swift`)
// sont bien consommés. Ils NE FIGURENT PAS ici — la garde les couvre par le
// chemin normal (consommateur iOS trouvé).
//
// **`thread.hiddenChrome` a rejoint ce cas le 2026-08-16, quelques heures
// après avoir été exclue** : WS-6, le propriétaire annoncé, a branché le
// token — `FocalMetrics.HiddenChrome.easeOut` cadence désormais la
// disparition du header entier dans `ConversationView.swift`
// (`.animation(.easeOut(duration:), value: hidesEntireHeaderForScroll)`).
// Son entrée a donc été retirée, exactement comme le message d'échec de
// `it.each` le demande. C'est le premier passage de cette garde du côté
// « l'exclusion est devenue périmée », et il valide sa raison d'être : sans
// ce contre-test, l'exclusion aurait survécu à sa cause et couvert un
// retrait futur du consommateur en silence.
interface DeadFamilyExclusion {
  readonly family: string;
  readonly since: string;
  readonly owner: string;
  readonly reason: string;
}

// SECOND passage du côté « l'exclusion est devenue périmée » (réconciliation
// V4bis, 2026-08-17) : `list.presenceDot` était exclue le 2026-08-16 au motif
// « morte des DEUX côtés — CSS intégralement inerte à ce jour ». La branche web
// V4 (WL-102) a depuis branché le dot de présence de la rangée Lentille sur
// `--lentille-list-presence-dot-size` / `-border-size`
// (`apps/web/components/conversations/lentille/LentilleRow.tsx`). Le motif
// tombe donc côté CSS ; l'entrée est retirée, exactement comme le message
// d'échec de `it.each` le demande. Le côté Swift reste sur la géométrie propre
// de `MeeshyAvatar.onlineDot` — sans conséquence pour cette garde, qui exige UN
// consommateur réel, Swift OU CSS.
const EXCLUDED_DEAD_FAMILIES: readonly DeadFamilyExclusion[] = [
  {
    family: 'list.agent',
    since: '2026-08-16',
    owner: 'Fable — orchestrateur Lentille (dépend de agent_grammar, cf. réserve R-e)',
    reason:
      'LentilleMetrics.Agent.avatarRingWidth (anneau pointillé 1.5, avatar agent ✦) est ' +
      'mirroré et testé pour la parité JSON, mais aucune vue Lentille ne le consomme : les ' +
      'surfaces agent restent un stub (`agent_grammar` OFF — contrat Focal WS-10, notes REV-3 ' +
      'de la ligne V3). Mort des deux côtés. Attend le même chantier que la réserve R-e ' +
      '(drapeau agent_grammar orphelin), hors périmètre de ce lot.',
  },
];

const excludedFamilySet = new Set(EXCLUDED_DEAD_FAMILIES.map((e) => e.family));

// ---------------------------------------------------------------------------
// 4. Scan de source — Swift (iOS) et CSS/TS/TSX (web)
// ---------------------------------------------------------------------------

const IGNORED_DIR_NAMES = new Set(['node_modules', '.next', 'dist', 'build', '.git', 'DerivedData']);

/** Marche récursive, retourne les chemins de fichiers dont le nom matche `extensionPattern`. */
function collectFiles(root: string, extensionPattern: RegExp, excludePathSubstrings: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORED_DIR_NAMES.has(entry)) continue;
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (extensionPattern.test(entry)) {
        if (excludePathSubstrings.some((s) => full.includes(s))) continue;
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

// Seuls les deux fichiers de définition sont retirés — le filtre « hors
// tests » n'a rien de plus à faire : `MeeshyTests` vit hors `apps/ios/Meeshy`
// (racine `apps/ios/MeeshyTests`), donc déjà hors de `IOS_APP_ROOT`.
const IOS_PRODUCTION_SWIFT_FILES = collectFiles(IOS_APP_ROOT, /\.swift$/, []).filter(
  (f) => !IOS_DEFINITION_FILES.includes(f),
);

const webSourceFiles = collectFiles(WEB_APP_ROOT, /\.(css|scss|ts|tsx)$/, [
  '__tests__',
  '.test.',
  WEB_DECLARATION_FILE,
]);

interface Consumers {
  readonly iosFiles: string[];
  readonly webFiles: string[];
}

const fileContentCache = new Map<string, string>();
function readCached(path: string): string {
  let content = fileContentCache.get(path);
  if (content === undefined) {
    content = readFileSync(path, 'utf8');
    fileContentCache.set(path, content);
  }
  return content;
}

function findConsumers(section: TokenSection, family: string): Consumers {
  const swiftSymbol = SWIFT_SYMBOL_BY_FAMILY[`${section}.${family}`];
  const swiftPattern = swiftSymbol
    ? new RegExp(`\\b${swiftSymbol.replace('.', '\\.')}\\b`)
    : null;
  const cssPrefix = cssVarPrefix(section, family);

  const iosFiles = swiftPattern
    ? IOS_PRODUCTION_SWIFT_FILES.filter((f) => swiftPattern.test(readCached(f)))
    : [];
  const webFiles = webSourceFiles.filter((f) => readCached(f).includes(cssPrefix));

  return { iosFiles, webFiles };
}

// ---------------------------------------------------------------------------
// 5. Les tests
// ---------------------------------------------------------------------------

describe('Garde d\'ensemble des tokens Lentille (R-b) — déclaré ⇒ consommé', () => {
  const tokens = loadTokensJson();
  const allFamilies: Array<{ section: TokenSection; family: string }> = [
    ...families('list', tokens).map((family) => ({ section: 'list' as const, family })),
    ...families('thread', tokens).map((family) => ({ section: 'thread' as const, family })),
    ...families('river', tokens).map((family) => ({ section: 'river' as const, family })),
  ];

  // Leçon 257 : une garde qui scanne zéro famille, zéro fichier Swift ou
  // zéro fichier web passe toujours au vert sans avoir rien vérifié.
  it('découvre au moins une famille de tokens dans chaque section (jamais zéro)', () => {
    expect(families('list', tokens).length).toBeGreaterThan(0);
    expect(families('thread', tokens).length).toBeGreaterThan(0);
    expect(families('river', tokens).length).toBeGreaterThan(0);
    expect(allFamilies.length).toBeGreaterThan(0);
  });

  it('découvre des fichiers Swift ET des fichiers web à scanner (jamais zéro)', () => {
    expect(IOS_PRODUCTION_SWIFT_FILES.length).toBeGreaterThan(0);
    expect(webSourceFiles.length).toBeGreaterThan(0);
  });

  it('chaque famille JSON a une entrée dans SWIFT_SYMBOL_BY_FAMILY (leçon 257)', () => {
    const missing = allFamilies
      .map(({ section, family }) => `${section}.${family}`)
      .filter((key) => !(key in SWIFT_SYMBOL_BY_FAMILY));

    expect(
      missing,
      `Famille(s) de tokens sans correspondance Swift déclarée : ${missing.join(', ')}. ` +
        'Ajouter une entrée à SWIFT_SYMBOL_BY_FAMILY (jamais dériver automatiquement — voir ' +
        'note de tête sur thread.line2 → FocalMetrics.Text).',
    ).toEqual([]);
  });

  /// Sens SYMÉTRIQUE, qui manquait : la garde ci-dessus ne teste que
  /// JSON → table. Une famille supprimée du JSON laissait donc une entrée
  /// PÉRIMÉE dans la table, en silence — exactement le motif « ligne d'audit
  /// périmée » que ce dépôt combat ailleurs. Constaté le 2026-08-23 en
  /// retirant `list.previewBubble` et `list.members`.
  it('SWIFT_SYMBOL_BY_FAMILY ne garde aucune entrée orpheline (sens table → JSON)', () => {
    const declared = new Set(allFamilies.map(({ section, family }) => `${section}.${family}`));
    const orphaned = Object.keys(SWIFT_SYMBOL_BY_FAMILY).filter((key) => !declared.has(key));

    expect(
      orphaned,
      `Entrée(s) de SWIFT_SYMBOL_BY_FAMILY sans famille correspondante dans ` +
        `lentille-tokens.json : ${orphaned.join(', ')}. La famille a été supprimée — ` +
        'supprimer la ligne avec elle.',
    ).toEqual([]);
  });

  it('les deux fichiers de définition Swift existent bien (chemins non périmés)', () => {
    for (const path of IOS_DEFINITION_FILES) {
      expect(() => readFileSync(path, 'utf8'), `fichier introuvable : ${path}`).not.toThrow();
    }
  });

  it('le fichier de déclaration CSS existe bien (chemin non périmé)', () => {
    expect(() => readFileSync(WEB_DECLARATION_FILE, 'utf8')).not.toThrow();
  });

  // --- Le garde central --------------------------------------------------

  it('chaque token déclaré a un consommateur réel OU figure dans EXCLUDED_DEAD_FAMILIES', () => {
    const unexplainedDead: string[] = [];

    for (const { section, family } of allFamilies) {
      const key = `${section}.${family}`;
      const { iosFiles, webFiles } = findConsumers(section, family);
      const isConsumed = iosFiles.length > 0 || webFiles.length > 0;
      const isExcused = excludedFamilySet.has(key);

      if (!isConsumed && !isExcused) {
        unexplainedDead.push(key);
      }
    }

    expect(
      unexplainedDead,
      `Token(s) déclaré(s) dans lentille-tokens.json SANS consommateur réel (ni Swift, ni CSS) ` +
        `et SANS exclusion documentée : ${unexplainedDead.join(', ')}. Brancher un consommateur, ` +
        'ou ajouter une entrée datée + attribuée à EXCLUDED_DEAD_FAMILIES (R-b).',
    ).toEqual([]);
  });

  // --- La liste d'exclusions reste honnête --------------------------------

  it.each(EXCLUDED_DEAD_FAMILIES)(
    'exclusion « $family » : toujours réellement morte des deux côtés (sinon retirer l\'entrée)',
    ({ family }) => {
      const [section, familyName] = family.split('.') as [TokenSection, string];
      const { iosFiles, webFiles } = findConsumers(section, familyName);

      expect(
        iosFiles,
        `« ${family} » a maintenant un consommateur Swift RÉEL (${iosFiles.join(', ')}) — ` +
          'retirer cette entrée de EXCLUDED_DEAD_FAMILIES plutôt que de laisser une exclusion périmée.',
      ).toEqual([]);
      expect(
        webFiles,
        `« ${family} » a maintenant un consommateur CSS RÉEL (${webFiles.join(', ')}) — ` +
          'retirer cette entrée de EXCLUDED_DEAD_FAMILIES plutôt que de laisser une exclusion périmée.',
      ).toEqual([]);
    },
  );

  it('chaque exclusion a une date et un porteur non vides', () => {
    for (const exclusion of EXCLUDED_DEAD_FAMILIES) {
      expect(exclusion.since, `exclusion « ${exclusion.family} » sans date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(exclusion.owner.trim().length, `exclusion « ${exclusion.family} » sans porteur`).toBeGreaterThan(0);
      expect(exclusion.reason.trim().length, `exclusion « ${exclusion.family} » sans motif`).toBeGreaterThan(20);
    }
  });

  it('EXCLUDED_DEAD_FAMILIES ne cite que des familles qui existent réellement dans le JSON', () => {
    const known = new Set(allFamilies.map(({ section, family }) => `${section}.${family}`));
    for (const exclusion of EXCLUDED_DEAD_FAMILIES) {
      expect(known.has(exclusion.family), `« ${exclusion.family} » n'existe pas dans lentille-tokens.json`).toBe(true);
    }
  });
});
