import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import { resolveConversationSections, type SectionableConversation } from '@meeshy/shared/utils/conversation-sections';

import { CONVERSATIONS } from '@/lib/api/fixtures';
import { FIXTURES_LOADED_AT, nextParisDayInstant } from '@/lib/api/fixtures-base';
import { applyFilter } from '@/lib/lens/filters';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { lensSectionLabel, resolveLensSections } from './sections';

type VectorConversation = {
  readonly id: string;
  readonly isPinned?: boolean;
  readonly categoryId?: string | null;
  readonly orderInCategory?: number | null;
  readonly lastMessageAt?: string | null;
  readonly updatedAt: string;
  readonly liveCall?: { readonly voices: number; readonly startedAt: string; readonly joined: boolean } | null;
};

type Vector = {
  readonly name: string;
  readonly input: {
    readonly conversations: readonly VectorConversation[];
    readonly categories: ReadonlyArray<{ readonly id: string }>;
    readonly now: string;
    readonly timeZone: string;
  };
  readonly expected: ReadonlyArray<{ readonly kind: string; readonly categoryId?: string; readonly ids: readonly string[] }>;
};

/**
 * T1.1 — LES 14 VECTEURS PARTAGÉS SE REJOUENT DEPUIS WEB-V3, exactement comme
 * `packages/shared/__tests__/vectors/sections.vectors.test.ts` — même
 * sémantique d'adaptateur (§1.1 de la spécification). Prouve que l'import
 * `@meeshy/shared/utils/conversation-sections` résout sous bun DANS ce
 * paquet, pas seulement dans `packages/shared`.
 */
/**
 * `@meeshy/shared` n'expose PAS `./fixtures/*` dans son `package.json`
 * (`exports`, vérifié avant d'écrire ce test — seuls `./types/*`, `./utils/*`,
 * `./api/*`, `./providers/*`, `./design/*`, `./encryption/*`, `./agent/*` le
 * sont) : le fichier est lu par CHEMIN, comme
 * `packages/shared/__tests__/vectors/sections.vectors.test.ts` le fait pour
 * lui-même — mais depuis un AUTRE paquet, le chemin traverse le monorepo. Ce
 * n'est PAS une jumelle : la loi elle-même (`resolveConversationSections`)
 * reste importée par son export public juste en dessous.
 */
const VECTORS_PATH = new URL(
  '../../../../../packages/shared/fixtures/reading-modes/sections.vectors.json',
  import.meta.url,
);

describe('les vecteurs partagés de sectionnement (rejoués depuis web-v2)', () => {
  const vectors = JSON.parse(readFileSync(VECTORS_PATH, 'utf8')) as readonly Vector[];
  test('au moins 14 vecteurs sont chargés', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(14);
  });

  for (const vector of vectors) {
    test(vector.name, () => {
      runVector(vector);
    });
  }

  function runVector(vector: Vector): void {
    const conversations: SectionableConversation[] = vector.input.conversations.map((c) => ({
      id: c.id,
      isPinned: c.isPinned ?? false,
      ...(c.categoryId === undefined ? {} : { categoryId: c.categoryId }),
      ...(c.orderInCategory === undefined ? {} : { orderInCategory: c.orderInCategory }),
      ...(c.lastMessageAt === undefined ? {} : { lastMessageAt: c.lastMessageAt === null ? null : new Date(c.lastMessageAt) }),
      updatedAt: new Date(c.updatedAt),
      ...(c.liveCall === undefined
        ? {}
        : {
            liveCall:
              c.liveCall === null
                ? null
                : { voices: c.liveCall.voices, startedAt: c.liveCall.startedAt, joined: c.liveCall.joined },
          }),
    }));

    const result = resolveConversationSections({
      conversations,
      categories: vector.input.categories,
      now: new Date(vector.input.now),
      locale: 'en-US',
      timeZone: vector.input.timeZone,
    });

    const actual = result.map((section) =>
      section.kind === 'category'
        ? { kind: section.kind, categoryId: section.categoryId, ids: section.conversations.map((c) => c.id) }
        : { kind: section.kind, ids: section.conversations.map((c) => c.id) },
    );

    expect(actual).toEqual(vector.expected);
  }
});

