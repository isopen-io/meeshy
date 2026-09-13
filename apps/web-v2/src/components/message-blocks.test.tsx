import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Badges, EditedMark } from './message-blocks';

/**
 * T11 (#5936) — `Badges` peint épinglé + transféré, dans l'ordre reçu ;
 * `EditedMark` peint « modifié ». Les deux sont des composants PURS, sans
 * état ni effet — `renderToStaticMarkup` suffit (même patron que
 * `attachment-blocks.test.tsx`).
 */

describe('Badges', () => {
  test('épinglé + transféré, dans cet ordre — glyphe tourné, teinte dédiée, texte italique', () => {
    const html = renderToStaticMarkup(
      <Badges
        badges={[
          { kind: 'pinned' },
          { kind: 'forwarded', attribution: { kind: 'group', name: 'Salon' } },
        ]}
      />,
    );
    expect(html).toContain('data-badge="pinned"');
    expect(html).toContain('rotate(45deg)');
    expect(html).toContain('épinglé');
    expect(html.indexOf('data-badge="pinned"')).toBeLessThan(html.indexOf('data-badge="forwarded"'));
    expect(html).toContain('<em');
    expect(html).toContain('Transféré depuis Salon');
    /* TROIS TEINTES DISTINCTES, PAS L'INDIGO DE MARQUE (revue #5936, défaut
       majeur 9) — épinglé MONO-TEINTE `--ios-pinned` (glyphe ET texte),
       transféré `--color-ios-ink-3` (le cran `textMuted`) : ni l'un ni
       l'autre n'empruntent `--color-day-ink`, le jeton du séparateur de
       JOUR. */
    expect(html).toContain('var(--ios-pinned)');
    expect(html).toContain('var(--color-ios-ink-3)');
    expect(html).not.toContain('var(--color-day-ink)');
    /* `aria-hidden` (revue #5936, défaut majeur 8) — déjà dans `rowLabel`
       (`composeMessageLabel`) : un lecteur d'écran ne doit pas l'entendre
       deux fois. */
    expect(html).toContain('aria-hidden="true"');
  });

  test('[] ⇒ null (aucun nœud)', () => {
    const html = renderToStaticMarkup(<Badges badges={[]} />);
    expect(html).toBe('');
  });

  test('ephemeral/edited ne sont PAS peints ici — chacun a son propre composant', () => {
    const html = renderToStaticMarkup(
      <Badges badges={[{ kind: 'ephemeral', expiresAt: new Date() }, { kind: 'edited' }]} />,
    );
    expect(html).toBe('');
  });
});

describe('EditedMark', () => {
  test('« modifié » avec le glyphe crayon, masqué du lecteur d’écran (déjà dans rowLabel), teinte selon la SURFACE', () => {
    const onBubble = renderToStaticMarkup(<EditedMark onBrandBubble />);
    expect(onBubble).toContain('data-badge="edited"');
    /* `aria-hidden` (revue #5936, défaut majeur 8), pas `aria-label` — le mot
       est déjà dans `rowLabel` (`composeMessageLabel`), le doubler ferait
       entendre « modifié » deux fois. */
    expect(onBubble).toContain('aria-hidden="true"');
    expect(onBubble).toContain('modifié');
    expect(onBubble).toContain('var(--color-meta-mine)');

    /* HORS de la boîte colorée — rangée plate, ou corps NU d'un emoji seul /
       d'un sticker : `white 70%` n'y a plus d'indigo derrière elle
       (revue-correction #5936, `BubbleFooter.compactMetaColor:62-66`). Le
       cran MÉTA (`--color-ios-ink-2` à `META_TEXT_OPACITY`), jamais
       `--color-day-ink` — celui-ci reste le jeton du séparateur de JOUR
       (revue #5936, défaut majeur 9). */
    const offBubble = renderToStaticMarkup(<EditedMark onBrandBubble={false} />);
    expect(offBubble).toContain('var(--color-ios-ink-2)');
    expect(offBubble).not.toContain('var(--color-day-ink)');
    expect(offBubble).not.toContain('var(--color-meta-mine)');
  });
});
