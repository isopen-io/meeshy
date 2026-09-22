import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { DraftMediaTile, FormatToggle, PostComposeHeader, composeTypeOf } from './post-compose';
import type { DraftMedia } from '@/lib/publish/draft';

/**
 * LE COMPOSEUR DE PUBLICATION (#7449) — les pièces PURES : ce que l'adresse
 * dit du format, ce que la bascule annonce, et ce qu'une vignette dit de son
 * envoi. Le reste (la publication elle-même) se prouve au port
 * (`posts-publish.test.ts`), dans le brouillon (`lib/publish/draft.test.ts`)
 * et au navigateur (`scripts/check-feed-column.mjs`).
 */

const media = (overrides: Partial<DraftMedia> = {}): DraftMedia => ({
  key: 'd1',
  name: 'photo.jpg',
  mimeType: 'image/jpeg',
  previewUrl: 'blob:photo',
  durationMs: null,
  upload: { phase: 'ready', postMediaId: 'pm-1' },
  ...overrides,
});

describe('l’adresse porte le format', () => {
  test('sans paramètre, c’est une publication', () => {
    expect(composeTypeOf(new URLSearchParams(''))).toBe('POST');
  });

  test('`?type=reel` ouvre le format RÉEL', () => {
    expect(composeTypeOf(new URLSearchParams('type=reel'))).toBe('REEL');
  });

  /* Une valeur inconnue ne fabrique pas un troisième format : elle retombe sur
     le post, le seul des deux qui accepte n'importe quelle composition. */
  test('une valeur inconnue retombe sur la publication', () => {
    expect(composeTypeOf(new URLSearchParams('type=story'))).toBe('POST');
  });
});

describe('la bascule de format est un CHOIX EXCLUSIF, annoncé comme tel', () => {
  test('un radiogroup de deux radios, un seul coché', () => {
    const html = renderToStaticMarkup(<FormatToggle language="fr" value="POST" onChange={() => undefined} />);
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/role="radio"/g)?.length).toBe(2);
    expect(html).toContain('data-post-format-choice="POST"');
    expect(html).toContain('data-post-format-choice="REEL"');
    expect(html.match(/aria-checked="true"/g)?.length).toBe(1);
  });

  test('en format RÉEL, c’est l’autre radio qui est cochée', () => {
    const html = renderToStaticMarkup(<FormatToggle language="fr" value="REEL" onChange={() => undefined} />);
    const reel = html.slice(html.indexOf('data-post-format-choice="REEL"') - 200, html.indexOf('data-post-format-choice="REEL"'));
    expect(reel).toContain('aria-checked="true"');
  });

  test('les deux cibles tiennent le plancher de 44 px', () => {
    const html = renderToStaticMarkup(<FormatToggle language="fr" value="POST" onChange={() => undefined} />);
    expect(html.match(/min-height:44px/g)?.length).toBe(2);
  });
});

describe('une vignette DIT l’état de son envoi', () => {
  test('prêt : aucun bandeau d’état — seule l’image, et le retrait', () => {
    const html = renderToStaticMarkup(<DraftMediaTile language="fr" item={media()} onRemove={() => undefined} />);
    expect(html).not.toContain('data-post-media-state');
    expect(html).toContain('data-post-media-remove="d1"');
  });

  test('en vol : le bandeau le dit, sans alarmer', () => {
    const html = renderToStaticMarkup(<DraftMediaTile language="fr" item={media({ upload: { phase: 'sending' } })} onRemove={() => undefined} />);
    expect(html).toContain('data-post-media-state="sending"');
    expect(html).toContain('Envoi');
  });

  /* Un envoi raté ne se tait pas : sans ce bandeau, la publication partirait
     amputée d'un média que l'auteur croit joint. */
  test('échoué : le bandeau le dit, et il est ROUGE', () => {
    const html = renderToStaticMarkup(<DraftMediaTile language="fr" item={media({ upload: { phase: 'failed' } })} onRemove={() => undefined} />);
    expect(html).toContain('data-post-media-state="failed"');
    expect(html).toContain('var(--color-error)');
  });

  test('une vidéo se prévisualise en `video`, une image en `img`', () => {
    const image = renderToStaticMarkup(<DraftMediaTile language="fr" item={media()} onRemove={() => undefined} />);
    const video = renderToStaticMarkup(
      <DraftMediaTile language="fr" item={media({ mimeType: 'video/mp4' })} onRemove={() => undefined} />,
    );
    expect(image).toContain('<img');
    expect(video).toContain('<video');
  });
});

describe('l’en-tête ramène au Flux', () => {
  test('le retour vise /feed, pas la liste des conversations', () => {
    const html = renderToStaticMarkup(<PostComposeHeader language="fr" title="Nouvelle publication" />);
    expect(html).toContain('href="/feed"');
    expect(html).toContain('Nouvelle publication');
  });
});
