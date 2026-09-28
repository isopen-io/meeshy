import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import type { PostComment } from '@/lib/api/publication-comments';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { CommentReplyTarget } from '@/lib/view/comment-reply-target';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CommentComposer } from './comment-composer';
import { CommentRow, type CommentGestureHandlers } from './comment-row';
import { CommentSwipe } from './comment-swipe';

/**
 * **GLISSER UN COMMENTAIRE POUR Y RÉPONDRE, ET LE LIRE AVEC SES EFFETS**
 * (#8583, directive porteur du 2026-09-28) — ce que la RANGÉE fait, montée en
 * DOM réel : le glissé vers la droite et le bouton « Répondre » appellent le
 * MÊME rappel avec la même cible ; un commentaire flouté est voilé jusqu'au
 * toucher ; un commentaire à effet monte l'hôte des effets des messages ; le
 * composeur annonce la cible, prend le focus et préremplit la @mention.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root !== undefined) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

async function monter(node: React.ReactElement): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  return container;
}

const pointer = (type: string, x: number, y: number, pointerType = 'touch') =>
  new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 7, pointerType, isPrimary: true });

/** Un glissé du doigt, point par point — la rangée suit chaque `pointermove`. */
async function glisser(surface: Element, path: readonly (readonly [number, number])[], pointerType = 'touch'): Promise<void> {
  const [first, ...rest] = path;
  if (first === undefined) return;
  await act(async () => surface.dispatchEvent(pointer('pointerdown', first[0], first[1], pointerType)));
  for (const [x, y] of rest) await act(async () => surface.dispatchEvent(pointer('pointermove', x, y, pointerType)));
  const last = rest[rest.length - 1] ?? first;
  await act(async () => surface.dispatchEvent(pointer('pointerup', last[0], last[1], pointerType)));
}

const NOW = new Date('2026-09-28T12:00:00.000Z');

const comment = (patch: Partial<PostComment> = {}): PostComment => ({
  id: 'c1',
  content: 'Bonjour à tous',
  createdAt: '2026-09-28T11:58:00.000Z',
  author: { id: 'u1', displayName: 'Noa Berger', username: 'noa' },
  ...patch,
});

const gestesDe = (patch: Partial<CommentGestureHandlers> = {}): CommentGestureHandlers & { readonly journal: string[] } => {
  const journal: string[] = [];
  return {
    journal,
    viewerId: 'u-moi',
    onLike: (id, on, parentId) => journal.push(`like:${id}:${on ? 'on' : 'off'}${parentId === undefined ? '' : `:${parentId}`}`),
    onEdit: (id, content) => journal.push(`edit:${id}:${content}`),
    onDelete: (id, parentId) => journal.push(`delete:${id}${parentId === undefined ? '' : `:${parentId}`}`),
    failureOf: () => undefined,
    onRetryGesture: (id) => journal.push(`retry:${id}`),
    busyOf: () => false,
    ...patch,
  };
};

const rangee = (c: PostComment, gestures?: CommentGestureHandlers) => (
  <ul>
    <CommentRow
      comment={c}
      language="fr"
      preferredLanguages={['fr']}
      locale="fr-FR"
      now={NOW}
      {...(gestures === undefined ? {} : { gestures })}
    />
  </ul>
);

