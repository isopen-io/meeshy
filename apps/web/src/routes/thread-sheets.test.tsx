import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { appQueryClient } from '@/lib/api/query-client';
import { attachmentDefaults, message, translation } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadExportCardCatalog } from '@/lib/i18n-export-card-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import { closeReactorsSheet, openReactorsSheet, reactorsSheetStore } from '@/lib/view/reactors-sheet-store';
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
  /* Les feuilles se chargent au geste (`lazy`) : chargées d'avance, leur import
     froid ne court plus contre le `settle` d'un témoin. */
  await Promise.all([
    loadInterfaceCatalog('fr'),
    loadMessagePiecesCatalog('fr'),
    import('@/components/message-detail-sheet'),
    import('@/components/report-sheet'),
  ]);
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
  quickReactionFor: null,
  onCloseQuickReaction: () => {},
  onCloseMenu: () => {},
  onMenuReact: () => {},
  onMenuAction: () => {},
  onPieceChange: () => {},
  onPieceAction: () => {},
  onPickLanguage: () => {},
  reactionSheetFor: null,
  setReactionSheetFor: () => {},
  detailFor: null,
  setDetailFor: () => {},
  exportFor: null,
  setExportFor: () => {},
  servedOf: () => undefined,
  starOf: () => null,
  editOf: () => null,
  deleteOf: () => null,
  deleteRequest: null,
  onDismissDelete: () => {},
  onConfirmDelete: () => {},
  pinOf: () => null,
  reportOf: () => null,
  reportFor: null,
  onPickReportReason: () => {},
  onDismissReport: () => {},
  ...overrides,
});

