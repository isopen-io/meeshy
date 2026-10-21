import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { modalLayersOpen } from '@/lib/view/modal-layers';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { MessagePinEntry } from '@/lib/view/use-message-pin';
import type { MessageStarEntry } from '@/lib/view/use-message-star';

import { MessageDetailSheet } from './message-detail-sheet';

/**
 * « INFOS DU MESSAGE » NE SE MONTE QUE SOUS LA MÊME GARDE QUE L'ACCUSÉ
 * (#7226, W7) — `delivery !== null`, posée par l'appelant (`isMineOf`,
 * `thread.tsx`) : un message REÇU n'a pas d'accusé nominatif à lire sur
 * lui-même, et la feuille ne doit engager AUCUNE requête pour lui.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadInterfaceCatalog('fr'), loadInterfaceCatalog('en'), loadInterfaceCatalog('ar'), loadMessagePiecesCatalog('fr')]);
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
  document.documentElement.lang = 'fr';
});

const SERVER_MESSAGE_ID = '66f0a1b2c3d4e5f6a7b8c9d0';

async function mountSheet(
  delivery: 'sent' | null,
  messageId: string = SERVER_MESSAGE_ID,
  extra: {
    readonly star?: MessageStarEntry | null;
    readonly onClose?: () => void;
    choices?: readonly { code: string; isOriginal: boolean; isServed: boolean }[];
    reactions?: readonly (readonly [string, number])[];
    readonly create?: { readonly onCompose: (() => void) | null; readonly onImage: (() => void) | null };
    readonly act?: {
      readonly onEdit?: (() => void) | null;
      readonly onDelete?: (() => void) | null;
      readonly pin?: MessagePinEntry | null;
      readonly onReport?: (() => void) | null;
    };
  } = {},
) {
  return mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <MessageDetailSheet
        choices={extra.choices ?? []}
        reactions={extra.reactions ?? []}
        sentAt={new Date('2026-09-21T10:00:00.000Z')}
        delivery={delivery}
        locale="fr-FR"
        conversationId="c-deploiement"
        messageId={messageId}
        attachments={[]}
        star={extra.star ?? null}
        {...(extra.create === undefined ? {} : { create: extra.create })}
        {...(extra.act === undefined ? {} : { act: extra.act })}
        onPickLanguage={() => undefined}
        onClose={extra.onClose ?? (() => undefined)}
      />
    </QueryClientProvider>,
  );
}

describe('MessageDetailSheet — la garde de « Infos du message »', () => {
  test('message ENVOYÉ (delivery non nul) ⇒ la section se monte', async () => {
    const host = await mountSheet('sent');
    expect(host.querySelector('[data-message-receipts-title]')).not.toBe(null);
  });

  test('message REÇU (delivery nul) ⇒ AUCUNE section, aucune requête engagée', async () => {
    const host = await mountSheet(null);
    expect(host.querySelector('[data-message-receipts-title]')).toBe(null);
  });

  /**
   * LA SECONDE MOITIÉ DE LA GARDE — un message ENCORE OPTIMISTE porte son
   * `clientMessageId` (`cid_…`) et n'existe pas côté serveur, alors que
   * `deliveryOf` le rend « envoyé » (`deliveredCount: 0` ⇒ `'sent'`). Sans
   * `hasServerMessageId`, ouvrir « Plus… » juste après l'envoi lançait un
   * `GET …/receipts?detail=people&messageIds=cid_…` voué au 400, puis
   * peignait « Impossible de charger ces informations ». iOS pose la même
   * garde (`MessageViewsDetailView.swift:943`).
   */
  test('message ENVOYÉ mais encore OPTIMISTE (`cid_…`) ⇒ aucune section', async () => {
    const host = await mountSheet('sent', 'cid_2f1c8b0e-4a6d-4c11-9b5e-0f9a7c3d2e18');
    expect(host.querySelector('[data-message-receipts-title]')).toBe(null);
  });

  test('un INVITÉ ne demande pas les accusés par personne, que la passerelle lui refuse (#10205)', async () => {
    sessionStore.setState({
      session: {
        status: 'guest',
        sessionToken: 'anon',
        guest: { participantId: 'p-awa', nickname: 'Awa', conversationId: 'c-deploiement', link: 'mshy_world', mayWrite: true },
        expiresAt: Number.MAX_SAFE_INTEGER,
      },
    });
    try {
      const host = await mountSheet('sent');
      expect(host.querySelector('[data-message-receipts-title]')).toBe(null);
    } finally {
      sessionStore.setState({ session: { status: 'anonymous' } });
    }
  });
});

