import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MessageDeleteDialog } from './message-delete-dialog';

/**
 * #10582 — LE DIALOGUE DE SUPPRESSION. « Pour tout le monde » n'existe que si
 * la règle le permet pour tous les messages visés ; chaque choix se remet à
 * l'hôte, et « Annuler » ne supprime rien.
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

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const mount = (options: { readonly count?: number; readonly forEveryone?: boolean; readonly forMe?: boolean; readonly remove?: boolean }, journal: string[] = []) =>
  mounter.mount(
    <MessageDeleteDialog
      count={options.count ?? 1}
      offer={{ forEveryone: options.forEveryone ?? true, forMe: options.forMe ?? true, remove: options.remove ?? false }}
      onConfirm={(mode, reason) => journal.push(reason === undefined ? mode : `${mode}:${reason}`)}
      onDismiss={() => journal.push('dismiss')}
    />,
  );

const choices = (host: HTMLElement): readonly (string | null)[] =>
  [...host.querySelectorAll('[data-message-delete]')].map((el) => el.getAttribute('data-message-delete'));

describe('MessageDeleteDialog — ce qu’il offre', () => {
  test('mon message ⇒ pour tout le monde, pour moi, annuler — dans cet ordre', async () => {
    const host = await mount({});
    expect(choices(host)).toEqual(['everyone', 'me', 'cancel']);
    expect(host.textContent).toContain('Supprimer ce message ?');
    expect(host.textContent).toContain('Supprimer pour tout le monde');
    expect(host.textContent).toContain('Supprimer pour moi');
  });

  test('la règle ne le permet pas pour tous ⇒ « pour tout le monde » n’existe pas, ni son explication', async () => {
    const host = await mount({ forEveryone: false });
    expect(choices(host)).toEqual(['me', 'cancel']);
    expect(host.querySelector('[data-message-delete-hint]')).toBeNull();
  });

  test('plusieurs messages ⇒ le titre les compte', async () => {
    const host = await mount({ count: 3 });
    expect(host.textContent).toContain('Supprimer 3 messages ?');
  });
});

describe('MessageDeleteDialog — ce qu’il remet', () => {
  test('« pour tout le monde » remet `everyone`', async () => {
    const journal: string[] = [];
    const host = await mount({}, journal);
    await mounter.click(host.querySelector('[data-message-delete="everyone"]'));
    expect(journal).toEqual(['everyone']);
  });

  test('« pour moi » remet `me`', async () => {
    const journal: string[] = [];
    const host = await mount({}, journal);
    await mounter.click(host.querySelector('[data-message-delete="me"]'));
    expect(journal).toEqual(['me']);
  });

  test('« Annuler » referme sans rien supprimer', async () => {
    const journal: string[] = [];
    const host = await mount({}, journal);
    await mounter.click(host.querySelector('[data-message-delete="cancel"]'));
    expect(journal).toEqual(['dismiss']);
  });
});

describe('MessageDeleteDialog — retirer le message d’un autre (#11150)', () => {
  test('« Retirer » n’existe que si la règle l’offre, avant « pour moi »', async () => {
    expect(choices(await mount({ forEveryone: false }))).toEqual(['me', 'cancel']);
    expect(choices(await mount({ forEveryone: false, remove: true }))).toEqual(['remove', 'me', 'cancel']);
  });

  test('« Retirer » demande le motif, puis remet `remove` avec le motif nettoyé', async () => {
    const journal: string[] = [];
    const host = await mount({ forEveryone: false, remove: true }, journal);
    await mounter.click(host.querySelector('[data-message-delete="remove"]'));
    expect(journal).toEqual([]);
    expect(host.ownerDocument.querySelector('[data-content-removal-reason]')).not.toBeNull();
    mounter.type(host.ownerDocument, '[data-content-removal-reason]', ' Propos haineux ');
    await mounter.click(host.ownerDocument.querySelector('[data-content-removal="confirm"]'));
    expect(journal).toEqual(['remove:Propos haineux']);
  });
});
