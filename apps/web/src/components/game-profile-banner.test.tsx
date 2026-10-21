import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES as INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { formatCount } from '@/lib/view/game-copy';

import { AVATAR_CLEARANCE, GLORY_GLYPH, GameProfileBanner, SPARK_GLYPH, type BannerStanding } from './game-profile-banner';

/**
 * LE JEU SUR LA BANNIÈRE DU PROFIL (#10231, précision porteur 2026-10-11) —
 * « les détails de points à gauche de la bannière et le reste de rang à
 * droite » ; #10951, porteur 2026-10-19). Au DÉBUT (gauche, droite en RTL) :
 * le nom du palier au-dessus du cercle, les étincelles en grand à droite ; à
 * la FIN : la Gloire, puis le blason, le rang et sa division dessous. Un
 * libellé par groupe.
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
  glory: 41_250,
  levelMax: 12,
  pointsToNext: 624,
  rank: 'murmure',
  division: 5,
  mythic: null,
  ...over,
});

const words = (node: Element | null | undefined): string => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
const styleOf = (node: Element | null | undefined): string => node?.getAttribute('style') ?? '';

describe('au début de la bannière : le nom du palier au-dessus du cercle, les étincelles dessous (porteur 2026-10-19, #10951)', () => {
  test('le nom du palier se pose AU-DESSUS du cercle ; ni « Niveau N », ni record, ni reste', async () => {
    const host = await mount(<GameProfileBanner standing={standing({ levelMax: 40 })} />);
    const start = host.querySelector('[data-profile-banner-level]');
    const name = start?.querySelector('[data-profile-banner-level-name]');
    const ring = start?.querySelector('[data-game-level="12"]');
    expect(words(name)).toBe('Étincelle');
    expect(ring !== null && ring !== undefined).toBe(true);
    expect(((name?.compareDocumentPosition(ring as Node) ?? 0) & 4) !== 0).toBe(true);
    expect((start?.getAttribute('class') ?? '').split(/\s+/)).toContain('flex-col');
    for (const gone of ['level-now', 'level-max', 'missing', 'rule']) {
      expect(start?.querySelector(`[data-profile-banner-${gone}]`) === null).toBe(true);
    }
    expect(words(start)).not.toMatch(/Niveau|record|encore/);
  });

  test('« ✦ 976 » SOUS le cercle, plus petit qu’un titre ; la Gloire n’est plus de ce côté', async () => {
    const host = await mount(<GameProfileBanner standing={standing()} />);
    const start = host.querySelector('[data-profile-banner-level]');
    const pocket = start?.querySelector('[data-profile-banner-points]');
    const ring = start?.querySelector('[data-game-level="12"]');
    expect(words(pocket)).toBe(`${SPARK_GLYPH} 976`);
    expect(((ring?.compareDocumentPosition(pocket as Node) ?? 0) & 4) !== 0).toBe(true);
    const names = (pocket?.getAttribute('class') ?? '').split(/\s+/);
    expect(names).toContain('text-body');
    expect(names).not.toContain('text-section');
    expect(names).toContain('font-bold');
    expect(start?.querySelector('[data-profile-banner-glory]') === null).toBe(true);
    expect(host.querySelector('[data-profile-banner-lifetime]') === null).toBe(true);
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

  test('sur la fiche d\'un autre (rien de servi) : le nom du palier et le cercle, rien d’autre', async () => {
    const host = await mount(<GameProfileBanner standing={standing({ points: null, glory: null, pointsToNext: null, progress: null })} />);
    expect(host.querySelector('[data-profile-banner-points]') === null).toBe(true);
    expect(host.querySelector('[data-profile-banner-glory]') === null).toBe(true);
    expect(words(host.querySelector('[data-profile-banner-level-name]'))).toBe('Étincelle');
    expect(host.querySelector('[data-profile-banner-level] [data-game-level="12"]') !== null).toBe(true);
  });
});

describe('à la fin de la bannière : la Gloire au-dessus du blason, le nom du rang dessous (porteur 2026-10-19, #10951)', () => {
  test('« ♛ 41 250 » AU-DESSUS du blason, puis le nom du rang AVEC sa division dessous', async () => {
    const host = await mount(<GameProfileBanner standing={standing()} />);
    const end = host.querySelector('[data-profile-banner-rank]');
    const glory = end?.querySelector('[data-profile-banner-glory]');
    const crest = end?.querySelector('[data-game-rank="murmure"]');
    const name = end?.querySelector('[data-profile-banner-rank-name]');
    expect(words(glory)).toBe(`${GLORY_GLYPH} ${formatCount(41_250, 'fr')}`.replace(/\s+/g, ' '));
    expect((glory?.getAttribute('class') ?? '').split(/\s+/)).toContain('font-bold');
    expect(((glory?.compareDocumentPosition(crest as Node) ?? 0) & 4) !== 0).toBe(true);
    expect(((crest?.compareDocumentPosition(name as Node) ?? 0) & 4) !== 0).toBe(true);
    expect(words(name)).toBe('Murmure V');
    expect((end?.getAttribute('class') ?? '').split(/\s+/)).toContain('flex-col');
  });

  test('deux glyphes distincts, aucun mot', () => {
    expect(GLORY_GLYPH).not.toBe(SPARK_GLYPH);
    expect(GLORY_GLYPH).not.toMatch(/\p{L}/u);
  });

  test('sans Gloire servie (non-ami, ancien serveur) : le blason seul, jamais un zéro', async () => {
    const host = await mount(<GameProfileBanner standing={standing({ glory: null })} />);
    expect(host.querySelector('[data-profile-banner-glory]') === null).toBe(true);
    expect(words(host.querySelector('[data-profile-banner-points]'))).toBe(`${SPARK_GLYPH} 976`);
    expect((host.querySelector('[data-profile-banner-rank]')?.getAttribute('aria-label') ?? '')).toBe('Murmure V');
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
    expect(level.startsWith('Niveau 12, ta lumière en ')).toBe(true);
    expect(level).toContain('976 étincelles');
    expect(level).not.toContain('Gloire');
    expect(level).toContain('ta plus haute lumière : niveau 12');
    expect(level.endsWith(', 624 jusqu’au niveau 13')).toBe(true);
    expect(host.querySelector('[data-profile-banner-rank]')?.getAttribute('aria-label')).toBe(`Murmure V, ${formatCount(41_250, 'fr')} de gloire`);
  });

  test('chaque langue nomme les deux groupes et écrit les points', async () => {
    for (const language of INTERFACE_LANGUAGES) {
      setInterfaceLanguage(language);
      const host = await mount(<GameProfileBanner standing={standing()} />);
      expect((host.querySelector('[data-profile-banner-level]')?.getAttribute('aria-label') ?? '').length > 0).toBe(true);
      expect((host.querySelector('[data-profile-banner-rank]')?.getAttribute('aria-label') ?? '').length > 0).toBe(true);
      expect((host.querySelector('[data-profile-banner-level]')?.getAttribute('aria-label') ?? '')).toContain(formatCount(624, language));
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
    expect(classes(host, '[data-profile-banner-game]')).toContain('items-stretch');
  });

  test('chaque cadre : coins bas carrés ; le bord de DÉBUT du niveau et le bord de FIN du rang ne sont plus arrondis (coins logiques, RTL compris)', async () => {
    const host = await mount(<GameProfileBanner standing={standing()} />);
    // Le niveau (étincelles) : seul son coin haut de FIN est arrondi.
    expect(classes(host, '[data-profile-banner-level]').filter((name) => /^rounded(-|$)/.test(name))).toEqual(['rounded-se-card']);
    // Le rang : seul son coin haut de DÉBUT est arrondi.
    expect(classes(host, '[data-profile-banner-rank]').filter((name) => /^rounded(-|$)/.test(name))).toEqual(['rounded-ss-card']);
  });

  test('aucune classe physique (gauche/droite) : tout est logique', async () => {
    const host = await mount(<GameProfileBanner standing={standing()} />);
    for (const group of ['level', 'rank'] as const) {
      expect(classes(host, `[data-profile-banner-${group}]`).filter((name) => /^rounded-(t|b|l|r|tl|tr|bl|br)(-|$)/.test(name))).toEqual([]);
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

  test('les deux cadres ont TOUJOURS la même taille : la moitié de ce que l’avatar laisse, la même hauteur (#10951)', async () => {
    for (const shown of [standing(), standing({ points: null, glory: null })]) {
      const host = await mount(<GameProfileBanner standing={shown} />);
      for (const group of ['level', 'rank'] as const) {
        expect(styleOf(host.querySelector(`[data-profile-banner-${group}]`))).toContain(`width: calc((100% - ${AVATAR_CLEARANCE}px) / 2)`);
        expect(styleOf(host.querySelector(`[data-profile-banner-${group}]`))).not.toContain('max-width');
      }
      expect(classes(host, '[data-profile-banner-game]')).toContain('items-stretch');
      unmountAll();
    }
  });
});
