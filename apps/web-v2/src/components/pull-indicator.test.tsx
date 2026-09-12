import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { PullIndicator } from './pull-indicator';
import type { PullPhase } from '@/lib/view/pull-to-refresh';

function render(phase: PullPhase, offsetPx = 0, reducedMotion = false): string {
  return renderToStaticMarkup(<PullIndicator phase={phase} offsetPx={offsetPx} reducedMotion={reducedMotion} />);
}

describe('PullIndicator', () => {
  test('idle/pulling ⇒ région status VIDE (rien à annoncer)', () => {
    expect(render({ kind: 'idle' })).toContain('role="status"');
    expect(render({ kind: 'idle' }).match(/<span[^>]*role="status"[^>]*><\/span>/)).not.toBeNull();
    expect(render({ kind: 'pulling', progress: 0.5 }).match(/<span[^>]*role="status"[^>]*><\/span>/)).not.toBeNull();
  });

  test('armed ⇒ « Relâchez pour actualiser »', () => {
    expect(render({ kind: 'armed' })).toContain('Relâchez pour actualiser');
  });

  test('refreshing ⇒ « Actualisation… »', () => {
    expect(render({ kind: 'refreshing' })).toContain('Actualisation…');
  });

  test('completing ok ⇒ « Liste à jour », failed ⇒ « Actualisation impossible »', () => {
    expect(render({ kind: 'completing', outcome: 'ok' })).toContain('Liste à jour');
    expect(render({ kind: 'completing', outcome: 'failed' })).toContain('Actualisation impossible');
  });

  /** UN ÉCHEC SE VOIT (revue-correction #6195) — le lecteur d'écran entendait
   * déjà « Actualisation impossible », les pixels étaient identiques au succès.
   * `--color-error` (jeton conscient du schéma, 5,74:1 clair / 6,15:1 sombre),
   * jamais `--ios-error` (2,77:1 en clair sur `--ios-surface` — sous le seuil
   * WCAG 1.4.11, revue-correction #6195 défaut 6). */
  test('completing failed ⇒ la marque est TEINTÉE de --color-error, ok ⇒ jeton de marque', () => {
    const failed = render({ kind: 'completing', outcome: 'failed' });
    expect(failed).toContain('var(--color-error)');
    expect(failed).not.toContain('var(--ios-error)');
    const ok = render({ kind: 'completing', outcome: 'ok' });
    expect(ok).toContain('var(--color-ios-brand)');
    expect(ok).not.toContain('var(--color-error)');
  });

  /** MÊME RÉGIME QUE LE SCROLLPORT : doigt posé ⇒ la marque suit le doigt, sans
   * transition qui la ferait traîner. */
  test('doigt POSÉ ⇒ aucune transition ; doigt PARTI ⇒ la transition est posée', () => {
    expect(render({ kind: 'pulling', progress: 0.5 }, 45)).not.toContain('transition');
    expect(render({ kind: 'armed' }, 90)).not.toContain('transition');
    expect(render({ kind: 'refreshing' }, 90)).toContain('transition');
    expect(render({ kind: 'completing', outcome: 'ok' }, 0)).toContain('transition');
  });

  /**
   * Rang « reduce » (revue-correction #6195, défaut 4) — au rang NOMINAL, la
   * valeur juste (`reducedMotion ? 0 : offsetPx - 40`) et la valeur fautive
   * (`offsetPx - 40`) rendent le MÊME verdict (`offsetPx` grandit avec la
   * phase) : le témoin ne peut tomber que sur le rang où `offsetPx` reste
   * épinglé à `0`.
   */
  test('reducedMotion=true, armed ⇒ la marque est À L’ANCRE (translateY(0)), jamais à -40px', () => {
    const html = render({ kind: 'armed' }, 0, true);
    expect(html).toContain('translateY(0px)');
    expect(html).not.toContain('translateY(-40px)');
  });

  test('reducedMotion=false (nominal), armed à offsetPx=90 ⇒ translateY(50px), inchangé', () => {
    expect(render({ kind: 'armed' }, 90, false)).toContain('translateY(50px)');
  });

  test('le logo est le BrandMark — un <svg> à trois traits, aria-hidden', () => {
    const html = render({ kind: 'armed' });
    expect(html).toContain('<svg');
    expect((html.match(/<line/g) ?? []).length).toBe(3);
    expect(html).toContain('aria-hidden="true"');
  });
});