const mountSheets = async (menu: ThreadSheetsMenu, messages: readonly Message[]): Promise<HTMLElement> => {
  const host = await mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <ThreadMessageSheets
        messageMenu={menu}
        messages={messages}
        readerLanguages={['en']}
        conversationId="c-deploiement"
        viewerId={VIEWER_ID}
        viewerName="Jacques"
        viewerHandle="jacques"
        conversationTitle="Déploiement"
        announce={() => {}}
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
        conversationId="c-1"
        viewerId={VIEWER_ID}
        viewerName="Jacques"
        viewerHandle="jacques"
        conversationTitle="Déploiement"
        announce={() => {}}
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
        conversationId="c-1"
        viewerId={VIEWER_ID}
        viewerName="Jacques"
        viewerHandle="jacques"
        conversationTitle="Déploiement"
        announce={() => {}}
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

  test('la date de la fiche suit la langue d’INTERFACE, jamais le Prisme du lecteur (#10817)', async () => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = 'en';
    try {
      const sentAt = new Date('2026-09-24T10:00:00.000Z');
      const host = await mountSheets(menuOf({ detailFor: SERVER_MESSAGE_ID }), [ownMessage({ createdAt: sentAt })]);
      const english = new Intl.DateTimeFormat('en', { dateStyle: 'full', timeStyle: 'short' }).format(sentAt);
      expect(host.textContent?.includes(english) ?? false).toBe(true);
    } finally {
      document.documentElement.lang = previous;
    }
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

  test('« Plus… » déplie Composer (une photo à composer) ET Imager, qui ouvre l’atelier (#8693)', async () => {
    const journal: string[] = [];
    const host = await mountSheets(
      menuOf({
        detailFor: SERVER_MESSAGE_ID,
        setExportFor: (request) => journal.push(typeof request === 'function' || request === null ? 'export:?' : `export:${request.messageId}:${String(request.quick)}`),
        setDetailFor: (id) => journal.push(`detail:${String(id)}`),
      }),
      [ownMessage()],
    );
    expect([...host.querySelectorAll('[data-message-create]')].map((el) => el.getAttribute('data-message-create'))).toEqual(['compose', 'image']);
    await mounter.click(host.querySelector<HTMLElement>('[data-message-create="image"]'));
    expect(journal).toEqual([`export:${SERVER_MESSAGE_ID}:false`, 'detail:null']);
  });

  test('« Plus… » d’un message protégé n’offre ni Composer ni Imager', async () => {
    const host = await mountSheets(menuOf({ detailFor: SERVER_MESSAGE_ID }), [ownMessage({ isBlurred: true })]);
    expect(has(host, '[data-message-create]')).toBe(false);
  });

  test('« Imager » monte la carte d’un message ordinaire, avec ses templates', async () => {
    const host = await mountSheets(menuOf({ exportFor: { messageId: SERVER_MESSAGE_ID, quick: false } }), [ownMessage({ attachments: [] })]);
    await loadExportCardCatalog('fr');
    await mounter.settle();
    expect(host.querySelectorAll('[data-export-tab]').length > 1).toBe(true);
  });

  test('« Imager la discussion » (#9039) monte l’atelier sur la discussion — un choisi protégé n’en monte aucun', async () => {
    const earlier = ownMessage({ id: 'm-avant', content: 'Bonjour', attachments: [], createdAt: new Date('2026-09-24T09:59:00.000Z') });
    const request = { exportFor: { messageId: SERVER_MESSAGE_ID, quick: false, scope: 'discussion' as const } };
    const host = await mountSheets(menuOf(request), [earlier, ownMessage({ attachments: [] })]);
    await loadExportCardCatalog('fr');
    await mounter.settle();
    expect(host.querySelectorAll('[data-export-tab]').length > 1).toBe(true);
    mounter.unmountAll();

    const veiled = await mountSheets(menuOf(request), [earlier, ownMessage({ attachments: [], isBlurred: true })]);
    expect(has(veiled, '[data-export-tab]')).toBe(false);
  });

  test('le menu reçoit le sous-menu de « Transférer » (#9039)', async () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const item = (id: 'forward' | 'exportDiscussion', labelKey: 'message.menu.forward' | 'message.menu.exportDiscussion') => ({ id, labelKey, glyph: 'imageSquare' as const });
    await mountSheets(
      menuOf({
        menuTarget: { messageId: SERVER_MESSAGE_ID, element, isMine: true },
        menuData: {
          items: [item('forward', 'message.menu.forward')],
          forwardItems: [item('forward', 'message.menu.forward'), item('exportDiscussion', 'message.menu.exportDiscussion')],
          choices: [],
          subjectLabel: 'Actions',
          canReact: true,
        },
      }),
      [ownMessage()],
    );
    await mounter.click(document.querySelector<HTMLElement>('.message-menu-list [data-action="forward"]'));
    expect(document.querySelector('.message-menu-list [data-action="exportDiscussion"]') !== null).toBe(true);
    element.remove();
  });

  test('réagir refusé (#11206) : le menu se monte SANS rail de réactions', async () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    await mountSheets(
      menuOf({
        menuTarget: { messageId: SERVER_MESSAGE_ID, element, isMine: true },
        menuData: { items: [], forwardItems: [], choices: [], subjectLabel: 'Actions', canReact: false },
      }),
      [ownMessage()],
    );
    expect(document.querySelector('[role="menu"]') !== null).toBe(true);
    expect(document.querySelector('[data-message-menu-rail]')).toBe(null);
    element.remove();
  });

  test('un message protégé ne monte aucune carte, même ciblé', async () => {
    const host = await mountSheets(menuOf({ exportFor: { messageId: SERVER_MESSAGE_ID, quick: false } }), [ownMessage({ isBlurred: true })]);
    expect(has(host, '[data-export-tab]')).toBe(false);
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
    await mounter.settle();
    const firstEmoji = host.querySelector<HTMLButtonElement>('[data-emoji]');
    const emoji = firstEmoji?.getAttribute('aria-label') ?? '';
    expect(emoji).not.toBe('');
    await mounter.click(firstEmoji);
    expect(journal).toEqual([`react:${SERVER_MESSAGE_ID}:${emoji}`, 'sheet:null']);
  });
});

