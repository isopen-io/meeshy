import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ENGAGEMENT_AXES, ENGAGEMENT_AXIS_FAMILIES } from '@meeshy/shared/types/engagement';
import { engagementAxisWhatCounts } from '@meeshy/shared/utils/engagement-labels';
import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { GameDetailHost } from '@/components/game-detail-sheet';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { detailStore } from '@/lib/view/detail-store';
import { BADGES_SECTION_ID } from '@/lib/view/badge-guide-view';
import { badgeDetail } from '@/lib/view/game-detail';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { BadgesBody } from './progression-badges';
import { AxisRow } from './progression-parts';
import { RulesBody } from './progression-rules';

/**
 * CHAQUE BADGE S'EXPLIQUE (#9639) — la fiche d'un badge dit ce qui compte pour
 * CE badge, sa matière et pourquoi, ses étoiles sur sept, ses sept paliers et
 * ce qu'il manque pour la prochaine étoile ; la page des badges range par
 * famille avec la suite des paliers à venir ; et tous les liens « Comprendre
 * les badges » atteignent LA section badges, ancrée, du carnet des règles.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const mounter = createActMounter();
const GUIDE_HREF = '/me/progression/regles?section=badges';

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/badges' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadGameCatalog('fr');
});
afterEach(() => {
  act(() => detailStore.close());
  mounter.unmountAll();
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const progress: EngagementWithGame = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);

const axisOf = (key: (typeof ENGAGEMENT_AXES)[number]) => {
  const found = progress.axes.find((axis) => axis.axisKey === key);
  if (found === undefined) throw new Error(`axe absent : ${key}`);
  return found;
};

describe('le modèle de précisions d’un badge', () => {
  test('« ce qui compte » est la phrase de l’axe, et deux badges sociaux ne disent pas la même chose', () => {
    const link = badgeDetail(axisOf('social.tracked_link'));
    const friendship = badgeDetail(axisOf('social.friendship'));
    expect(link.what).toBe(engagementAxisWhatCounts('fr', 'social.tracked_link'));
    expect(friendship.what).toBe(engagementAxisWhatCounts('fr', 'social.friendship'));
    expect(link.what).not.toBe(friendship.what);
  });

  test('il porte l’échelle des sept paliers, les étoiles et la raison de sa matière', () => {
    const detail = badgeDetail(axisOf('content.story'));
    expect(detail.badge?.ladder).toHaveLength(7);
    expect(detail.badge?.stars.max).toBe(7);
    expect(detail.badge?.reason.length).toBeGreaterThan(0);
  });
});

describe('la modale d’un badge', () => {
  test('elle dessine les étoiles, l’échelle des sept paliers, la prochaine étoile et le lien vers le carnet', async () => {
    const axis = axisOf('content.story');
    const host = await mounter.mount(
      <>
        <ul>
          <AxisRow axis={axis} />
        </ul>
        <GameDetailHost progress={progress} />
      </>,
    );
    await mounter.click(host.querySelector<HTMLButtonElement>('button[data-detail]'));
    const dialog = document.querySelector('dialog[data-game-detail]');
    if (dialog === null) throw new Error('modale absente');
    expect(dialog.querySelector('[data-detail-what]')?.textContent).toContain(engagementAxisWhatCounts('fr', 'content.story'));
    expect(dialog.querySelector('[data-badge-stars]')?.textContent).toContain('7');
    expect(dialog.querySelectorAll('[data-badge-rung]')).toHaveLength(7);
    expect(dialog.querySelector('[data-badge-reason]')?.textContent?.trim()).not.toBe('');
    expect(dialog.querySelector<HTMLAnchorElement>('a[data-badge-guide-link]')?.getAttribute('href')).toBe(GUIDE_HREF);
  });
});

describe('la page des badges', () => {
  const page = renderToStaticMarkup(<BadgesBody progress={progress} />);

  test('par famille, dans l’ordre déclaré', () => {
    const positions = ENGAGEMENT_AXIS_FAMILIES.map((family) => page.indexOf(`id="badges-${family}"`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  test('chaque badge montre la suite de ses paliers à venir', () => {
    expect(page.match(/data-badge-upcoming="/g)).toHaveLength(ENGAGEMENT_AXES.length);
  });

  test('le même lien « Comprendre les badges » vers la section du carnet', () => {
    expect(page).toContain('data-badge-guide-link');
    expect(page).toContain(`href="${GUIDE_HREF.replace('&', '&amp;')}"`);
  });
});

describe('le carnet des règles a sa section badges, ancrée', () => {
  const rules = renderToStaticMarkup(<RulesBody />);

  test('la section porte l’ancre que les liens visent', () => {
    expect(rules).toContain(`id="${BADGES_SECTION_ID}"`);
  });

  test('elle explique les sept matières et leurs seuils, dans l’ordre', () => {
    const order = ['Cuivre', 'Bronze', 'Argent', 'Or', 'Platine', 'Obsidienne', 'Prisme'].map((name) => rules.indexOf(`data-badge-material-name="${name}"`));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const threshold of ['1', '10', '50', '100', '500', '1 000', '5 000']) expect(rules.replace(/ | /g, ' ')).toContain(`>${threshold}<`);
  });

  test('elle range les badges par famille, un nom par badge', () => {
    expect(rules.match(/data-badge-guide-axis="/g)).toHaveLength(ENGAGEMENT_AXES.length);
  });
});