/**
 * **L'ÉTOILE DANS « PLUS… »** (#7378) — iOS la range dans la feuille « Plus… »,
 * section « Faire » (`MessageActionResolver.moreSections`). Elle y est la
 * PREMIÈRE entrée, désignée par `data-message-star` (le Chromium des gates
 * tourne en `en-US` : aucun gate ne la cherche par son texte).
 */
describe('MessageDetailSheet — le favori', () => {
  test('état inconnu ou message non favorisable (`star` nul) ⇒ aucune entrée', async () => {
    const host = await mountSheet(null);
    expect(host.ownerDocument.querySelector('[data-message-star]')).toBe(null);
  });

  test('« Ajouter aux favoris » est la première entrée, et la toucher agit PUIS referme la feuille', async () => {
    const events: string[] = [];
    await mountSheet(null, SERVER_MESSAGE_ID, {
      star: { action: 'star', onToggle: () => events.push('toggle') },
      onClose: () => events.push('close'),
    });
    const entry = document.querySelector<HTMLButtonElement>('[data-message-star]');
    expect(entry?.getAttribute('data-message-star')).toBe('star');
    expect(entry?.textContent).toContain('Ajouter aux favoris');
    const firstButton = document.querySelector('dialog ul li button');
    expect(firstButton).toBe(entry);

    entry?.click();
    expect(events).toEqual(['toggle', 'close']);
  });

  test('un favori se lit « Retirer des favoris »', async () => {
    await mountSheet(null, SERVER_MESSAGE_ID, { star: { action: 'unstar', onToggle: () => undefined } });
    const entry = document.querySelector('[data-message-star]');
    expect(entry?.getAttribute('data-message-star')).toBe('unstar');
    expect(entry?.textContent).toContain('Retirer des favoris');
  });
});

describe('MessageDetailSheet — la feuille DÉCLARE qu’elle recouvre (W14, #7372)', () => {
  test('montée ⇒ le registre des couches modales la compte ; démontée ⇒ il l’oublie', async () => {
    expect(modalLayersOpen()).toBe(false);
    await mountSheet('sent');
    // Toute feuille passe par `Sheet` → `useBackDismiss` → le registre, que
    // le suivi de lecture du fil lit pour se suspendre (#7372).
    expect(modalLayersOpen()).toBe(true);
    mounter.unmountAll();
    expect(modalLayersOpen()).toBe(false);
  });
});

/**
 * « PLUS… » DANS LA LANGUE DU LECTEUR (#7555) — témoin de RANG sur une locale
 * NON française (leçon 261) : le titre de la feuille et ses trois en-têtes
 * étaient EN DUR en français, et aucun témoin `fr` ne pouvait distinguer un
 * littéral d'une clé servie. Seul l'anglais tranche.
 */
describe('MessageDetailSheet — les libellés viennent du catalogue (#7555)', () => {
  test('interface EN ⇒ titre, Languages, Reactions, Sent — aucun mot français', async () => {
    document.documentElement.lang = 'en';
    const host = await mountSheet('sent', SERVER_MESSAGE_ID, {
      choices: [{ code: 'fr', isOriginal: true, isServed: true }],
      reactions: [['👍', 2]],
    });
    const text = host.textContent ?? '';
    expect(text).toContain(translate('en', 'message.detail.title'));
    expect(text).toContain(translate('en', 'message.detail.languages'));
    expect(text).toContain(translate('en', 'message.detail.reactions'));
    expect(text).toContain(translate('en', 'message.detail.sent'));
    expect(text).not.toContain('Détails du message');
    expect(text).not.toContain('Langues');
    expect(text).not.toContain('Réactions');
  });

  test('interface AR ⇒ la mention « original » d’une langue est arabe, pas française', async () => {
    document.documentElement.lang = 'ar';
    const host = await mountSheet('sent', SERVER_MESSAGE_ID, {
      choices: [{ code: 'fr', isOriginal: true, isServed: true }],
    });
    const text = host.textContent ?? '';
    expect(text).toContain(translate('ar', 'message.detail.language.original', { language: 'Français' }));
    expect(text).not.toContain('(original)');
  });
});

