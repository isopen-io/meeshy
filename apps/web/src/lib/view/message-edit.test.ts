import { describe, expect, test } from 'bun:test';

import { message, minutesAgo } from '@/lib/api/fixtures-base';
import type { Message } from '@/lib/api/types';
import { menuScope } from '@/test-support/menu-viewer';

import { editOffered } from './message-edit';

/**
 * #10581 — « MODIFIER » N'EST OFFERT QUE SI LE SERVEUR L'ACCEPTERAIT
 * (`admitMessageEdit`) : l'auteur, inscrit, sur un message à texte que la
 * passerelle connaît, dans la fenêtre de 24 heures de la règle partagée
 * (`canEditMessage`). Chaque refus se lit ici AVANT l'aller-retour.
 */

const mine = (overrides: Partial<Message> = {}): Message =>
  message({
    id: 'm-1',
    senderId: 'u-moi',
    content: 'bonjour',
    originalLanguage: 'fr',
    translations: [],
    createdAt: minutesAgo(5),
    ...overrides,
  });

const viewer = menuScope({ id: 'u-moi' });
const now = () => Date.now();

describe('editOffered — la règle du serveur, lue avant le geste', () => {
  test('mon message à texte, récent ⇒ offert', () => {
    expect(editOffered(mine(), viewer, { now: now() })).toBe(true);
  });

  test('le message d’un autre ⇒ refusé', () => {
    expect(editOffered(mine({ senderId: 'u-autre' }), viewer, { now: now() })).toBe(false);
  });

  test('au-delà de 24 heures ⇒ refusé (la fenêtre de `canEditMessage`)', () => {
    expect(editOffered(mine({ createdAt: minutesAgo(24 * 60 + 5) }), viewer, { now: now() })).toBe(false);
    expect(editOffered(mine({ createdAt: minutesAgo(23 * 60) }), viewer, { now: now() })).toBe(true);
  });

  test('sans texte (pièce seule) ⇒ refusé', () => {
    expect(editOffered(mine({ content: '   ' }), viewer, { now: now() })).toBe(false);
  });

  test('un invité n’a pas de compte : le serveur ne le reconnaît pas pour auteur ⇒ refusé', () => {
    expect(editOffered(mine(), menuScope({ id: 'u-moi', hasAccount: false }), { now: now() })).toBe(false);
  });

  test('un envoi encore optimiste n’existe pas côté serveur ⇒ refusé', () => {
    expect(editOffered(mine({ id: 'cid_123' }), viewer, { now: now() })).toBe(false);
  });

  test('supprimé, à vue unique ou expiré ⇒ refusé', () => {
    expect(editOffered(mine({ deletedAt: new Date() }), viewer, { now: now() })).toBe(false);
    expect(editOffered(mine({ isViewOnce: true }), viewer, { now: now() })).toBe(false);
    expect(editOffered(mine({ expiresAt: minutesAgo(1) }), viewer, { now: now() })).toBe(false);
  });

  test('un message système (l’avis de capture, #9641) ne se réécrit pas ⇒ refusé', () => {
    expect(editOffered(mine({ messageType: 'system' }), viewer, { now: now() })).toBe(false);
  });

  test('un message chiffré de bout en bout ne part pas en clair ⇒ refusé', () => {
    expect(editOffered(mine({ isEncrypted: true }), viewer, { now: now() })).toBe(false);
  });

  test('une conversation chiffrée de bout en bout ⇒ refusé, même sur mon message en clair (#11210)', () => {
    expect(editOffered(mine(), menuScope({ id: 'u-moi' }, { encryptionMode: 'e2ee' }), { now: now() })).toBe(false);
  });

  test('un rôle de plateforme MODERATOR modifie le message d’un autre, comme la passerelle l’admet (#11210)', () => {
    expect(editOffered(mine({ senderId: 'u-autre' }), menuScope({ id: 'u-moi', platformRole: 'MODERATOR' }), { now: now() })).toBe(true);
    expect(editOffered(mine({ senderId: 'u-autre' }), menuScope({ id: 'u-moi', platformRole: 'AUDIT' }), { now: now() })).toBe(false);
  });

  test('une conversation close ⇒ refusé (#11210)', () => {
    expect(editOffered(mine(), menuScope({ id: 'u-moi' }, { isActive: false }), { now: now() })).toBe(false);
  });
});
