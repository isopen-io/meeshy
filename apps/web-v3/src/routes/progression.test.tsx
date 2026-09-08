import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ENGAGEMENT_ACHIEVEMENT_KEYS, ENGAGEMENT_AXES } from '@meeshy/shared/types/engagement';
import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { ACHIEVEMENT_COPY, AXIS_LABELS } from '@/lib/view/progression';

import { ProgressionBody, ProgressionError, ProgressionSkeleton } from './progression';

/**
 * L'ÉCRAN « PROGRESSION », RENDU (#5547) — ce que les témoins purs ne prouvent
 * pas : qui AFFICHE ce que la loi décide. Un résolveur juste dont la valeur
 * n'atteint aucun pixel n'a corrigé personne (§ Prisme, cycle 122).
 *
 * `renderToStaticMarkup` et non un DOM (même méthode que `auth-screens.test.tsx`) :
 * c'est l'ÉTAT INITIAL qui est mesuré, sans TanStack Query — `ProgressionBody`
 * est pur, c'est la raison de la découpe.
 */

const fixture = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
const html = renderToStaticMarkup(<ProgressionBody progress={fixture} />);

describe('ProgressionBody — un utilisateur à mi-chemin', () => {
  test('le niveau et son score, la série et son record', () => {
    expect(html).toContain('Niveau 3');
    expect(html).toContain('350 points');
    expect(html).toContain('5 jours d’affilée');
    expect(html).toContain('Record : 12 jours');
  });

  test('les barres sont des `progressbar` NOMMÉES, avec leur valeur', () => {
    expect(html.match(/role="progressbar"/g)).toHaveLength(2);
    expect(html).toContain('aria-valuenow="80"');
  });

  test('la carte de niveau nomme le RANG suivant, jamais le seuil de points', () => {
    expect(html).toContain('Encore 50 points avant le niveau 4');
    expect(html).not.toContain('niveau 400');
  });

  test('les TREIZE axes sont rendus — y compris ceux à zéro, qui disent ce qu’il reste à faire', () => {
    for (const key of ENGAGEMENT_AXES) expect(html).toContain(AXIS_LABELS[key]);
    expect(html).toContain('Encore 1 avant le palier 1');
  });

  test('le compte de badges et les cinq pastilles par axe', () => {
    expect(html).toContain('15 / 65');
    expect(html.match(/Palier \d+ atteint/g)?.length).toBe(15);
    expect(html.match(/Palier \d+ à atteindre/g)?.length).toBe(65 - 15);
  });

  test('les succès : quatre débloqués et datés, un verrouillé avec sa condition', () => {
    expect(html).toContain('4 / 5');
    for (const key of ENGAGEMENT_ACHIEVEMENT_KEYS) expect(html).toContain(ACHIEVEMENT_COPY[key].title);
    expect(html).toContain(ACHIEVEMENT_COPY['achievement.all_content_types'].condition);
    expect(html.match(/Obtenu le /g)?.length).toBe(4);
  });

  test('aucun bandeau d’état vide sur un utilisateur actif', () => {
    expect(html).not.toContain('Aucune activité comptée');
  });
});

describe('ProgressionBody — l’état VIDE est un état, et il montre le catalogue entier', () => {
  const empty = renderToStaticMarkup(
    <ProgressionBody
      progress={resolveEngagementProgress({
        counters: [],
        milestones: [],
        streak: { currentStreakDays: 0, longestStreakDays: 0 },
        level: { engagementScore: 0 },
      })}
    />,
  );

  test('le bandeau dit quoi faire, en `role="status"`', () => {
    expect(empty).toContain('role="status"');
    expect(empty).toContain('Aucune activité comptée');
  });

  test('niveau 0, aucune série, 0 / 65 badges, 0 / 5 succès — et tout le catalogue verrouillé', () => {
    expect(empty).toContain('Niveau 0');
    expect(empty).toContain('Aucune série en cours');
    expect(empty).toContain('0 / 65');
    expect(empty).toContain('0 / 5');
    for (const key of ENGAGEMENT_AXES) expect(empty).toContain(AXIS_LABELS[key]);
    expect(empty).not.toContain('Obtenu le ');
  });
});

describe('les autres états', () => {
  test('le squelette est marqué occupé — jamais un spinner', () => {
    const skeleton = renderToStaticMarkup(<ProgressionSkeleton />);
    expect(skeleton).toContain('aria-busy="true"');
    expect(skeleton).not.toContain('spinner');
  });

  test('l’erreur est une alerte NOMMÉE avec sa reprise ; hors ligne, c’est la coupure qui est nommée', () => {
    const noop = () => undefined;
    const online = renderToStaticMarkup(<ProgressionError message="Erreur 500" online onRetry={noop} />);
    expect(online).toContain('role="alert"');
    expect(online).toContain('Erreur 500');
    expect(online).toContain('Réessayer');

    const offline = renderToStaticMarkup(<ProgressionError message="Réseau indisponible" online={false} onRetry={noop} />);
    expect(offline).toContain('Hors ligne — aucune progression en mémoire');
    expect(offline).not.toContain('Réseau indisponible');
  });
});