describe('« Plus… » déplie Composer ET Imager (#8693)', () => {
  test('les deux entrées, dans cet ordre, agissent puis referment la feuille', async () => {
    const journal: string[] = [];
    const host = await mountSheet(null, SERVER_MESSAGE_ID, {
      create: { onCompose: () => journal.push('compose'), onImage: () => journal.push('image') },
      onClose: () => journal.push('close'),
    });
    const entries = [...host.querySelectorAll<HTMLElement>('[data-message-create]')];
    expect(entries.map((el) => el.getAttribute('data-message-create'))).toEqual(['compose', 'image']);
    expect(entries.map((el) => el.textContent)).toEqual(['Composer', 'Imager']);
    await mounter.click(entries[1] ?? null);
    expect(journal).toEqual(['image', 'close']);
  });

  test('un message sans média à composer n’offre que « Imager » ; un message protégé, rien', async () => {
    const imageOnly = await mountSheet(null, SERVER_MESSAGE_ID, { create: { onCompose: null, onImage: () => undefined } });
    expect([...imageOnly.querySelectorAll('[data-message-create]')].map((el) => el.getAttribute('data-message-create'))).toEqual(['image']);
    const none = await mountSheet(null, SERVER_MESSAGE_ID, { create: { onCompose: null, onImage: null } });
    expect(none.querySelector('[data-message-create]')).toBeNull();
  });
});

describe('« Plus… » offre « Modifier » (#10581)', () => {
  test('offert ⇒ première entrée, qui agit puis referme la feuille', async () => {
    const journal: string[] = [];
    const host = await mountSheet('sent', SERVER_MESSAGE_ID, {
      act: { onEdit: () => journal.push('edit') },
      create: { onCompose: null, onImage: () => undefined },
      onClose: () => journal.push('close'),
    });
    const first = host.querySelector<HTMLElement>('li button');
    expect(first?.getAttribute('data-message-act')).toBe('edit');
    expect(first?.textContent).toBe('Modifier');
    await mounter.click(first);
    expect(journal).toEqual(['edit', 'close']);
  });

  test('non offert ⇒ aucune entrée', async () => {
    const refused = await mountSheet('sent', SERVER_MESSAGE_ID, { act: { onEdit: null } });
    expect(refused.querySelector('[data-message-act="edit"]')).toBeNull();
    const silent = await mountSheet('sent');
    expect(silent.querySelector('[data-message-act="edit"]')).toBeNull();
  });
});

describe('« Plus… » offre « Supprimer » (#10582)', () => {
  test('offert ⇒ dernière entrée de la section, qui referme la feuille PUIS ouvre le dialogue', async () => {
    const journal: string[] = [];
    const host = await mountSheet('sent', SERVER_MESSAGE_ID, {
      act: { onEdit: () => journal.push('edit'), onDelete: () => journal.push('delete') },
      create: { onCompose: null, onImage: () => undefined },
      onClose: () => journal.push('close'),
    });
    const acts = [...host.querySelectorAll<HTMLElement>('[data-message-act], [data-message-create]')];
    expect(acts.map((el) => el.getAttribute('data-message-act') ?? el.getAttribute('data-message-create'))).toEqual(['edit', 'image', 'delete']);
    const entry = host.querySelector<HTMLElement>('[data-message-act="delete"]');
    expect(entry?.textContent).toBe('Supprimer');
    await mounter.click(entry);
    expect(journal).toEqual(['close', 'delete']);
  });

  test('non offert ⇒ aucune entrée', async () => {
    const host = await mountSheet('sent', SERVER_MESSAGE_ID, { act: { onDelete: null } });
    expect(host.querySelector('[data-message-act="delete"]')).toBeNull();
  });
});