describe('resolveLensSections — sur les fixtures web-v2', () => {
  /**
   * `FIXTURES_LOADED_AT` plutôt qu'un second `new Date()` (#5797) : le fil
   * « Équipe déploiement » (`THREAD_ANCHOR`, `fixtures-base.ts`) est ancré
   * sur ce MÊME instant — un `new Date()` propre à ce test dérivait, entre
   * le chargement du module `fixtures.ts` et l'exécution de ce test, à la
   * traversée d'un minuit parisien, faisant flaker
   * « AUJOURD'HUI contient c-deploiement » sans aucun changement de code.
   */
  const now = FIXTURES_LOADED_AT;
  const timeZone = 'Europe/Paris';

  function sections() {
    const visible = applyFilter({ conversations: CONVERSATIONS, selection: ['all'], search: '', viewerId: 'u-viewer', overrides: {} });
    return resolveLensSections({ conversations: visible, overrides: {}, now, timeZone });
  }

  test('ÉPINGLES vient en tête, avec c-amina dedans', () => {
    const s = sections();
    expect(s[0]?.id).toBe('pinned');
    expect(s[0]?.conversations.map((c) => c.id)).toContain('c-amina');
  });

  test("AUJOURD'HUI contient c-deploiement (lastMessageAt = maintenant)", () => {
    const s = sections();
    const today = s.find((section) => section.id === 'lentille.today');
    expect(today?.conversations.map((c) => c.id)).toContain('c-deploiement');
  });

  test('c-amina, épinglée, ne réapparaît PAS dans une section temporelle', () => {
    const s = sections();
    const temporal = s.filter((section) => section.id !== 'pinned');
    for (const section of temporal) {
      expect(section.conversations.map((c) => c.id)).not.toContain('c-amina');
    }
  });

  test('c-kwame (archivée) est ABSENTE de toutes les sections — le filtre "all" l’a déjà exclue', () => {
    const s = sections();
    const ids = s.flatMap((section) => section.conversations.map((c) => c.id));
    expect(ids).not.toContain('c-kwame');
  });

  /**
   * `c-nouvelle` porte désormais un `lastMessageAt` réel (#5694, correction
   * défaut 1 — la valeur que la passerelle sert TOUJOURS, `schema.prisma:495`
   * `DateTime @default(now())`, jamais un champ absent). Le repli sur
   * `updatedAt` d'une conversation SANS `lastMessageAt` reste couvert par les
   * 14 vecteurs partagés rejoués plus haut dans ce fichier — inutile de le
   * refabriquer ici avec un corpus qui ne peut pas exister sur le wire.
   */
  test('c-nouvelle (lastMessageAt = il y a 3 jours, aucun message envoyé) tombe dans "cette semaine"', () => {
    const s = sections();
    const thisWeek = s.find((section) => section.id === 'lentille.thisWeek');
    expect(thisWeek?.conversations.map((c) => c.id)).toContain('c-nouvelle');
  });

  test('partition sans perte : union des sections = corpus filtré, sans doublon', () => {
    const visible = applyFilter({ conversations: CONVERSATIONS, selection: ['all'], search: '', viewerId: 'u-viewer', overrides: {} });
    const s = resolveLensSections({ conversations: visible, overrides: {}, now, timeZone });
    const ids = s.flatMap((section) => section.conversations.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(visible.map((c) => c.id)));
  });

  test('un témoin de RANG temporel autre que le premier : "now" avancé d’un jour parisien range le jour courant en "hier"', () => {
    const visible = applyFilter({ conversations: CONVERSATIONS, selection: ['all'], search: '', viewerId: 'u-viewer', overrides: {} });
    const laterNow = nextParisDayInstant(now);
    const s = resolveLensSections({ conversations: visible, overrides: {}, now: laterNow, timeZone });
    const yesterday = s.find((section) => section.id === 'lentille.yesterday');
    expect(yesterday?.conversations.map((c) => c.id)).toContain('c-deploiement');
  });

  test("l'override optimiste entre dans la loi : épingler localement fait migrer vers ÉPINGLES", () => {
    const visible = applyFilter({ conversations: CONVERSATIONS, selection: ['all'], search: '', viewerId: 'u-viewer', overrides: {} });
    const s = resolveLensSections({
      conversations: visible,
      overrides: { 'c-deploiement': { flags: { isPinned: true } } },
      now,
      timeZone,
    });
    expect(s[0]?.id).toBe('pinned');
    expect(s[0]?.conversations.map((c) => c.id)).toEqual(['c-deploiement', 'c-amina']);
  });
});