describe('ThreadMessageSheets — le dialogue de suppression (#10582)', () => {
  test('aucune demande ⇒ aucun dialogue', async () => {
    const host = await mountSheets(menuOf(), [ownMessage()]);
    expect(has(host, '[data-message-delete]')).toBe(false);
  });

  test('une demande ⇒ le dialogue offre ce que la règle a remis, et confirme auprès du contrôleur', async () => {
    const journal: string[] = [];
    const host = await mountSheets(
      menuOf({
        deleteRequest: { messageIds: [SERVER_MESSAGE_ID], offer: { forEveryone: false, forMe: true, remove: false } },
        onConfirmDelete: (mode) => journal.push(mode),
      }),
      [ownMessage()],
    );
    expect(has(host, '[data-message-delete="everyone"]')).toBe(false);
    await mounter.click(host.querySelector('[data-message-delete="me"]'));
    expect(journal).toEqual(['me']);
  });

  test('« Plus… » remet les gestes du contrôleur à la fiche : Modifier et Supprimer', async () => {
    const journal: string[] = [];
    const host = await mountSheets(
      menuOf({ detailFor: SERVER_MESSAGE_ID, editOf: () => () => journal.push('edit'), deleteOf: () => () => journal.push('delete') }),
      [ownMessage()],
    );
    expect(has(host, '[data-message-act="edit"]')).toBe(true);
    await mounter.click(host.querySelector('[data-message-act="delete"]'));
    expect(journal).toEqual(['delete']);
  });
});

/**
 * « ÉPINGLER » ET « SIGNALER » (#7558) — « Plus… » remet les gestes du
 * contrôleur à la fiche, et une demande de signalement monte la feuille des
 * motifs, dont le choix revient au contrôleur.
 */
describe('ThreadMessageSheets — épingler et signaler (#7558)', () => {
  const theirs = () => ownMessage({ senderId: 'u-autre' });

  test('« Plus… » remet l’épingle et le signalement du contrôleur à la fiche', async () => {
    const journal: string[] = [];
    const host = await mountSheets(
      menuOf({
        detailFor: SERVER_MESSAGE_ID,
        pinOf: () => ({ action: 'pin', onToggle: () => journal.push('pin') }),
        reportOf: () => () => journal.push('report'),
      }),
      [theirs()],
    );
    await mounter.click(host.querySelector('[data-message-act="pin"]'));
    expect(journal).toEqual(['pin']);
    expect(has(host, '[data-message-act="report"]')).toBe(true);
  });

  test('aucune demande ⇒ aucune feuille de motifs', async () => {
    const host = await mountSheets(menuOf(), [theirs()]);
    expect(host.ownerDocument.querySelector('[data-report-reason]') !== null).toBe(false);
  });

  test('une demande ⇒ la feuille « Signaler ce message » ; le motif choisi revient au contrôleur', async () => {
    const journal: string[] = [];
    const host = await mountSheets(menuOf({ reportFor: SERVER_MESSAGE_ID, onPickReportReason: (reason) => journal.push(reason) }), [theirs()]);
    await mounter.settle();
    expect(host.ownerDocument.body.textContent?.includes('Signaler ce message')).toBe(true);
    await mounter.click(host.ownerDocument.querySelector('[data-report-reason="harassment"]'));
    expect(journal).toEqual(['harassment']);
  });

  test('une demande sur un message qui n’est plus dans le fil ⇒ rien ne s’ouvre', async () => {
    const host = await mountSheets(menuOf({ reportFor: '66f0a1b2c3d4e5f6a7b8c9ff' }), [theirs()]);
    expect(host.ownerDocument.querySelector('[data-report-reason]') !== null).toBe(false);
  });
});

/**
 * « QUI A RÉAGI » (#10583) — une pilule maintenue nomme son message
 * (`reactors-sheet-store.ts`) ; l'hôte des feuilles monte la liste, avec les
 * comptes que le fil connaît déjà.
 */
