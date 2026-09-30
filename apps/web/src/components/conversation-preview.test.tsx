import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { RICH_TEXT_DIRECT } from '@/lib/api/fixtures-rich-text';
import { loadNotificationRowCatalog } from '@/lib/i18n-notification-row-catalog';
import { closeConversationPreview, conversationPreviewStore } from '@/lib/notifications/conversation-preview';
import type { NotificationRecord } from '@/lib/notifications/record';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConversationPreviewSheet } from './conversation-preview-sheet';
import { NotificationBanner } from './notification-toast';
import { ThreadHeader } from './thread-header';
import { ThreadError, ThreadRefused, ThreadSkeleton } from './thread-states';

/**
 * **TIRER LA BANNIÈRE VERS LE BAS OUVRE L'APERÇU DE LA CONVERSATION** (#8821,
 * jumelle de `RootNotificationToastOverlay` iOS) — exigence porteur du
 * 2026-09-30 : « lorsqu'on ouvre l'aperçu, il faut absolument pouvoir scroller
 * dans la conversation et afficher tout le header de la conversation dans son
 * bloc de verre Liquid Glass sans (<) ! »
 *
 * Trois choses se mesurent ici : le GESTE (doigt, souris, clavier) pose la
 * conversation à prévisualiser ; l'en-tête de l'aperçu est l'en-tête COMPLET
 * du fil — identité ET actions, dans son verre — sans chevron retour ; la
 * feuille se ferme par le geste inverse, hors d'elle ou par Échap, et mène à
 * la conversation complète.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/c' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadNotificationRowCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  closeConversationPreview();
});

const record = (partial: Partial<NotificationRecord> = {}): NotificationRecord => ({
  id: 'n1',
  type: 'new_message',
  title: 'Grace',
  content: 'On se voit demain ?',
  actor: { id: 'u-grace', username: 'grace', displayName: 'Grace', avatar: null },
  context: { conversationId: 'c1', conversationTitle: 'Les amateurs', conversationType: 'group' },
  metadata: {},
  state: { isRead: false, createdAt: '2026-09-30T09:59:58.000Z' },
  ...partial,
});

const pointer = (type: string, clientY: number) => new PointerEvent(type, { bubbles: true, button: 0, clientX: 40, clientY, pointerId: 1 });

async function drag(element: Element, from: number, to: number): Promise<void> {
  await act(async () => {
    element.dispatchEvent(pointer('pointerdown', from));
    element.dispatchEvent(pointer('pointermove', (from + to) / 2));
    element.dispatchEvent(pointer('pointermove', to));
    element.dispatchEvent(pointer('pointerup', to));
  });
  await mounter.settle();
}

describe('le geste de la bannière', () => {
  test('tirée vers le BAS, elle ouvre l’aperçu de SA conversation et s’efface', async () => {
    const dismissed: string[] = [];
    const host = await mounter.mount(<NotificationBanner notification={record()} onDismiss={() => dismissed.push('x')} />);
    const card = document.querySelector('[data-in-app-banner] > div');
    if (card === null) throw new Error('carte absente');
    await drag(card, 10, 80);
    expect(conversationPreviewStore.getState().conversationId).toBe('c1');
    expect(dismissed.length).toBe(1);
    expect(host).toBeDefined();
  });

  test('à la souris, le lien ne se glisse pas — sans quoi le navigateur annule le geste', async () => {
    await mounter.mount(<NotificationBanner notification={record()} onDismiss={() => undefined} />);
    expect(document.querySelector('[data-in-app-banner] a[href="/c/c1"]')?.getAttribute('draggable')).toBe('false');
  });

  test('à la souris, la carte CAPTURE le pointeur : relâché sous elle, le geste aboutit quand même', async () => {
    await mounter.mount(<NotificationBanner notification={record()} onDismiss={() => undefined} />);
    const card = document.querySelector<HTMLElement>('[data-in-app-banner] > div');
    if (card === null) throw new Error('carte absente');
    const captured: number[] = [];
    card.setPointerCapture = (pointerId: number) => {
      captured.push(pointerId);
    };
    await drag(card, 10, 80);
    expect(captured).toEqual([1]);
  });

  test('un tirage trop court ne fait rien', async () => {
    const dismissed: string[] = [];
    await mounter.mount(<NotificationBanner notification={record()} onDismiss={() => dismissed.push('x')} />);
    const card = document.querySelector('[data-in-app-banner] > div');
    if (card === null) throw new Error('carte absente');
    await drag(card, 10, 30);
    expect(conversationPreviewStore.getState().conversationId).toBeNull();
    expect(dismissed.length).toBe(0);
  });

  test('au clavier, Flèche bas sur la bannière ouvre l’aperçu — et le dit', async () => {
    await mounter.mount(<NotificationBanner notification={record()} onDismiss={() => undefined} />);
    const surface = document.querySelector<HTMLElement>('[data-in-app-banner] a[href="/c/c1"]');
    if (surface === null) throw new Error('surface absente');
    expect(surface.getAttribute('aria-keyshortcuts')).toBe('ArrowDown');
    expect(surface.getAttribute('aria-description')).toContain('aperçu');
    await act(async () => {
      surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(conversationPreviewStore.getState().conversationId).toBe('c1');
  });

  test('sans conversation (un post aimé), aucun aperçu ne s’annonce ni ne s’ouvre', async () => {
    await mounter.mount(
      <NotificationBanner notification={record({ type: 'post_like', context: { postId: 'p1' }, metadata: { postPreview: 'Le lac' } })} onDismiss={() => undefined} />,
    );
    const card = document.querySelector('[data-in-app-banner] > div');
    if (card === null) throw new Error('carte absente');
    expect(document.querySelector('[aria-keyshortcuts]')).toBeNull();
    await drag(card, 10, 80);
    expect(conversationPreviewStore.getState().conversationId).toBeNull();
  });
});

describe('l’en-tête de l’aperçu — le COMPLET, sans chevron retour', () => {
  const header = (preview: boolean) =>
    renderToStaticMarkup(
      <ThreadHeader
        title="Kwame"
        accent="#4455ff"
        conversation={RICH_TEXT_DIRECT}
        viewerId="u-viewer"
        group={false}
        otherUnread={3}
        expanded={false}
        onToggleExpanded={() => undefined}
        onOpenDetails={() => undefined}
        currentRowTitle=""
        isAuto
        readingMenuRows={[]}
        onSelectReadingMode={() => undefined}
        onResetReadingModeToAuto={() => undefined}
        {...(preview ? { preview: true } : {})}
      />,
    );

  test('dans le fil, le retour est là et l’identité attend qu’on déplie', () => {
    const html = header(false);
    expect(html).toContain('aria-label="Retour — 3 messages non lus ailleurs"');
    expect(html).not.toContain('Chiffré de bout en bout');
  });

  test('en aperçu : AUCUN retour, et l’identité (nom, sous-titre) avec les actions (recherche) et l’avatar, dans la bande de verre', () => {
    const html = header(true);
    expect(html).not.toContain('Retour');
    expect(html).not.toContain('href="/"');
    expect(html).toContain('Kwame');
    expect(html).toContain('Chiffré de bout en bout');
    expect(html).toContain('aria-label="Rechercher dans la conversation"');
    expect(html).toContain('class="thread-header glass');
    expect(html).toContain('aria-label="Détails de la conversation"');
  });
});

describe('les états du fil en aperçu — chargement, refus, échec : aucun chevron non plus', () => {
  test('le squelette, le refus et l’échec ne portent AUCUN retour, et remplissent la feuille', () => {
    for (const html of [
      renderToStaticMarkup(<ThreadSkeleton preview />),
      renderToStaticMarkup(<ThreadRefused preview />),
      renderToStaticMarkup(<ThreadError preview onRetry={() => undefined} />),
    ]) {
      expect(html).not.toContain('Retour');
      expect(html).not.toContain('h-dvh');
    }
  });

  test('hors aperçu, rien ne change : le retour reste', () => {
    expect(renderToStaticMarkup(<ThreadSkeleton />)).toContain('aria-label="Retour"');
    expect(renderToStaticMarkup(<ThreadRefused />)).toContain('Retour aux conversations');
  });
});

describe('la feuille de l’aperçu', () => {
  const sheet = async (onClose: () => void) =>
    mounter.mount(
      <ConversationPreviewSheet conversationId="c1" onClose={onClose}>
        <main data-stub-thread style={{ overflowY: 'auto' }}>
          fil
        </main>
      </ConversationPreviewSheet>,
    );

  test('une boîte de dialogue MODALE nommée, qui porte le fil et mène à la conversation complète', async () => {
    await sheet(() => undefined);
    const dialog = document.querySelector('[data-conversation-preview="c1"]');
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-label')).toBe('Aperçu de la conversation');
    expect(dialog?.querySelector('[data-stub-thread]')).not.toBeNull();
    const open = dialog?.querySelector('a[href="/c/c1"]');
    expect(open?.getAttribute('aria-label')).toBe('Ouvrir la conversation');
  });

  test('toucher HORS de l’aperçu le ferme', async () => {
    const closed: string[] = [];
    await sheet(() => closed.push('x'));
    await mounter.click(document.querySelector<HTMLElement>('[data-preview-scrim]'));
    expect(closed.length).toBe(1);
  });

  test('Échap et la croix le ferment', async () => {
    const closed: string[] = [];
    await sheet(() => closed.push('x'));
    await act(async () => {
      document.querySelector('[data-conversation-preview]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await mounter.click(document.querySelector<HTMLElement>('[data-preview-close]'));
    expect(closed.length).toBe(2);
  });

  test('le geste INVERSE — la poignée tirée vers le bas — le ferme ; un tirage court, non', async () => {
    const closed: string[] = [];
    await sheet(() => closed.push('x'));
    const grabber = document.querySelector('[data-preview-grabber]');
    if (grabber === null) throw new Error('poignée absente');
    await drag(grabber, 10, 40);
    expect(closed.length).toBe(0);
    await drag(grabber, 10, 200);
    expect(closed.length).toBe(1);
  });

  test('le focus entre dans l’aperçu à l’ouverture', async () => {
    await sheet(() => undefined);
    expect(document.activeElement?.closest('[data-conversation-preview]')).not.toBeNull();
  });
});
