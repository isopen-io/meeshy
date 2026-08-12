/**
 * Itération routine — `getConversationNameOnly` et `getMessageSenderName`
 * convergent sur le SSOT `getUserDisplayName` (priorité displayName >
 * firstName+lastName > username). Les chaînes inline précédentes préféraient
 * `username` au vrai nom → un compte avec prénom/nom ET username affichait le
 * username. Régression RED verrouillée ici.
 */

import type { Conversation } from '@meeshy/shared/types';
import {
  getConversationNameOnly,
  getMessageSenderName,
} from '@/components/conversations/conversation-item/conversation-utils';

const directConversation = (overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'c1',
    type: 'direct',
    title: '',
    ...overrides,
  } as unknown as Conversation);

describe('getConversationNameOnly — priorité SSOT du nom', () => {
  it('préfère firstName+lastName au username (bug corrigé)', () => {
    const user = { username: 'aw_1234', firstName: 'Alice', lastName: 'Wang' };
    expect(getConversationNameOnly(directConversation(), () => user)).toBe('Alice Wang');
  });

  it('préfère displayName à tout le reste', () => {
    const user = { displayName: 'Ally', firstName: 'Alice', lastName: 'Wang', username: 'aw' };
    expect(getConversationNameOnly(directConversation(), () => user)).toBe('Ally');
  });

  it('retombe sur username quand aucun nom structuré', () => {
    expect(getConversationNameOnly(directConversation(), () => ({ username: 'solo' }))).toBe('solo');
  });

  it('retombe sur "Utilisateur" quand le participant n\'a aucun nom', () => {
    expect(getConversationNameOnly(directConversation(), () => ({}))).toBe('Utilisateur');
  });

  it('retombe sur le titre puis "Conversation privée" sans participant', () => {
    expect(getConversationNameOnly(directConversation({ title: 'Chat' }), () => null)).toBe('Chat');
    expect(getConversationNameOnly(directConversation(), () => null)).toBe('Conversation privée');
  });

  it('utilise le titre pour une conversation non-directe', () => {
    const group = directConversation({ type: 'group', title: 'Equipe' });
    expect(getConversationNameOnly(group, () => ({ username: 'x' }))).toBe('Equipe');
    const noTitle = directConversation({ type: 'group', title: '' });
    expect(getConversationNameOnly(noTitle, () => null)).toBe('Groupe sans nom');
  });
});

describe('getMessageSenderName — priorité SSOT du nom expéditeur', () => {
  it('préfère firstName+lastName au username (bug corrigé)', () => {
    const message = { sender: { username: 'bob99', firstName: 'Bob', lastName: 'Marley' } };
    expect(getMessageSenderName(message)).toBe('Bob Marley');
  });

  it('préfère displayName', () => {
    const message = { sender: { displayName: 'Bobby', username: 'bob99', firstName: 'Bob' } };
    expect(getMessageSenderName(message)).toBe('Bobby');
  });

  it('retombe sur username sans nom structuré', () => {
    expect(getMessageSenderName({ sender: { username: 'solo' } })).toBe('solo');
  });

  it('retourne null sans expéditeur', () => {
    expect(getMessageSenderName({})).toBeNull();
    expect(getMessageSenderName(null)).toBeNull();
    expect(getMessageSenderName(undefined)).toBeNull();
  });

  it('retourne null quand l\'expéditeur n\'a aucun nom', () => {
    expect(getMessageSenderName({ sender: {} })).toBeNull();
  });
});