describe('lensSectionLabel — casse NORMALE, jamais de majuscules dans la donnée', () => {
  const labels = [
    ['pinned', 'Épingles'],
    ['lentille.live', 'En direct'],
    ['lentille.today', "Aujourd'hui"],
    ['lentille.yesterday', 'Hier'],
    ['lentille.thisWeek', 'Cette semaine'],
    ['lentille.older', 'Plus ancien'],
  ] as const;
  for (const [id, label] of labels) {
    test(`${id} → ${label}`, () => {
      expect(lensSectionLabel({ id }, 'fr')).toBe(label);
      expect(lensSectionLabel({ id }, 'fr')).not.toBe(label.toUpperCase());
    });
  }

  /**
   * LE VOCABULAIRE D'iOS, DANS LES SEPT LANGUES (#10103) — `lentille.section.*`
   * (`apps/ios/Meeshy/Localizable.xcstrings`), mot pour mot : la même section
   * porte le même nom sur les deux plateformes, quelle que soit la langue.
   */
  const IOS_VOCABULARY: Readonly<Record<InterfaceLanguage, readonly [string, string, string, string, string]>> = {
    fr: ['En direct', "Aujourd'hui", 'Hier', 'Cette semaine', 'Plus ancien'],
    en: ['Live', 'Today', 'Yesterday', 'This week', 'Older'],
    es: ['En directo', 'Hoy', 'Ayer', 'Esta semana', 'Más antiguo'],
    pt: ['Ao vivo', 'Hoje', 'Ontem', 'Esta semana', 'Mais antigo'],
    de: ['Live', 'Heute', 'Gestern', 'Diese Woche', 'Älter'],
    it: ['In diretta', 'Oggi', 'Ieri', 'Questa settimana', 'Meno recenti'],
    ar: ['مباشر', 'اليوم', 'أمس', 'هذا الأسبوع', 'أقدم'],
  };
  for (const [language, words] of Object.entries(IOS_VOCABULARY) as [InterfaceLanguage, readonly string[]][]) {
    test(`${language} : les sections virtuelles parlent comme iOS`, async () => {
      await loadInterfaceCatalog(language);
      const ids = ['lentille.live', 'lentille.today', 'lentille.yesterday', 'lentille.thisWeek', 'lentille.older'] as const;
      expect(ids.map((id) => lensSectionLabel({ id }, language))).toEqual([...words]);
      expect(lensSectionLabel({ id: 'pinned' }, language)).not.toContain('{');
    });
  }

  test('une catégorie porte le nom que l’utilisateur lui a donné, dans toutes les langues', async () => {
    await loadInterfaceCatalog('ar');
    const section = { id: 'category:cat-1', category: { name: 'Travail' } } as const;
    expect(lensSectionLabel(section, 'fr')).toBe('Travail');
    expect(lensSectionLabel(section, 'ar')).toBe('Travail');
  });
});

