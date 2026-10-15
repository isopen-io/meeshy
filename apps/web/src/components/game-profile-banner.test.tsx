import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES as INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AVATAR_CLEARANCE, GameProfileBanner, type BannerStanding } from './game-profile-banner';

/**
 * LE JEU SUR LA BANNIÈRE DU PROFIL (#10231, précision porteur 2026-10-11) —
 * « les détails de points à gauche de la bannière et le reste de rang à
 * droite ». Au DÉBUT (gauche, droite en RTL) : le cercle de niveau, le nom du
 * niveau au-dessus, ses points et ce qu'il reste vers le suivant ; à la FIN :
 * le blason, le rang et sa division dessous. Un libellé par groupe.
 */
/** La langue de l'interface se lit sur `<html lang>` : on la pose là, sans rien persister. */
const setInterfaceLanguage = (language: InterfaceLanguage): void => {
  document.documentElement.lang = language;
};

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all(INTERFACE_LANGUAGES.map((language) => loadGameCatalog(language)));
  setInterfaceLanguage('fr');
});
afterEach(unmountAll);
afterAll(async () => {
  setInterfaceLanguage('fr');
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const standing = (over: Partial<BannerStanding> = {}): BannerStanding => ({
  level: 12,
  tier: 'etincelle',
  prestige: 0,
  progress: 0.61,
  points: 976,
  pointsToNext: 624,
  rank: 'murmure',
  division: 5,
  mythic: null,
  ...over,
});

const words = (node: Element | null | undefined): string => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
const styleOf = (node: Element | null | undefined): string => node?.getAttribute('style') ?? '';

describe('le niveau et ses points au début de la bannière', () => {
  test('le nom du niveau, le cercle, les points acquis et le reste vers le suivant', async () => {
    const host = await mount(<GameProfileBanner standing={standing()} />);
    const start = host.querySelector('[data-profile-banner-level]');
    expect(words(start?.querySelector('[data-profile-banner-level-name]'))).toBe('Étincelle');
    expect(start?.querySelector('[data-game-level="12"]') !== null).toBe(true);
    expect(words(start?.querySelector('[data-profile-banner-points]'))).toBe('976 pts');
    expect(words(start?.querySelector('[data-profile-banner-missing]'))).toBe('encore 624 vers le 13');
  });

  test('il s’ancre au DÉBUT (gauche, droite en RTL), le rang à la FIN', async () => {
    const host = await mount(<GameProfileBanner standing={standing()} />);
    const band = host.querySelector('[data-profile-banner-game]');
    const groups = [...(band?.children ?? [])].map((child) => [...child.attributes].map((a) => a.name).find((name) => name.startsWith('data-profile-banner-')));
    expect(groups).toEqual(['data-profile-banner-level', 'data-profile-banner-rank']);
    expect(styleOf(band)).toContain('inset-inline-start');
    expect(styleOf(band)).toContain('inset-inline-end');
    expect(styleOf(band)).not.toMatch(/(^|[^-])(left|right)\s*:/);
  });

  test('sans points servis : ni total ni reste, jamais un zéro', async () => {
    const host = await mount(<GameProfileBanner standing={standing({ points: null, pointsToNext: null, progress: null })} />);
    expect(host.querySelector('[data-profile-banner-points]') === null).toBe(true);
    expect(host.querySelector('[data-profile-banner-missing]') === null).toBe(true);
    expect(words(host.querySelector('[data-profile-banner-level-name]'))).toBe('Étincelle');
  });

  test('au plafond : le total reste, le reste disparaît', async () => {
    const host = await mount(<GameProfileBanner standing={standing({ pointsToNext: null, progress: 1 })} />);
    expect(words(host.querySelector('[data-profile-banner-points]'))).toBe('976 pts');
    expect(host.querySelector('[data-profile-banner-missing]') === null).toBe(true);
  });
});

describe('le rang à la fin de la bannière', () => {
  test('le blason, puis le nom du rang AVEC sa division dessous', async () => {
    const host = await mount(<GameProfileBanner standing={standing()} />);
    const end = host.querySelector('[data-profile-banner-rank]');
    expect(end?.querySelector('[data-game-rank="murmure"]') !== null).toBe(true);
    expect(words(end?.querySelector('[data-profile-banner-rank-name]'))).toBe('Murmure V');
  });

  test('le Mythe se dit par sa place quand elle est servie', async () => {
    const host = await mount(<GameProfileBanner standing={standing({ rank: 'mythe', division: null, mythic: { number: 42, edition: 1 } as BannerStanding['mythic'] })} />);
    expect(words(host.querySelector('[data-profile-banner-rank-name]'))).toBe('Mythe n° 42');
  });
});

describe('un libellé par groupe, lisible dans les sept langues', () => {
  test('chaque groupe est UNE image nommée ; ce qu’il contient se tait', async () => {
    const host = await mount(<GameProfileBanner standing={standing()} />);
    for (const group of ['level', 'rank'] as const) {
      const node = host.querySelector(`[data-profile-banner-${group}]`);
      expect(node?.getAttribute('role')).toBe('img');
      expect((node?.getAttribute('aria-label') ?? '').length > 0).toBe(true);
      expect(node?.querySelectorAll('[role="img"]').length).toBe(0);
    }
    const level = host.querySelector('[data-profile-banner-level]')?.getAttribute('aria-label') ?? '';
    expect(level.startsWith('Niveau 12, palier Étincelle')).toBe(true);
    expect(level.endsWith(', 976 pts, encore 624 vers le 13')).toBe(true);
    expect(host.querySelector('[data-profile-banner-rank]')?.getAttribute('aria-label')).toBe('Murmure V');
  });

  test('chaque langue nomme les deux groupes et écrit les points', async () => {
    for (const language of INTERFACE_LANGUAGES) {
      setInterfaceLanguage(language);
      const host = await mount(<GameProfileBanner standing={standing()} />);
      expect((host.querySelector('[data-profile-banner-level]')?.getAttribute('aria-label') ?? '').length > 0).toBe(true);
      expect((host.querySelector('[data-profile-banner-rank]')?.getAttribute('aria-label') ?? '').length > 0).toBe(true);
      expect(words(host.querySelector('[data-profile-banner-missing]')).length > 0).toBe(true);
      unmountAll();
    }
    setInterfaceLanguage('fr');
  });

  test('le jeu laisse passer le toucher vers la bannière', async () => {
    const host = await mount(<GameProfileBanner standing={standing()} />);
    expect((host.querySelector('[data-profile-banner-game]')?.getAttribute('class') ?? '').split(/\s+/)).toContain('pointer-events-none');
  });
});

/**
 * #10601 (directive porteur 2026-10-14) — le niveau à l'angle BAS du début, le
 * rang à l'angle BAS de la fin ; chaque cadre a les coins hauts arrondis et les
 * coins bas carrés, posés sur le bord bas de la bannière ; leur fond est un
 * voile léger, plus le verre épais qui cachait la bannière.
 */
describe('les deux cadres aux angles bas de la bannière', () => {
  const classes = (host: Element, selector: string): readonly string[] => (host.querySelector(selector)?.getAttribute('class') ?? '').split(/\s+/);

  test('la bande se pose sur le bord BAS, d’un bord à l’autre, sans marge', async () => {
    const host = await mount(<GameProfileBanner standing={standing()} />);
    const band = styleOf(host.querySelector('[data-profile-banner-game]'));
    expect(band).toMatch(/(^|;)\s*bottom:\s*0(px)?\s*(;|$)/);
    expect(band).toMatch(/inset-inline-start:\s*0(px)?\s*(;|$)/);
    expect(band).toMatch(/inset-inline-end:\s*0(px)?\s*(;|$)/);
    expect(band).not.toMatch(/(^|[^-])top\s*:/);
    expect(classes(host, '[data-profile-banner-game]')).toContain('items-end');
  });

  test('chaque cadre : coins hauts arrondis, coins bas carrés', async () => {
    const host = await mount(<GameProfileBanner standing={standing()} />);
    for (const group of ['level', 'rank'] as const) {
      const names = classes(host, `[data-profile-banner-${group}]`);
      expect(names).toContain('rounded-t-card');
      expect(names.filter((name) => /^rounded(-|$)/.test(name) && name !== 'rounded-t-card')).toEqual([]);
    }
  });

  test('un voile léger plutôt que le verre : la bannière se voit, le texte blanc porte son ombre', async () => {
    const host = await mount(<GameProfileBanner standing={standing()} />);
    for (const group of ['level', 'rank'] as const) {
      const names = classes(host, `[data-profile-banner-${group}]`);
      expect(names.some((name) => name.startsWith('glass'))).toBe(false);
      expect(names).toContain('text-on-media');
      expect(names.some((name) => name.startsWith('[text-shadow:'))).toBe(true);
      const veil = names.map((name) => /^bg-\[color-mix\(in_srgb,var\(--color-media-backdrop\)_(\d+)%,transparent\)\]$/.exec(name)).find((match) => match !== null) ?? null;
      expect(veil !== null && Number(veil[1]) <= 30).toBe(true);
    }
  });

  test('chaque cadre s’arrête avant l’avatar posé au milieu du bas', async () => {
    const host = await mount(<GameProfileBanner standing={standing()} />);
    for (const group of ['level', 'rank'] as const) {
      expect(styleOf(host.querySelector(`[data-profile-banner-${group}]`))).toContain(`max-width: calc((100% - ${AVATAR_CLEARANCE}px) / 2)`);
    }
  });
});