describe('ThreadMessageSheets — la liste de qui a réagi (#10583)', () => {
  afterEach(() => closeReactorsSheet());

  const reacted = () => ownMessage({ reactionSummary: { '❤️': 2 } });

  const demande = async (messageId: string) => {
    await act(async () => {
      openReactorsSheet(messageId);
    });
    await mounter.settle();
    await mounter.settle();
  };

  test('aucune demande ⇒ aucune feuille', async () => {
    const host = await mountSheets(menuOf(), [reacted()]);
    expect(has(host, '[data-message-reactors-sheet]')).toBe(false);
  });

  test('une pilule maintenue ⇒ la feuille de CE message, avec ses comptes', async () => {
    const host = await mountSheets(menuOf(), [reacted()]);
    await demande(SERVER_MESSAGE_ID);
    expect(host.querySelector('[data-message-reactors-sheet]')?.getAttribute('data-message-reactors-sheet')).toBe(SERVER_MESSAGE_ID);
    expect(host.querySelector('[data-message-reactors-group="❤️"] [data-message-reactors-count]')?.textContent).toBe('2');
  });

  test('un message qui n’est plus dans le fil ⇒ aucune feuille ouverte sur du vide', async () => {
    const host = await mountSheets(menuOf(), [reacted()]);
    await demande('66f0a1b2c3d4e5f6a7b8c9ff');
    expect(has(host, '[data-message-reactors-sheet]')).toBe(false);
  });

  test('quitter le fil referme la demande : elle ne se rouvre pas dans le fil suivant', async () => {
    await mountSheets(menuOf(), [reacted()]);
    await demande(SERVER_MESSAGE_ID);
    mounter.unmountAll();
    expect(reactorsSheetStore.getState().messageId).toBeNull();
  });
});

describe('ThreadMessageSheets — la barre rapide du double toucher (#10599, porteur 2026-10-14)', () => {
  const anchorOf = (): HTMLElement => {
    const anchor = document.createElement('div');
    anchor.tabIndex = 0;
    document.body.append(anchor);
    return anchor;
  };
  const quickTile = (): HTMLButtonElement | null => document.body.querySelector<HTMLButtonElement>('[data-reaction-quick-bar] button[role="menuitem"]');

  test('aucune cible ⇒ aucune barre', async () => {
    await mountSheets(menuOf(), [ownMessage()]);
    expect(document.body.querySelector('[data-reaction-quick-bar]')).toBeNull();
  });

  test('une cible ⇒ la barre ; choisir un emoji réagit sur le message puis referme', async () => {
    const journal: string[] = [];
    const anchor = anchorOf();
    await mountSheets(
      menuOf({
        quickReactionFor: { messageId: SERVER_MESSAGE_ID, anchor, x: 100 },
        onMenuReact: (id, emoji, pieceId) => journal.push(`react:${id}:${emoji}:${String(pieceId)}`),
        onCloseQuickReaction: () => journal.push('close'),
      }),
      [ownMessage()],
    );
    const tile = quickTile();
    const emoji = tile?.textContent ?? '';
    expect(emoji).not.toBe('');
    await mounter.click(tile);
    expect(journal).toEqual([`react:${SERVER_MESSAGE_ID}:${emoji}:undefined`, 'close']);
    anchor.remove();
  });

  test('une cible PIÈCE ⇒ la réaction vise la pièce touchée', async () => {
    const journal: string[] = [];
    const anchor = anchorOf();
    await mountSheets(
      menuOf({
        quickReactionFor: { messageId: SERVER_MESSAGE_ID, anchor, x: 100, pieceId: ATTACHMENT_ID },
        onMenuReact: (id, emoji, pieceId) => journal.push(`react:${id}:${emoji}:${String(pieceId)}`),
      }),
      [ownMessage()],
    );
    const tile = quickTile();
    await mounter.click(tile);
    expect(journal).toEqual([`react:${SERVER_MESSAGE_ID}:${tile?.textContent ?? ''}:${ATTACHMENT_ID}`]);
    anchor.remove();
  });

  test('« ＋ » de la barre ouvre la feuille complète du message', async () => {
    const journal: string[] = [];
    const anchor = anchorOf();
    await mountSheets(
      menuOf({
        quickReactionFor: { messageId: SERVER_MESSAGE_ID, anchor, x: 100 },
        setReactionSheetFor: (id) => journal.push(`sheet:${String(id)}`),
        onCloseQuickReaction: () => journal.push('close'),
      }),
      [ownMessage()],
    );
    await mounter.click(document.body.querySelector('[data-reaction-quick-bar] button[data-add-reaction]'));
    expect(journal).toEqual([`sheet:${SERVER_MESSAGE_ID}`, 'close']);
    anchor.remove();
  });

  test('un message disparu du fil ne garde pas sa barre', async () => {
    const anchor = anchorOf();
    await mountSheets(menuOf({ quickReactionFor: { messageId: 'm-parti', anchor, x: 100 } }), [ownMessage()]);
    expect(document.body.querySelector('[data-reaction-quick-bar]')).toBeNull();
    anchor.remove();
  });
});