describe('resolveLensSections — les catégories de l’utilisateur (#10103)', () => {
  const now = FIXTURES_LOADED_AT;
  const timeZone = 'Europe/Paris';
  const visible = () => applyFilter({ conversations: CONVERSATIONS, selection: ['all'], search: '', viewerId: 'u-viewer', overrides: {} });
  const categories = [
    { id: 'cat-travail', name: 'Travail', isExpanded: true },
    { id: 'cat-proches', name: 'Proches', isExpanded: false },
  ] as const;

  test('chaque catégorie devient une section, APRÈS Épingles et AVANT Aujourd’hui, dans l’ordre DÉCLARÉ', () => {
    const s = resolveLensSections({ conversations: visible(), overrides: {}, categories, now, timeZone });
    const ids = s.map((section) => section.id);
    expect(ids.slice(0, 3)).toEqual(['pinned', 'category:cat-travail', 'category:cat-proches']);
    expect(ids.indexOf('category:cat-proches')).toBeLessThan(ids.indexOf('lentille.today'));
  });

  test('la section porte la catégorie (nom, état déplié servi) et ses conversations rangées', () => {
    const s = resolveLensSections({ conversations: visible(), overrides: {}, categories, now, timeZone });
    const travail = s.find((section) => section.id === 'category:cat-travail');
    expect(travail?.category).toEqual({ id: 'cat-travail', name: 'Travail', isExpanded: true });
    expect(travail?.conversations.map((c) => c.id)).toEqual(['c-annonces', 'c-page-01']);
    const proches = s.find((section) => section.id === 'category:cat-proches');
    expect(proches?.category?.isExpanded).toBe(false);
    expect(proches?.conversations.map((c) => c.id)).toEqual(['c-page-02', 'c-page-03']);
  });

  test('une conversation rangée ne réapparaît dans AUCUNE section par date', () => {
    const s = resolveLensSections({ conversations: visible(), overrides: {}, categories, now, timeZone });
    const temporal = s.filter((section) => section.id.startsWith('lentille.')).flatMap((section) => section.conversations.map((c) => c.id));
    expect(temporal).not.toContain('c-annonces');
    expect(temporal).not.toContain('c-page-01');
  });

  test('sans catégorie déclarée (compte qui n’en a pas, ou pas encore chargées), les conversations rangées tombent par date', () => {
    const s = resolveLensSections({ conversations: visible(), overrides: {}, now, timeZone });
    expect(s.some((section) => section.id.startsWith('category:'))).toBe(false);
    const yesterdayOrWeek = s.filter((section) => section.id.startsWith('lentille.')).flatMap((section) => section.conversations.map((c) => c.id));
    expect(yesterdayOrWeek).toContain('c-annonces');
  });

  test('une catégorie sans conversation chargée n’ouvre aucune section vide', () => {
    const s = resolveLensSections({
      conversations: visible(),
      overrides: {},
      categories: [...categories, { id: 'cat-vide', name: 'Vide', isExpanded: true }],
      now,
      timeZone,
    });
    expect(s.some((section) => section.id === 'category:cat-vide')).toBe(false);
  });

  test('épinglée PRIME sur catégorie : épingler une conversation rangée la fait monter dans Épingles', () => {
    const s = resolveLensSections({
      conversations: visible(),
      overrides: { 'c-annonces': { flags: { isPinned: true } } },
      categories,
      now,
      timeZone,
    });
    expect(s[0]?.conversations.map((c) => c.id)).toContain('c-annonces');
    expect(s.find((section) => section.id === 'category:cat-travail')?.conversations.map((c) => c.id)).toEqual(['c-page-01']);
  });

  test('partition sans perte, catégories comprises', () => {
    const shown = visible();
    const s = resolveLensSections({ conversations: shown, overrides: {}, categories, now, timeZone });
    const ids = s.flatMap((section) => section.conversations.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(shown.map((c) => c.id)));
  });
});
