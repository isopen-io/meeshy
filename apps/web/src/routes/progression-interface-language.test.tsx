import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { LastAchievementHero, LevelHero, MeeshDetail } from './progression-heroes';
import { AchievementsSection, AxisRow, GeneratedAchievements, ProgressionError, ProgressionSkeleton } from './progression-parts';
import { ProgressionShell } from './progression-shell';

/**
 * UNE SEULE LANGUE D'INTERFACE (#10823) — l'ancien chrome de Progression (héros
 * du dernier succès, du niveau, des Meeshes ; badges, succès, défis ; erreur,
 * squelette ; retour de la coquille) parle la langue d'interface. Un lecteur en
 * anglais n'y lit plus un mot de français.
 */

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  await Promise.all((['en', 'it'] as const).flatMap((language) => [loadInterfaceCatalog(language), loadGameCatalog(language)]));
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  document.documentElement.lang = 'fr';
});

const fixture = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
const empty = resolveEngagementProgress({
  counters: [],
  milestones: [],
  streak: { currentStreakDays: 0, longestStreakDays: 0 },
  level: { engagementScore: 0 },
});

const meeshOf = (meesh: {
  balance: number;
  mintedLifetime: number;
  debitablePoints: number;
  floorPoints: number;
  missingPoints: number;
  mintCost: number;
}) => resolveEngagementProgress({ ...ENGAGEMENT_PROGRESS_FIXTURE, meesh }).meesh!;

const noop = (): void => undefined;

/** Ce que l'écran rend, en texte : les balises tombent, les attributs lus (aria-label, title) restent. */
const rendered = (node: React.ReactElement): string => renderToStaticMarkup(node);

const FRENCH = /Premier succès|Dernier succès|Décroché|Envoyez|Niveau|Comment gagner|jusqu’à|se convertissent|Aucune Meesh|frappée|Aucune frappe|Première frappe|Convertir|Encore|Débloqué|Obtenu|Échelle complète|avant le palier|pas pu être chargée|Hors ligne|reconnexion|en cours de chargement|Retour|Cercles|Défis|Succès| sur /u;

describe('Progression, interface en', () => {
  test('les héros : dernier succès, niveau, Meeshes', () => {
    document.documentElement.lang = 'en';
    const html = [
      rendered(<LastAchievementHero progress={fixture} />),
      rendered(<LastAchievementHero progress={empty} />),
      rendered(<LevelHero progress={fixture} mintCost={1221} />),
      rendered(
        <MeeshDetail
          meesh={meeshOf({ balance: 0, mintedLifetime: 0, debitablePoints: 100, floorPoints: 1300, missingPoints: 1121, mintCost: 1221 })}
          onMint={noop}
          isMinting={false}
        />,
      ),
      rendered(
        <MeeshDetail
          meesh={meeshOf({ balance: 2, mintedLifetime: 5, debitablePoints: 1300, floorPoints: 40, missingPoints: 0, mintCost: 1221 })}
          onMint={noop}
          isMinting={false}
        />,
      ),
    ].join('\n');
    expect(html).toContain('Latest achievement');
    expect(html).toContain('First achievement');
    expect(html).toContain('Unlocked on');
    expect(html).toContain(`Level ${fixture.level.level}`);
    expect(html).toContain('How to earn sparks');
    expect(html).toContain('Progress toward the next level');
    expect(html).toContain('No Meesh');
    expect(html).toContain('2 Meeshes');
    expect(html).toContain('Meesh record: 5');
    expect(html).toContain('No mint yet.');
    expect(html).toContain('Mint a Meesh for 1,221 sparks');
    expect(html).toContain('more sparks before a Meesh.');
    expect(html).not.toMatch(FRENCH);
  });

  test('badges, succès, défis : palier, sections, compte', () => {
    document.documentElement.lang = 'en';
    const axis = fixture.axes.find((a) => a.axisKey === 'content.text_message');
    const html = [
      axis === undefined ? '' : rendered(<ul><AxisRow axis={axis} /></ul>),
      rendered(<AchievementsSection progress={fixture} />),
      rendered(<GeneratedAchievements sections={fixture.achievementSections ?? []} />),
    ].join('\n');
    expect(html).toContain('8 more before milestone 50');
    expect(html).toContain('Achievements');
    expect(html).toContain('Challenges');
    expect(html).toContain('Circles');
    expect(html).toMatch(/Circles — \d+ of \d+/u);
    expect(html).not.toMatch(FRENCH);
  });

  test('erreur, hors ligne, squelette, retour de la coquille', () => {
    document.documentElement.lang = 'en';
    const html = [
      rendered(<ProgressionError message="HTTP 500" online onRetry={noop} />),
      rendered(<ProgressionError message="HTTP 500" online={false} onRetry={noop} />),
      rendered(<ProgressionSkeleton />),
      rendered(
        <ProgressionShell title="Progress" screen={{ kind: 'root' }}>
          <p>content</p>
        </ProgressionShell>,
      ),
    ].join('\n');
    expect(html).toContain('Couldn’t load your progress');
    expect(html).toContain('Offline — no progress in memory');
    expect(html).toContain('It will show once you’re back online.');
    expect(html).toContain('Loading your progress');
    expect(html).toContain('aria-label="Back"');
    expect(html).not.toMatch(FRENCH);
  });
});

describe('Progression, interface it', () => {
  test('le héros vide et les sections viennent du catalogue italien', () => {
    document.documentElement.lang = 'it';
    expect(rendered(<LastAchievementHero progress={empty} />)).toContain('Prima impresa');
    expect(rendered(<GeneratedAchievements sections={fixture.achievementSections ?? []} />)).toContain('Cerchi');
  });
});
