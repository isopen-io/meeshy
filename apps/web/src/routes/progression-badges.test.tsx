import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ENGAGEMENT_AXES } from '@meeshy/shared/types/engagement';
import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';

import { AxisRow } from './progression-parts';

/**
 * LES BADGES SONT DES MÉDAILLES (#9466) — la page des badges et tout endroit
 * où un badge d'accumulation s'affiche montrent une médaille (lunette de métal,
 * émail de famille, pictogramme, perles, arc), plus jamais un hexagone ni une
 * simple pastille d'icône.
 */
const fixture = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
const rows = renderToStaticMarkup(
  <ul>
    {fixture.axes.map((axis) => (
      <AxisRow key={axis.axisKey} axis={axis} />
    ))}
  </ul>,
);

describe('la ligne d’un badge', () => {
  test('chaque axe du catalogue est une médaille', () => {
    expect(rows.match(/data-game-medal="/g)).toHaveLength(ENGAGEMENT_AXES.length);
  });

  test('plus d’hexagone d’accumulation', () => {
    expect(rows).not.toContain('data-game-badge="accumulation"');
  });

  test('un badge sans palier est une empreinte, un badge atteint une médaille de métal', () => {
    const reached = fixture.axes.filter((axis) => axis.reachedCount > 0).length;
    expect(rows.match(/data-game-imprint/g)).toHaveLength(ENGAGEMENT_AXES.length - reached);
    expect(rows.match(/data-game-badge-body/g)).toHaveLength(reached);
  });

  test('l’hôte porte le libellé de la médaille quand on le lui donne', () => {
    const axis = fixture.axes.find((candidate) => candidate.reachedCount > 0);
    if (axis === undefined) throw new Error('la fixture porte au moins un badge atteint');
    const html = renderToStaticMarkup(
      <ul>
        <AxisRow axis={axis} medalLabel="Messages texte, Or, 100 sur 500 vers Platine" />
      </ul>,
    );
    expect(html).toContain('aria-label="Messages texte, Or, 100 sur 500 vers Platine"');
  });

  test('sans libellé, la médaille est décorative : la ligne dit déjà l’axe et le palier', () => {
    expect(rows).toContain('aria-hidden="true"');
    expect(rows).not.toContain('role="img"');
  });
});
