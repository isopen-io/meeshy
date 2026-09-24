import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { appQueryClient } from '@/lib/api/query-client';
import { attachmentDefaults, message, translation } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadMessageSheets, type ThreadSheetsMenu } from './thread-sheets';

/**
 * LES FEUILLES DU MESSAGE (#7429, extrait de `routes/thread.tsx`) — chaque
 * témoin vise un EFFET observable (ce qui se monte, ce qu'un geste appelle et
 * dans quel ordre), jamais un chemin d'arbre.
 *
 * LA FICHE D'UN MESSAGE DU LECTEUR : c'est la SEULE forme qui fait descendre
 * les pièces jointes jusqu'au DOM (`MessageDetailSheet` ne les remet qu'à
 * « Infos du message », monté sous `delivery !== null` et un identifiant
 * SERVEUR). Un message d'autrui ne peindrait aucune pièce, vue unique ou
 * non : le différentiel #7580 ne pourrait pas rougir sur lui.
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

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
});

const VIEWER_ID = 'u-viewer';
const SERVER_MESSAGE_ID = '66f0a1b2c3d4e5f6a7b8c9d0';
const ATTACHMENT_ID = 'att-fixture-2';

const photo: Attachment = {
  ...attachmentDefaults,
  id: ATTACHMENT_ID,
  messageId: SERVER_MESSAGE_ID,
  fileName: 'photo.jpg',
  originalName: 'photo.jpg',
  mimeType: 'image/jpeg',
  fileSize: 10,
  fileUrl: 'https://cdn/photo.jpg',
  uploadedBy: VIEWER_ID,
  createdAt: new Date('2026-09-24T09:00:00.000Z').toISOString(),
};

const ownMessage = (overrides: Partial<Message> = {}): Message =>
  message({
    id: SERVER_MESSAGE_ID,
    senderId: VIEWER_ID,
    content: 'salut',
    originalLanguage: 'fr',
    translations: [translation(SERVER_MESSAGE_ID, 'en', 'hi')],
    attachments: [photo],
    createdAt: new Date('2026-09-24T10:00:00.000Z'),
    ...overrides,
  });

/** Le contrôleur, réduit à la part que les feuilles LISENT — rien de ciblé ;
 * chaque test ne pose que la cible et les rappels qu'il observe. */
const menuOf = (overrides: Partial<ThreadSheetsMenu> = {}): ThreadSheetsMenu => ({
  menuTarget: null,
  menuData: undefined,
  onCloseMenu: () => {},
  onMenuReact: () => {},
  onMenuAction: () => {},
  onPickLanguage: () => {},
  forwardIds: null,
  onForwardTo: () => {},
  onCloseForward: () => {},
  reactionSheetFor: null,
  setReactionSheetFor: () => {},
  detailFor: null,
  setDetailFor: () => {},
  servedOf: () => undefined,
  starOf: () => null,
  ...overrides,
});

const mountSheets = async (menu: ThreadSheetsMenu, messages: readonly Message[]): Promise<HTMLElement> => {
  const host = await mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <ThreadMessageSheets
        messageMenu={menu}
        messages={messages}
        readerLanguages={['en']}
        readerLocale="fr-FR"
        conversationId="c-deploiement"
        viewerId={VIEWER_ID}
      />
    </QueryClientProvider>,
  );
  await mounter.settle();
  return host;
};

const languageButton = (host: HTMLElement, label: string): HTMLButtonElement | null =>
  [...host.querySelectorAll('button')].find((button) => button.textContent?.includes(label) ?? false) ?? null;

/** Des BOOLÉENS, jamais un nœud, sous `expect` : un échec qui imprime un
 * élément happy-dom (graphe cyclique) fige le formateur de `bun test` au lieu
 * de rougir — mesuré en falsifiant ce fichier. */
const offersLanguage = (host: HTMLElement, label: string): boolean => languageButton(host, label) !== null;
const has = (host: HTMLElement, selector: string): boolean => host.querySelector(selector) !== null;

