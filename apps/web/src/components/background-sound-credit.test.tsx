import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { parseCanvasDocument, type CanvasDocument } from '@/lib/canvas/document';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { BackgroundSoundCredit } from './background-sound-credit';

/**
 * LE CRÉDIT DU SON DE FOND (#9678, miroir `BackgroundSoundBadge`) — un emprunt
 * à la bibliothèque DÉFILE « titre · @auteur » sur UNE ligne s'il dépasse, la
 * piste originale montre la note et une sinusoïde, et le lecteur d'écran lit le
 * texte entier UNE fois.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

/** Ce qu'un lecteur d'écran prononce : le texte, sans ce qui est `aria-hidden`. */
function spoken(node: Node | null | undefined): string {
  if (node === null || node === undefined) return '';
  if (node.nodeType === 3) return node.textContent ?? '';
  if (node instanceof Element && node.getAttribute('aria-hidden') === 'true') return '';
  if (node instanceof Element && node.getAttribute('aria-label') !== null) return node.getAttribute('aria-label') ?? '';
  return [...node.childNodes].map(spoken).join('');
}

function sceneWith(payload: Record<string, unknown> | null): CanvasDocument {
  const objects =
    payload === null
      ? []
      : [
          {
            id: 'bgsound',
            kind: 'audio',
            anchor: { t: 'free', x: 0.5, y: 0.5 },
            plane: 'bg',
            z: 0,
            transform: { scale: 1, rotation: 0, opacity: 1 },
            payload: { isBackground: true, mediaURL: 'a.m4a', ...payload },
          },
        ];
  const doc = parseCanvasDocument({ v: 3, scenes: [{ id: 's1', objects }] });
  if (doc === null) throw new Error('vecteur de test invalide');
  return doc;
}

const overflowing = () => ({ contentWidth: 300, boxWidth: 160 });
const fitting = () => ({ contentWidth: 80, boxWidth: 160 });

describe('BackgroundSoundCredit', () => {
  test('sans document (story v1) ⇒ rien n’est rendu', async () => {
    await act(async () => root.render(<BackgroundSoundCredit document={null} language="fr" surface="media" />));
    expect(container.querySelector('[data-sound-credit]')).toBeNull();
  });

  test('sans piste ⇒ rien n’est rendu', async () => {
    await act(async () => root.render(<BackgroundSoundCredit document={sceneWith(null)} language="fr" surface="card" />));
    expect(container.querySelector('[data-sound-credit]')).toBeNull();
  });

  test('la piste originale ⇒ la note et la sinusoïde, nommées « Son original »', async () => {
    await act(async () => root.render(<BackgroundSoundCredit document={sceneWith({ name: 'Ma voix' })} language="fr" surface="card" />));
    const badge = container.querySelector('[data-sound-credit="original"]');
    expect(spoken(badge)).toBe('Son original');
    expect(badge?.querySelector('[data-sound-wave]')).not.toBeNull();
    expect(badge?.textContent).not.toContain('·');
  });

  test('un emprunt qui DÉPASSE défile : deux copies, la seconde cachée au lecteur d’écran', async () => {
    await act(async () =>
      root.render(
        <BackgroundSoundCredit
          document={sceneWith({ soundId: 'snd1', name: 'Pluie en forêt', soundAuthorUsername: 'sam' })}
          language="fr"
          surface="media"
          measure={overflowing}
          reducedMotion={() => false}
        />,
      ),
    );
    const badge = container.querySelector('[data-sound-credit="credit"]');
    expect(badge?.getAttribute('data-sound-marquee')).toBe('scroll');
    expect(spoken(badge).replace(/\s+/g, ' ').trim()).toBe('Son : Pluie en forêt · @sam');
    const copies = [...(badge?.querySelectorAll('[data-sound-copy]') ?? [])];
    expect(copies.map((c) => c.textContent)).toEqual(['Pluie en forêt · @sam', 'Pluie en forêt · @sam']);
    expect(copies[0]?.getAttribute('aria-hidden')).toBeNull();
    expect(copies[1]?.getAttribute('aria-hidden')).toBe('true');
    expect(badge?.getAttribute('data-sound-cycle')).toBe(`324px/${324 / 28}s`);
  });

  test('un emprunt qui TIENT reste immobile, une seule copie', async () => {
    await act(async () =>
      root.render(<BackgroundSoundCredit document={sceneWith({ soundId: 'snd1', soundAuthorUsername: 'sam' })} language="fr" surface="card" measure={fitting} reducedMotion={() => false} />),
    );
    const badge = container.querySelector('[data-sound-credit="credit"]');
    expect(badge?.getAttribute('data-sound-marquee')).toBe('static');
    expect(badge?.querySelectorAll('[data-sound-copy]').length).toBe(1);
  });

  test('mouvement réduit ⇒ texte statique tronqué, même quand il dépasse', async () => {
    await act(async () =>
      root.render(
        <BackgroundSoundCredit
          document={sceneWith({ soundId: 'snd1', name: 'Un titre très long', soundAuthorUsername: 'auteur' })}
          language="fr"
          surface="media"
          measure={overflowing}
          reducedMotion={() => true}
        />,
      ),
    );
    const badge = container.querySelector('[data-sound-credit="credit"]');
    expect(badge?.getAttribute('data-sound-marquee')).toBe('static');
    expect(badge?.querySelectorAll('[data-sound-copy]').length).toBe(1);
  });

  test('un emprunt sans métadonnées se nomme « Son de la bibliothèque », jamais « ♫ — »', async () => {
    await act(async () => root.render(<BackgroundSoundCredit document={sceneWith({ soundId: 'snd1' })} language="fr" surface="card" measure={fitting} />));
    const badge = container.querySelector('[data-sound-credit="credit"]');
    expect(spoken(badge).trim()).toBe('Son de la bibliothèque');
    expect(badge?.textContent).toContain('♫ —');
  });
});
