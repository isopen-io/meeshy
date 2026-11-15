import { describe, expect, it } from 'vitest';

import { canStartCall, type CallStartContext } from './call-permission';

/**
 * QUI PEUT LANCER UN APPEL (#10207, directive porteur du 2026-10-11) :
 * « Il ne faut plus afficher la possibilité d'appeler pour les conversations
 * de type 'global' ! Et seul le créateur et les admin peuvent lancer les calls
 * pour les conversations de type 'public' ».
 *
 * Rejoindre un appel déjà en cours n'est PAS gouverné ici.
 */

const viewer = (overrides: Partial<CallStartContext> = {}): CallStartContext => ({
  conversationType: 'group',
  viewerIsCreator: false,
  viewerConversationRole: 'member',
  viewerPlatformRole: 'USER',
  viewerIsGuest: false,
  ...overrides,
});

describe('canStartCall', () => {
  it('un invité sans compte ne lance jamais un appel, même dans un direct', () => {
    expect(canStartCall(viewer({ conversationType: 'direct', viewerIsGuest: true }))).toBe(false);
  });

  it('un invité ne lance pas d’appel même s’il porte un rôle de conversation élevé', () => {
    expect(canStartCall(viewer({ viewerIsGuest: true, viewerConversationRole: 'admin' }))).toBe(false);
  });

  it('personne ne lance d’appel dans une conversation global, ni créateur ni administrateur plateforme', () => {
    expect(canStartCall(viewer({ conversationType: 'global' }))).toBe(false);
    expect(canStartCall(viewer({ conversationType: 'global', viewerIsCreator: true }))).toBe(false);
    expect(canStartCall(viewer({ conversationType: 'global', viewerConversationRole: 'creator' }))).toBe(false);
    expect(canStartCall(viewer({ conversationType: 'global', viewerPlatformRole: 'BIGBOSS' }))).toBe(false);
  });

  it('la casse du type ne rouvre pas la porte d’une conversation global', () => {
    expect(canStartCall(viewer({ conversationType: 'GLOBAL', viewerPlatformRole: 'ADMIN' }))).toBe(false);
  });

  it('dans une conversation public, un membre ordinaire ne lance pas d’appel', () => {
    expect(canStartCall(viewer({ conversationType: 'public' }))).toBe(false);
  });

  it('dans une conversation public, un modérateur de conversation ne lance pas d’appel', () => {
    expect(canStartCall(viewer({ conversationType: 'public', viewerConversationRole: 'moderator' }))).toBe(false);
  });

  it('dans une conversation public, un modérateur plateforme ne lance pas d’appel', () => {
    expect(canStartCall(viewer({ conversationType: 'public', viewerPlatformRole: 'MODERATOR' }))).toBe(false);
  });

  it('dans une conversation public, le créateur lance l’appel', () => {
    expect(canStartCall(viewer({ conversationType: 'public', viewerIsCreator: true }))).toBe(true);
  });

  it('dans une conversation public, le rang creator ou admin de la conversation lance l’appel, quelle que soit sa casse', () => {
    expect(canStartCall(viewer({ conversationType: 'public', viewerConversationRole: 'creator' }))).toBe(true);
    expect(canStartCall(viewer({ conversationType: 'public', viewerConversationRole: 'admin' }))).toBe(true);
    expect(canStartCall(viewer({ conversationType: 'public', viewerConversationRole: 'ADMIN' }))).toBe(true);
    expect(canStartCall(viewer({ conversationType: 'public', viewerConversationRole: 'CREATOR' }))).toBe(true);
  });

  it('dans une conversation public, un administrateur plateforme (ADMIN, BIGBOSS) lance l’appel', () => {
    expect(canStartCall(viewer({ conversationType: 'public', viewerPlatformRole: 'ADMIN' }))).toBe(true);
    expect(canStartCall(viewer({ conversationType: 'public', viewerPlatformRole: 'bigboss' }))).toBe(true);
  });

  it('dans une conversation public, un rôle de conversation absent échoue fermé', () => {
    expect(canStartCall(viewer({ conversationType: 'public', viewerConversationRole: null }))).toBe(false);
    expect(canStartCall(viewer({ conversationType: 'public', viewerConversationRole: undefined }))).toBe(false);
  });

  it('dans un direct ou un group, un membre lance l’appel comme avant', () => {
    expect(canStartCall(viewer({ conversationType: 'direct' }))).toBe(true);
    expect(canStartCall(viewer({ conversationType: 'group' }))).toBe(true);
  });

  it('un broadcast ou un type inconnu n’a pas d’appel, comme la passerelle le refusait déjà', () => {
    expect(canStartCall(viewer({ conversationType: 'broadcast', viewerPlatformRole: 'BIGBOSS' }))).toBe(false);
    expect(canStartCall(viewer({ conversationType: 'community', viewerIsCreator: true }))).toBe(false);
    expect(canStartCall(viewer({ conversationType: '' }))).toBe(false);
  });

  it('les champs optionnels absents valent un membre inscrit sans rôle plateforme', () => {
    expect(canStartCall({ conversationType: 'group', viewerIsCreator: false, viewerConversationRole: 'member' })).toBe(true);
    expect(canStartCall({ conversationType: 'public', viewerIsCreator: false, viewerConversationRole: 'member' })).toBe(false);
  });
});
