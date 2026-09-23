import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { appQueryClient } from '@/lib/api/query-client';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { messageMenuItems } from '@/lib/view/message-actions';
import { useLongPress } from '@/lib/view/long-press';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MessageMenu, type MessageMenuTarget } from './message-menu';
import { MessageDetailSheet } from './message-detail-sheet';

/**
 * « PLUS… » OUVRE LA FICHE (#7527) — le geste de bout en bout, tel que
 * `routes/thread.tsx` le câble : le menu pose `detailFor` puis se ferme, et
 * la feuille se monte dans le MÊME commit. Sur staging, rien n'apparaissait :
 * les deux couches s'échangeaient leur entrée d'historique, et le `popstate`
 * que le menu produisait en se retirant refermait la feuille qui venait de
 * naître (`use-back-dismiss.ts`, § « une couche qui en remplace une autre »).
 *
 * LE RETOUR EST DIFFÉRÉ ICI comme le navigateur le diffère (HTML, « traverse
 * the history by a delta » poste la tâche) : happy-dom dispatche `popstate`
 * PENDANT `history.back()`, ce qui referme la fenêtre où le défaut vit. Un
 * témoin qui garderait le comportement de happy-dom verdirait sur le défaut.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  appQueryClient.clear();
});

/** Le câblage de `thread.tsx` réduit à ce que le geste traverse : une rangée
 * qui ouvre le menu, le menu, et la feuille qu'il demande. */
function Harness() {
  const [target, setTarget] = useState<MessageMenuTarget | null>(null);
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const longPress = useLongPress({
    onOpen: (anchor) => setTarget({ messageId: 'm1', element: anchor.element, isMine: true }),
  });
  const items = messageMenuItems({ hasText: true, isProtected: false, languageCount: 1 });

  return (
    <div>
      <div data-row="m1" data-message="m1" id="row-m1" tabIndex={0} {...longPress}>
        <p>Bonjour</p>
      </div>
      {target !== null ? (
        <MessageMenu
          target={target}
          items={items}
          choices={[]}
          subjectLabel="Actions du message de Amina Diallo : Bonjour"
          onClose={() => setTarget(null)}
          onReact={() => undefined}
          onExpandReactions={() => undefined}
          onAction={(id) => {
            if (id === 'more') setDetailFor('m1');
          }}
          onPickLanguage={() => undefined}
        />
      ) : null}
      {detailFor !== null ? (
        <MessageDetailSheet
          choices={[]}
          reactions={[]}
          sentAt={new Date('2026-09-22T09:00:00.000Z')}
          delivery={null}
          locale="fr-FR"
          conversationId="c-witness"
          messageId={detailFor}
          attachments={[]}
          onPickLanguage={() => undefined}
          onClose={() => setDetailFor(null)}
        />
      ) : null}
    </div>
  );
}

async function withDeferredBack(run: () => Promise<void>): Promise<void> {
  const original = window.history.back.bind(window.history);
  window.history.back = () => {
    original();
    setTimeout(() => window.dispatchEvent(new PopStateEvent('popstate')), 0);
  };
  try {
    await run();
  } finally {
    window.history.back = original;
  }
}

/** Le geste d'ouverture, patron `message-menu.test.tsx` : `contextmenu` est
 * l'appui long du navigateur (et la touche ContextMenu au clavier). */
function openMenu(row: HTMLElement): void {
  act(() => {
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });
}

describe('« Plus… » ouvre la fiche du message et elle RESTE ouverte (#7527)', () => {
  test('appui long puis « Plus… » ⇒ une feuille est dans le DOM après le retour différé du menu', async () => {
    await withDeferredBack(async () => {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      act(() => {
        root.render(
          <QueryClientProvider client={appQueryClient}>
            <Harness />
          </QueryClientProvider>,
        );
      });

      const row = container.querySelector<HTMLElement>('[data-row="m1"]');
      expect(row).not.toBeNull();
      if (row === null) return;
      openMenu(row);

      const more = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
        (button) => button.textContent?.includes('Plus'),
      );
      expect(more === undefined ? 'absente' : 'présente').toBe('présente');
      act(() => {
        more?.click();
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      expect(document.querySelector('dialog') === null ? 'fermée' : 'ouverte').toBe('ouverte');
    });
  });
});
