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
    expect(badge?.textContent).toContain('—');
    expect(badge?.textContent).not.toContain('♫');
  });
});

/**
 * LA NOTE EST LE CONTRÔLE (#9698, directive porteur 2026-10-08, miroir
 * `BackgroundSoundNote`) — elle précède TOUJOURS le crédit ; quand l'hôte a un
 * son à couper, elle devient le bouton qui le coupe et se BARRE.
 */
describe('BackgroundSoundCredit — la note', () => {
  const borrowed = () => sceneWith({ soundId: 'snd1', name: 'Pluie en forêt', soundAuthorUsername: 'sam' });
  const toggle = () => container.querySelector<HTMLButtonElement>('[data-sound-toggle]');

  test('la note précède le crédit comme la sinusoïde, et n’est pas un bouton sans contrôle', async () => {
    await act(async () => root.render(<BackgroundSoundCredit document={borrowed()} language="fr" surface="card" measure={fitting} />));
    const badge = container.querySelector('[data-sound-credit="credit"]');
    expect(badge?.firstElementChild?.getAttribute('data-sound-note')).toBe('plain');
    expect(toggle()).toBeNull();
    await act(async () => root.render(<BackgroundSoundCredit document={sceneWith({})} language="fr" surface="card" />));
    expect(container.querySelector('[data-sound-credit="original"] [data-sound-note="plain"]')).not.toBeNull();
    expect(toggle()).toBeNull();
  });

  test('avec un contrôle, la note est un bouton « Couper le son de fond » non enfoncé, et le toucher appelle l’hôte sans remonter au plateau', async () => {
    let toggles = 0;
    let bubbled = 0;
    await act(async () =>
      root.render(
        <div onClick={() => (bubbled += 1)}>
          <BackgroundSoundCredit document={borrowed()} language="fr" surface="media" measure={fitting} control={{ muted: false, onToggle: () => (toggles += 1) }} />
        </div>,
      ),
    );
    const button = toggle();
    expect(button?.tagName).toBe('BUTTON');
    expect(button?.getAttribute('type')).toBe('button');
    expect(button?.getAttribute('aria-pressed')).toBe('false');
    expect(button?.getAttribute('aria-label')).toBe('Couper le son de fond');
    expect(button?.querySelector('[data-sound-note="plain"]')).not.toBeNull();
    await act(async () => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(toggles).toBe(1);
    expect(bubbled).toBe(0);
    expect(spoken(container.querySelector('[data-sound-credit="credit"]'))).toContain('Son : Pluie en forêt · @sam');
  });

  test('coupé ⇒ la note est BARRÉE, le bouton enfoncé se nomme « Réactiver le son de fond », le crédit se fige', async () => {
    await act(async () =>
      root.render(
        <BackgroundSoundCredit
          document={borrowed()}
          language="fr"
          surface="media"
          measure={overflowing}
          reducedMotion={() => false}
          control={{ muted: true, onToggle: () => undefined }}
        />,
      ),
    );
    const button = toggle();
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    expect(button?.getAttribute('aria-label')).toBe('Réactiver le son de fond');
    expect(button?.querySelector('[data-sound-note="barred"] [data-sound-bar]')).not.toBeNull();
    const badge = container.querySelector('[data-sound-credit="credit"]');
    expect(badge?.getAttribute('data-sound-marquee')).toBe('static');
    expect(badge?.querySelectorAll('[data-sound-copy]').length).toBe(1);
  });

  test('la piste originale porte le même bouton, et reste nommée « Son original »', async () => {
    await act(async () =>
      root.render(<BackgroundSoundCredit document={sceneWith({})} language="fr" surface="media" control={{ muted: true, onToggle: () => undefined }} />),
    );
    const badge = container.querySelector('[data-sound-credit="original"]');
    expect(badge?.getAttribute('role')).toBeNull();
    expect(badge?.querySelector('[data-sound-toggle]')?.getAttribute('aria-label')).toBe('Réactiver le son de fond');
    expect(badge?.querySelector('[data-sound-note="barred"]')).not.toBeNull();
    expect(badge?.textContent).toContain('Son original');
  });

  test('sans titre, le crédit dit la date du son dans la langue du lecteur', async () => {
    await act(async () =>
      root.render(
        <BackgroundSoundCredit
          document={sceneWith({ soundId: 'snd1', soundAuthorUsername: 'sam', soundCreatedAt: '2026-03-12T12:00:00.000Z' })}
          language="fr"
          surface="card"
          measure={fitting}
        />,
      ),
    );
    expect(container.querySelector('[data-sound-copy]')?.textContent).toBe('@sam · 12 mars 2026');
  });
});
