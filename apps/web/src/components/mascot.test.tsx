import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import type { MascotMood } from '@meeshy/shared/utils/mascot';

import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { mascotSay } from '@/lib/view/mascot-copy';
import { ACHIEVEMENT_COPY } from '@/lib/view/progression';
import { ProgressionBody } from '@/routes/progression';

import { Mascot, MascotCoach } from './mascot';

/**
 * LA MASCOTTE, RENDUE (#8907) — ce que la loi partagée décide, qui le DIT et
 * qui le MONTRE. Même méthode que `progression.test.tsx` : l'état initial,
 * sans DOM ni TanStack Query.
 */

describe('mascotSay — la phrase de chaque ligne', () => {
  test('compte les points avant la prochaine Meesh, accordés', () => {
    expect(mascotSay({ kind: 'meesh-missing', missing: 821 })).toBe('Encore 821 points et je frappe ta prochaine Meesh.');
    expect(mascotSay({ kind: 'meesh-missing', missing: 1 })).toBe('Encore 1 point et je frappe ta prochaine Meesh.');
  });

  test('invite à frapper en disant le prix', () => {
    expect(mascotSay({ kind: 'can-mint', mintCost: 1221 })).toBe('Tes points sont prêts : on frappe une Meesh pour 1221 points ?');
  });

  test('célèbre une frappe avec le nouveau solde', () => {
    expect(mascotSay({ kind: 'meesh-minted', balance: 1 })).toBe('Tchak ! Une Meesh toute neuve. Tu en as 1.');
    expect(mascotSay({ kind: 'meesh-minted', balance: 3 })).toBe('Tchak ! Une Meesh toute neuve. Tu en as 3.');
  });

  test('célèbre un niveau et nomme un succès par son titre', () => {
    expect(mascotSay({ kind: 'level-up', level: 3 })).toBe('Niveau 3 ! On fête ça.');
    expect(mascotSay({ kind: 'achievement', key: 'achievement.first_voice' })).toContain(
      ACHIEVEMENT_COPY['achievement.first_voice'].title,
    );
  });

  test('guide, salue la série, compte vers le niveau et encourage au sommet', () => {
    expect(mascotSay({ kind: 'first-step' })).toBe('Salut, je suis Mee ! Envoie ton premier message et je compte tes points.');
    expect(mascotSay({ kind: 'streak', days: 4 })).toBe('4 jours d’affilée, continue comme ça !');
    expect(mascotSay({ kind: 'level-missing', missing: 90, nextLevel: 3 })).toBe('Encore 90 points avant le niveau 3.');
    expect(mascotSay({ kind: 'top-level' })).toBe('Tu es au sommet. Bravo !');
  });
});

describe('Mascot — le personnage', () => {
  const moods: readonly MascotMood[] = ['cheer', 'minting', 'ready', 'guide', 'streak', 'counting'];

  test('porte son humeur et reste muet pour le lecteur d’écran : la bulle parle pour lui', () => {
    moods.forEach((mood) => {
      const html = renderToStaticMarkup(<Mascot mood={mood} />);
      expect(html).toContain(`data-mascot-mood="${mood}"`);
      expect(html).toContain('aria-hidden="true"');
    });
  });

  test('ne montre la pièce qu’au moment de la frappe', () => {
    expect(renderToStaticMarkup(<Mascot mood="minting" />)).toContain('data-mascot-coin');
    expect(renderToStaticMarkup(<Mascot mood="counting" />)).not.toContain('data-mascot-coin');
  });

  test('saute de joie quand il célèbre, et reste posé quand il compte', () => {
    expect(renderToStaticMarkup(<Mascot mood="cheer" />)).toContain('data-mascot-motion="hop"');
    expect(renderToStaticMarkup(<Mascot mood="counting" />)).not.toContain('data-mascot-motion');
  });

  test('ne s’anime qu’en mouvement autorisé', () => {
    const css = readFileSync(new URL('../styles/mascot.css', import.meta.url), 'utf8');
    const autorise = css.slice(css.indexOf('@media (prefers-reduced-motion: no-preference)'));
    expect(autorise).toContain("[data-mascot-motion='hop']");
    expect(autorise).toContain("[data-mascot-motion='coin']");
    expect(css.indexOf('animation:')).toBeGreaterThan(css.indexOf('@media (prefers-reduced-motion: no-preference)'));
  });
});

describe('Mascot — les trois déclinaisons du colibri (#8908)', () => {
  test('peint le coach à l’aquarelle par défaut', () => {
    const html = renderToStaticMarkup(<Mascot mood="counting" />);
    expect(html).toContain('data-mascot-variant="aquarelle"');
    expect(html).toContain('feTurbulence');
  });

  test('trace le glyphe d’un seul trait à la couleur du texte, sans aucun remplissage de couleur', () => {
    const html = renderToStaticMarkup(<Mascot mood="counting" variant="glyph" />);
    expect(html).toContain('data-mascot-variant="glyph"');
    expect(html).toContain('stroke="currentColor"');
    expect(html).not.toMatch(/fill="(#|var\()/);
  });

  test('donne au réaliste son plumage irisé', () => {
    const html = renderToStaticMarkup(<Mascot mood="counting" variant="realiste" />);
    expect(html).toContain('data-mascot-variant="realiste"');
    expect(html).toContain('linearGradient');
  });

  test('ne partage aucun identifiant de filtre ou de dégradé entre deux mascottes de la même page', () => {
    const html = renderToStaticMarkup(
      <div>
        <Mascot mood="counting" variant="realiste" />
        <Mascot mood="cheer" variant="realiste" />
        <Mascot mood="counting" />
        <Mascot mood="cheer" />
      </div>,
    );
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('garde les quatre humeurs dans chaque déclinaison', () => {
    (['aquarelle', 'glyph', 'realiste'] as const).forEach((variant) => {
      expect(renderToStaticMarkup(<Mascot mood="minting" variant={variant} />)).toContain('data-mascot-coin');
      expect(renderToStaticMarkup(<Mascot mood="streak" variant={variant} />)).toContain('data-mascot-flame');
      expect(renderToStaticMarkup(<Mascot mood="cheer" variant={variant} />)).toContain('data-mascot-eyes="happy"');
      expect(renderToStaticMarkup(<Mascot mood="counting" variant={variant} />)).toContain('data-mascot-eyes="open"');
    });
  });
});

describe('MascotCoach — la mascotte et sa bulle', () => {
  test('annonce sa phrase poliment', () => {
    const html = renderToStaticMarkup(<MascotCoach moment={{ mood: 'ready', line: { kind: 'can-mint', mintCost: 50 } }} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('on frappe une Meesh pour 50 points');
  });
});

describe('ProgressionBody — la mascotte ouvre l’écran', () => {
  const progress = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);

  test('dit ce que la loi décide pour la progression servie', () => {
    const html = renderToStaticMarkup(<ProgressionBody progress={progress} onMint={() => {}} isMinting={false} />);
    expect(html).toContain('data-mascot-coach');
  });

  test('célèbre l’événement qu’on lui passe', () => {
    const html = renderToStaticMarkup(
      <ProgressionBody
        progress={progress}
        onMint={() => {}}
        isMinting={false}
        mascotEvent={{ kind: 'meesh-minted', balance: 4 }}
      />,
    );
    expect(html).toContain('data-mascot-mood="minting"');
    expect(html).toContain('Tu en as 4.');
  });
});
