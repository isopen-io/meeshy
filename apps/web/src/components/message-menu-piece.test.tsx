import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import { messageMenuItems, translationChoices } from '@/lib/view/message-actions';
import { pieceMenuItems, type PieceActionId } from '@/lib/view/message-piece';
import { piecePositionLabel } from '@/lib/view/use-piece-menu';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MessageMenu, type MessageMenuTarget } from './message-menu';

/**
 * #9907, #9908 — LE MENU QUI VISE UNE PIÈCE. L'aperçu est la pièce seule, à
 * son ratio (`contain`), dans un défilement vers les autres pièces, avec
 * « 3/7 » ; les flèches du clavier et les boutons changent la pièce ; la liste
 * est celle de la pièce, et « Tout le message » rend le menu du message.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadInterfaceCatalog('fr'), loadMessagePiecesCatalog('fr')]);
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const piece = (id: string, partial: Partial<Attachment> = {}): Attachment =>
  ({
    ...attachmentDefaults,
    id,
    messageId: 'm2',
    fileName: `${id}.jpg`,
    originalName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    fileSize: 1,
    fileUrl: `https://cdn.meeshy.me/${id}.jpg`,
    uploadedBy: 'u-moi',
    createdAt: '2026-10-10T09:00:00.000Z',
    width: 1200,
    height: 900,
    ...partial,
  }) as Attachment;

const PIECES = Array.from({ length: 7 }, (_, i) => piece(`a-${i + 1}`));

type Journal = { actions: PieceActionId[]; whole: number };

function Harness({ journal, start }: { readonly journal: Journal; readonly start: number }) {
  const [index, setIndex] = useState(start);
  const [pieceMode, setPieceMode] = useState(true);
  const [target, setTarget] = useState<MessageMenuTarget | null>(null);
  const items = messageMenuItems({ hasText: true, isProtected: false, languageCount: 1, canForward: true });
  return (
    <div>
      <div
        data-row="m2"
        tabIndex={0}
        onContextMenu={(event) => {
          event.preventDefault();
          setTarget({ messageId: 'm2', element: event.currentTarget, isMine: true });
        }}
      >
        <p>les photos</p>
      </div>
      {target === null ? null : (
        <MessageMenu
          target={target}
          items={items}
          choices={translationChoices({ message: { originalLanguage: 'fr', translations: [] }, preferredLanguages: ['fr'], servedLanguage: 'fr' })}
          subjectLabel="Actions du message"
          onClose={() => setTarget(null)}
          onReact={() => {}}
          onExpandReactions={() => {}}
          onAction={() => {}}
          onPickLanguage={() => {}}
          {...(pieceMode
            ? {
                piece: {
                  data: {
                    pieces: PIECES,
                    index,
                    items: pieceMenuItems({ offers: { save: true, react: true, reply: true, compose: false, share: true }, deletable: true }),
                    canReact: true,
                    positionLabel: piecePositionLabel(PIECES[index]!, index, PIECES.length),
                  },
                  onIndex: setIndex,
                  onWholeMessage: () => {
                    journal.whole += 1;
                    setPieceMode(false);
                  },
                  onAction: (id) => journal.actions.push(id),
                },
              }
            : {})}
        />
      )}
    </div>
  );
}

function open(start = 2): Journal {
  const journal: Journal = { actions: [], whole: 0 };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Harness journal={journal} start={start} />));
  act(() => {
    container.querySelector('[data-row="m2"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });
  return journal;
}

const listLabels = (): readonly (string | null)[] =>
  Array.from(document.querySelectorAll('.message-menu-list [role="menuitem"]')).map((b) => b.textContent);

const keyOnMenu = (key: string) => {
  act(() => {
    document.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
  });
};

describe('MessageMenu — l’aperçu d’une pièce (#9907)', () => {
  test('la pièce visée seule, « 3/7 », et aucun clone de la rangée', () => {
    open(2);
    expect(document.querySelector('[data-message-menu-pieces-indicator]')?.textContent).toBe('3/7');
    expect(document.querySelector('[data-message-menu-piece][data-current]')?.getAttribute('data-message-menu-piece')).toBe('a-3');
    expect(document.querySelector('[data-message-preview]')).toBeNull();
    expect(document.querySelector('[role="status"]')?.textContent).toBe('Photo 3 sur 7');
  });

  test('la pièce garde son ratio : `object-fit: contain`, jamais `cover`', () => {
    open(2);
    const img = document.querySelector<HTMLImageElement>('[data-message-menu-piece="a-3"] img')!;
    expect(img.style.objectFit).toBe('contain');
  });

  test('les flèches du clavier défilent les pièces, sans sortir du lot', () => {
    open(0);
    keyOnMenu('ArrowLeft');
    expect(document.querySelector('[data-message-menu-pieces-indicator]')?.textContent).toBe('1/7');
    keyOnMenu('ArrowRight');
    keyOnMenu('ArrowRight');
    expect(document.querySelector('[data-message-menu-pieces-indicator]')?.textContent).toBe('3/7');
  });

  test('les boutons : pas de « précédent » sur la première, « suivant » avance', () => {
    open(0);
    expect(document.querySelector('[data-message-menu-piece-step="start"]')).toBeNull();
    const next = document.querySelector<HTMLButtonElement>('[data-message-menu-piece-step="end"]')!;
    expect(next.getAttribute('aria-label')).toBe('Média suivant');
    act(() => next.click());
    expect(document.querySelector('[data-message-menu-pieces-indicator]')?.textContent).toBe('2/7');
  });

  test('le menu se nomme par la pièce visée', () => {
    open(2);
    expect(document.querySelector('[role="menu"]')?.getAttribute('aria-label')).toBe('Photo 3 sur 7, Actions du message');
  });
});

describe('MessageMenu — les actions d’une pièce (#9908)', () => {
  test('la liste est celle de la pièce, « Tout le message » en dernier', () => {
    open(2);
    expect(listLabels()).toEqual(['Répondre à ce média', 'Enregistrer ce média', 'Transférer ce média', 'Supprimer ce média', 'Tout le message']);
  });

  test('« Supprimer ce média » rend l’action de la pièce', () => {
    const journal = open(2);
    act(() => document.querySelector<HTMLButtonElement>('[data-action="pieceDelete"]')!.click());
    expect(journal.actions).toEqual(['pieceDelete']);
  });

  test('« Tout le message » rend le menu du message sans fermer le cluster', () => {
    const journal = open(2);
    act(() => document.querySelector<HTMLButtonElement>('[data-action="wholeMessage"]')!.click());
    expect(journal.whole).toBe(1);
    expect(document.querySelectorAll('[role="menu"]').length).toBe(1);
    expect(listLabels()).toContain('Sélectionner');
    expect(document.querySelector('[data-message-menu-pieces]')).toBeNull();
  });
});