describe('CommentSwipe — la loi d’iOS sous le doigt', () => {
  test('au-delà de 66 px vers la droite, relâcher RÉPOND — une fois', async () => {
    let replies = 0;
    const host = await monter(<CommentSwipe onReply={() => (replies += 1)}><p>texte</p></CommentSwipe>);
    const surface = host.querySelector('[data-comment-swipe]');
    if (surface === null) throw new Error('surface absente');
    await act(async () => surface.dispatchEvent(pointer('pointerdown', 10, 10)));
    await act(async () => surface.dispatchEvent(pointer('pointermove', 90, 12)));
    expect(host.querySelector('[data-comment-swipe-indicator]')?.getAttribute('data-comment-swipe-indicator')).toBe('armed');
    await act(async () => surface.dispatchEvent(pointer('pointerup', 90, 12)));
    expect(replies).toBe(1);
    expect(host.querySelector('[data-comment-swipe-indicator]')).toBeNull();
  });

  test('relâché AVANT le seuil, le geste s’annule et la rangée revient au repos', async () => {
    let replies = 0;
    const host = await monter(<CommentSwipe onReply={() => (replies += 1)}><p>texte</p></CommentSwipe>);
    const surface = host.querySelector('[data-comment-swipe]');
    if (surface === null) throw new Error('surface absente');
    await glisser(surface, [[10, 10], [60, 10]]);
    expect(replies).toBe(0);
    expect(host.querySelector<HTMLElement>('[data-comment-swipe-content]')?.style.transform ?? '').toBe('');
  });

  test('un glissé VERTICAL appartient au défilement : rien ne bouge', async () => {
    let replies = 0;
    const host = await monter(<CommentSwipe onReply={() => (replies += 1)}><p>texte</p></CommentSwipe>);
    const surface = host.querySelector('[data-comment-swipe]');
    if (surface === null) throw new Error('surface absente');
    await act(async () => surface.dispatchEvent(pointer('pointerdown', 10, 10)));
    await act(async () => surface.dispatchEvent(pointer('pointermove', 90, 60)));
    expect(host.querySelector('[data-comment-swipe-indicator]')).toBeNull();
    await act(async () => surface.dispatchEvent(pointer('pointerup', 90, 60)));
    expect(replies).toBe(0);
    expect((surface as HTMLElement).style.touchAction).toBe('pan-y');
  });

  test('vers la GAUCHE, rien : un commentaire n’a qu’une action', async () => {
    let replies = 0;
    const host = await monter(<CommentSwipe onReply={() => (replies += 1)}><p>texte</p></CommentSwipe>);
    const surface = host.querySelector('[data-comment-swipe]');
    if (surface === null) throw new Error('surface absente');
    await glisser(surface, [[200, 10], [100, 10]]);
    expect(replies).toBe(0);
  });

  test('une SOURIS qui glisse sélectionne du texte, elle ne répond pas', async () => {
    let replies = 0;
    const host = await monter(<CommentSwipe onReply={() => (replies += 1)}><p>texte</p></CommentSwipe>);
    const surface = host.querySelector('[data-comment-swipe]');
    if (surface === null) throw new Error('surface absente');
    await glisser(surface, [[10, 10], [120, 10]], 'mouse');
    expect(replies).toBe(0);
  });

  test('le clic qui SUIT un glissé est avalé — lâcher sur un bouton ne l’actionne pas', async () => {
    let clicks = 0;
    const host = await monter(
      <CommentSwipe onReply={() => undefined}>
        <button type="button" data-cible onClick={() => (clicks += 1)}>cœur</button>
      </CommentSwipe>,
    );
    const surface = host.querySelector('[data-comment-swipe]');
    const bouton = host.querySelector<HTMLButtonElement>('[data-cible]');
    if (surface === null || bouton === null) throw new Error('montage incomplet');
    await glisser(surface, [[10, 10], [100, 10]]);
    await act(async () => bouton.click());
    expect(clicks).toBe(0);
    await act(async () => bouton.click());
    expect(clicks).toBe(1);
  });

  test('sans rappel, aucune surface de glissé n’est montée', async () => {
    const host = await monter(<CommentSwipe onReply={undefined}><p>texte</p></CommentSwipe>);
    expect(host.querySelector('[data-comment-swipe]')).toBeNull();
    expect(host.textContent).toBe('texte');
  });
});

describe('CommentRow — deux portes, un seul geste de réponse', () => {
  test('« Répondre » appelle le rappel avec la cible composée', async () => {
    const cibles: CommentReplyTarget[] = [];
    const host = await monter(rangee(comment(), gestesDe({ onReply: (cible) => cibles.push(cible) })));
    const bouton = host.querySelector<HTMLButtonElement>('[data-comment-gesture="reply"]');
    expect(bouton?.textContent).toBe('Répondre');
    await act(async () => bouton?.click());
    expect(cibles).toEqual([{ commentId: 'c1', rootId: 'c1', authorName: 'Noa Berger', excerpt: 'Bonjour à tous', mention: null }]);
  });

  test('glisser la rangée à droite rend EXACTEMENT la même cible', async () => {
    const cibles: CommentReplyTarget[] = [];
    const host = await monter(rangee(comment({ id: 'r1', parentId: 'c1' }), gestesDe({ onReply: (cible) => cibles.push(cible) })));
    const surface = host.querySelector('[data-comment-row="r1"] [data-comment-swipe]');
    if (surface === null) throw new Error('la rangée ne glisse pas');
    await glisser(surface, [[10, 10], [40, 10], [100, 11]]);
    expect(cibles).toEqual([{ commentId: 'r1', rootId: 'c1', authorName: 'Noa Berger', excerpt: 'Bonjour à tous', mention: '@noa ' }]);
  });

  test('sans `onReply` (visiteur anonyme, ancien hôte) : ni bouton ni glissé', async () => {
    const host = await monter(rangee(comment(), gestesDe()));
    expect(host.querySelector('[data-comment-gesture="reply"]')).toBeNull();
    expect(host.querySelector('[data-comment-swipe]')).toBeNull();
  });

  test('une rangée EN VOL ne se répond pas : la passerelle ne connaît pas son id', async () => {
    const host = await monter(rangee(comment({ pending: true }), gestesDe({ onReply: () => undefined })));
    expect(host.querySelector('[data-comment-gesture="reply"]')).toBeNull();
    expect(host.querySelector('[data-comment-swipe]')).toBeNull();
  });

  test('les gestes d’une RÉPONSE portent sa racine', async () => {
    const gestes = gestesDe({ onReply: () => undefined });
    const host = await monter(rangee(comment({ id: 'r1', parentId: 'c1' }), gestes));
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-gesture="like"]')?.click());
    expect(gestes.journal).toEqual(['like:r1:on:c1']);
  });
});