describe('ThreadMessageSheets — les feuilles du message (#7429, extrait de routes/thread.tsx)', () => {
  test('rien de ciblé ⇒ rien de monté', () => {
    const html = renderToStaticMarkup(
      <ThreadMessageSheets
        messageMenu={menuOf()}
        messages={[]}
        readerLanguages={['fr']}
        readerLocale="fr-FR"
        conversationId="c-1"
        viewerId={VIEWER_ID}
      />,
    );
    expect(html).toBe('');
  });

  test('un message ciblé qui a QUITTÉ le fil ne monte aucune fiche', () => {
    const html = renderToStaticMarkup(
      <ThreadMessageSheets
        messageMenu={menuOf({ detailFor: 'ghost' })}
        messages={[]}
        readerLanguages={['fr']}
        readerLocale="fr-FR"
        conversationId="c-1"
        viewerId={VIEWER_ID}
      />,
    );
    expect(html).toBe('');
  });

  test('la fiche d’un message ORDINAIRE du lecteur porte ses langues ET sa pièce — la moitié positive du différentiel #7580', async () => {
    const host = await mountSheets(menuOf({ detailFor: SERVER_MESSAGE_ID }), [ownMessage({ isViewOnce: false })]);
    expect(offersLanguage(host, 'Français (original)')).toBe(true);
    expect(has(host, `[data-message-receipts-attachment="${ATTACHMENT_ID}"]`)).toBe(true);
  });

  test('la fiche d’une VUE UNIQUE (#7580) ne porte ni langue ni pièce — rien de son contenu', async () => {
    const host = await mountSheets(menuOf({ detailFor: SERVER_MESSAGE_ID }), [ownMessage({ isViewOnce: true })]);
    expect(has(host, '[data-message-receipts-title]')).toBe(true);
    expect(offersLanguage(host, 'Français (original)')).toBe(false);
    expect(has(host, '[data-message-receipts-attachment]')).toBe(false);
  });

  test('la fiche d’un message d’AUTRUI n’a pas d’accusé nominatif (delivery nul ⇒ aucun « Infos du message »)', async () => {
    const host = await mountSheets(menuOf({ detailFor: SERVER_MESSAGE_ID }), [ownMessage({ senderId: 'u-other' })]);
    expect(offersLanguage(host, 'Français (original)')).toBe(true);
    expect(has(host, '[data-message-receipts-title]')).toBe(false);
  });

  test('choisir une langue depuis la fiche la sert PUIS referme la fiche', async () => {
    const journal: string[] = [];
    const host = await mountSheets(
      menuOf({
        detailFor: SERVER_MESSAGE_ID,
        onPickLanguage: (id, code) => journal.push(`pick:${id}:${code}`),
        setDetailFor: (id) => journal.push(`detail:${String(id)}`),
      }),
      [ownMessage()],
    );
    await mounter.click(languageButton(host, 'Français (original)'));
    expect(journal).toEqual([`pick:${SERVER_MESSAGE_ID}:fr`, 'detail:null']);
  });

  test('réagir depuis la feuille de réactions pose la réaction PUIS referme la feuille', async () => {
    const journal: string[] = [];
    const host = await mountSheets(
      menuOf({
        reactionSheetFor: SERVER_MESSAGE_ID,
        onMenuReact: (id, emoji) => journal.push(`react:${id}:${emoji}`),
        setReactionSheetFor: (id) => journal.push(`sheet:${String(id)}`),
      }),
      [ownMessage()],
    );
    const firstEmoji = host.querySelector<HTMLButtonElement>('button[aria-label]:not([aria-label="Fermer"])');
    const emoji = firstEmoji?.getAttribute('aria-label') ?? '';
    expect(emoji).not.toBe('');
    await mounter.click(firstEmoji);
    expect(journal).toEqual([`react:${SERVER_MESSAGE_ID}:${emoji}`, 'sheet:null']);
  });
});