/**
 * « ÉPINGLER » ET « SIGNALER » (#7558) — à la place qu'iOS leur donne
 * (`MessageActionResolver.moreSections`) : l'épingle après « Imager » et avant
 * le favori, « Signaler » seul en section de modération, à la fin de la feuille.
 */
describe('« Plus… » offre « Épingler » et « Signaler » (#7558)', () => {
  test('l’épingle se range après Imager et avant Supprimer ; elle agit puis referme', async () => {
    const journal: string[] = [];
    const host = await mountSheet('sent', SERVER_MESSAGE_ID, {
      act: { onEdit: () => undefined, onDelete: () => undefined, pin: { action: 'pin', onToggle: () => journal.push('pin') } },
      create: { onCompose: null, onImage: () => undefined },
      onClose: () => journal.push('close'),
    });
    const acts = [...host.querySelectorAll<HTMLElement>('[data-message-act], [data-message-create]')];
    expect(acts.map((el) => el.getAttribute('data-message-act') ?? el.getAttribute('data-message-create'))).toEqual(['edit', 'image', 'pin', 'delete']);
    const entry = host.querySelector<HTMLElement>('[data-message-act="pin"]');
    expect(entry?.textContent).toBe('Épingler');
    await mounter.click(entry);
    expect(journal).toEqual(['pin', 'close']);
  });

  test('un message épinglé dit « Désépingler »', async () => {
    const host = await mountSheet('sent', SERVER_MESSAGE_ID, { act: { pin: { action: 'unpin', onToggle: () => undefined } } });
    expect(host.querySelector<HTMLElement>('[data-message-act="unpin"]')?.textContent).toBe('Désépingler');
  });

  test('« Signaler » ferme la feuille, PUIS ouvre les motifs — en dernier, après « Envoyé »', async () => {
    const journal: string[] = [];
    const host = await mountSheet(null, SERVER_MESSAGE_ID, {
      act: { onReport: () => journal.push('report') },
      onClose: () => journal.push('close'),
    });
    const items = [...host.querySelectorAll('li')];
    const entry = host.querySelector<HTMLElement>('[data-message-act="report"]');
    expect(entry?.textContent).toBe('Signaler');
    expect(items.at(-1)?.contains(entry)).toBe(true);
    await mounter.click(entry);
    expect(journal).toEqual(['close', 'report']);
  });

  test('non offerts ⇒ aucune entrée', async () => {
    const host = await mountSheet('sent', SERVER_MESSAGE_ID, { act: { pin: null, onReport: null } });
    expect(host.querySelector('[data-message-act="pin"], [data-message-act="unpin"], [data-message-act="report"]')).toBeNull();
  });
});

/**
 * « PLUS… » NOMME QUI A RÉAGI (#10583) — la section « Réactions » ne s'arrête
 * plus aux comptes : elle monte la liste nominative (`MessageReactors`), qui
 * peint les comptes tout de suite et lit les noms ensuite.
 */
describe('MessageDetailSheet — la section « Réactions » (#10583)', () => {
  test('des réactions ⇒ les comptes, portés par la liste nominative', async () => {
    const host = await mountSheet(null, SERVER_MESSAGE_ID, { reactions: [['👍', 2], ['❤️', 1]] });
    const groups = [...host.querySelectorAll('[data-message-reactors-group]')];
    expect(groups.map((row) => `${row.getAttribute('data-message-reactors-group')}:${row.querySelector('[data-message-reactors-count]')?.textContent}`)).toEqual(['👍:2', '❤️:1']);
  });

  test('aucune réaction ⇒ ni titre de section, ni liste', async () => {
    const host = await mountSheet(null);
    expect(host.querySelector('[data-message-reactors-group]')).toBeNull();
    expect(host.textContent).not.toContain('Réactions');
  });
});