describe('les effets d’un commentaire — ceux d’un message, par le même rendu', () => {
  test('un commentaire FLOUTÉ est voilé : son texte n’entre pas dans le DOM avant le toucher', async () => {
    const host = await monter(rangee(comment({ effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED })));
    const voile = host.querySelector<HTMLButtonElement>('[data-protected="hidden"]');
    expect(voile?.getAttribute('aria-label')).toBe('Contenu masqué');
    expect(host.textContent).not.toContain('Bonjour à tous');
    await act(async () => voile?.click());
    expect(host.querySelector('[data-protected="revealed"]')?.textContent).toContain('Bonjour à tous');
  });

  test('le voile est un bouton : Entrée et Espace le révèlent au clavier', async () => {
    const host = await monter(rangee(comment({ effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED })));
    expect(host.querySelector('[data-protected="hidden"]')?.tagName).toBe('BUTTON');
  });

  test('un commentaire à HALO monte l’hôte des effets ; un commentaire sans effet n’en paie aucun', async () => {
    const avec = await monter(rangee(comment({ effectFlags: MESSAGE_EFFECT_FLAGS.GLOW })));
    expect(avec.querySelector('[data-comment-row] [data-effects-host]')).not.toBeNull();
    await act(async () => root?.unmount());
    root = undefined;
    const sans = await monter(rangee(comment({ id: 'c2' })));
    expect(sans.querySelector('[data-effects-host]')).toBeNull();
  });

  test('répondre à un commentaire flouté ne prête pas son texte au bandeau', async () => {
    const cibles: CommentReplyTarget[] = [];
    const host = await monter(
      rangee(comment({ effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED }), gestesDe({ onReply: (cible) => cibles.push(cible) })),
    );
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-gesture="reply"]')?.click());
    expect(cibles[0]?.excerpt).toBeNull();
  });
});

describe('CommentComposer — la cible s’annonce, le champ prend la main', () => {
  const cible = (patch: Partial<CommentReplyTarget> = {}): CommentReplyTarget => ({
    commentId: 'c1',
    rootId: 'c1',
    authorName: 'Noa Berger',
    excerpt: 'Bonjour à tous',
    mention: null,
    ...patch,
  });

  const composeur = (replyTo: CommentReplyTarget | null, onCancelReply: () => void = () => undefined) => (
    <CommentComposer
      language="fr"
      canWrite
      onSend={() => Promise.resolve({ ok: true })}
      replyTo={replyTo}
      onCancelReply={onCancelReply}
    />
  );

  test('le bandeau « Répondre à X » cite le texte visé, et le champ a le focus', async () => {
    const host = await monter(composeur(cible()));
    const bandeau = host.querySelector('[data-comment-reply-banner="c1"]');
    expect(bandeau?.textContent).toContain('Répondre à Noa Berger');
    expect(bandeau?.textContent).toContain('Bonjour à tous');
    expect(document.activeElement).toBe(host.querySelector('[data-comment-field]'));
  });

  test('répondre à une réponse préremplit la @mention ; revenir à une racine la retire', async () => {
    const host = await monter(composeur(cible({ commentId: 'r1', mention: '@noa ' })));
    expect(host.querySelector<HTMLTextAreaElement>('[data-comment-field]')?.value).toBe('@noa ');
    await act(async () => root?.render(composeur(cible())));
    expect(host.querySelector<HTMLTextAreaElement>('[data-comment-field]')?.value).toBe('');
  });

  test('le × annule la réponse', async () => {
    let annule = 0;
    const host = await monter(composeur(cible(), () => (annule += 1)));
    const croix = host.querySelector<HTMLButtonElement>('[data-comment-reply-cancel]');
    expect(croix?.getAttribute('aria-label')).toBe('Annuler la réponse');
    await act(async () => croix?.click());
    expect(annule).toBe(1);
  });

  test('sans cible, aucun bandeau', async () => {
    const host = await monter(composeur(null));
    expect(host.querySelector('[data-comment-reply-banner]')).toBeNull();
  });
});
