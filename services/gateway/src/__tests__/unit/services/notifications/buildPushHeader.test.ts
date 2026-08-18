/**
 * buildPushHeader pure helper tests
 *
 * Verifies that the gateway constructs the APN/FCM push title and subtitle
 * in a way that:
 *  - keeps the title focused on the sender (so iOS Communication Notifications
 *    `INSendMessageIntent` rewriting doesn't clobber the conversation name),
 *  - exposes the conversation name as a separate `subtitle` field for
 *    group/global chats, which iOS renders natively between title and body.
 *
 * Regression guard for the bug where the gateway concatenated
 * "<sender> | <conv>" into the title — iOS systematically dropped the second
 * half once Communication Intent donation kicked in.
 *
 * @jest-environment node
 */

import { buildPushHeader } from '../../../../services/notifications/NotificationService';

describe('buildPushHeader', () => {
  it('builds {title=sender, subtitle=conv} for a global conversation message', () => {
    const result = buildPushHeader({
      type: 'new_message',
      actor: { id: 'u1', username: 'meeshy', displayName: 'meeshy sama' },
      context: { conversationType: 'global', conversationTitle: 'Meeshy Global' },
    });
    expect(result).toEqual({ title: 'meeshy sama', subtitle: 'Meeshy Global' });
  });

  it('builds {title=sender, subtitle=conv} for a group conversation message', () => {
    const result = buildPushHeader({
      type: 'new_message',
      actor: { id: 'u1', username: 'alice', displayName: 'Alice Martin' },
      context: { conversationType: 'group', conversationTitle: 'Équipe Dev' },
    });
    expect(result).toEqual({ title: 'Alice Martin', subtitle: 'Équipe Dev' });
  });

  it('omits subtitle for direct messages (1-on-1)', () => {
    const result = buildPushHeader({
      type: 'new_message',
      actor: { id: 'u1', username: 'alice', displayName: 'Alice Martin' },
      context: { conversationType: 'direct', conversationTitle: 'Alice & Bob' },
    });
    expect(result).toEqual({ title: 'Alice Martin', subtitle: undefined });
  });

  it('omits subtitle when conversationType is missing', () => {
    const result = buildPushHeader({
      type: 'new_message',
      actor: { id: 'u1', username: 'alice', displayName: 'Alice' },
      context: {},
    });
    expect(result.subtitle).toBeUndefined();
  });

  it('builds subtitle=conv for group reactions and mentions (conversation-scoped types)', () => {
    // Précision des notifications (2026-06-12) : une réaction ou une mention
    // dans un groupe doit dire DANS QUEL groupe — même mécanisme subtitle que
    // new_message, restauré côté NSE après la donation d'intent.
    const reactionResult = buildPushHeader({
      type: 'message_reaction',
      actor: { id: 'u1', username: 'alice', displayName: 'Alice' },
      context: { conversationType: 'group', conversationTitle: 'Équipe Dev' },
    });
    expect(reactionResult.subtitle).toBe('Équipe Dev');

    const mentionResult = buildPushHeader({
      type: 'user_mentioned',
      actor: { id: 'u1', username: 'alice', displayName: 'Alice' },
      context: { conversationType: 'global', conversationTitle: 'Meeshy Global' },
    });
    expect(mentionResult.subtitle).toBe('Meeshy Global');
  });

  it('omits subtitle for group reactions/mentions in direct conversations', () => {
    const result = buildPushHeader({
      type: 'message_reaction',
      actor: { id: 'u1', username: 'alice', displayName: 'Alice' },
      context: { conversationType: 'direct', conversationTitle: 'Alice & Bob' },
    });
    expect(result.subtitle).toBeUndefined();
  });

  it('omits subtitle for non-conversation notification types (friend requests...)', () => {
    const result = buildPushHeader({
      type: 'friend_request',
      actor: { id: 'u1', username: 'alice', displayName: 'Alice' },
      context: { conversationType: 'group', conversationTitle: 'Équipe Dev' },
    });
    expect(result.subtitle).toBeUndefined();
  });

  it('honours an explicit customTitle override (e.g. security alerts)', () => {
    const result = buildPushHeader({
      type: 'login_new_device',
      customTitle: 'New login detected',
      actor: { id: 'u1', username: 'alice', displayName: 'Alice' },
      context: {},
    });
    expect(result.title).toBe('New login detected');
  });

  it('falls back to actor.username when displayName is empty', () => {
    const result = buildPushHeader({
      type: 'new_message',
      actor: { id: 'u1', username: 'alice', displayName: '' },
      context: { conversationType: 'global', conversationTitle: 'Meeshy Global' },
    });
    expect(result.title).toBe('alice');
    expect(result.subtitle).toBe('Meeshy Global');
  });

  it('falls back to "Meeshy" when no actor is provided', () => {
    const result = buildPushHeader({
      type: 'new_message',
      context: { conversationType: 'global', conversationTitle: 'Meeshy Global' },
    });
    expect(result.title).toBe('Meeshy');
  });

  it('omits subtitle when conversationTitle is empty even for groups', () => {
    const result = buildPushHeader({
      type: 'new_message',
      actor: { id: 'u1', username: 'alice', displayName: 'Alice' },
      context: { conversationType: 'group', conversationTitle: '' },
    });
    expect(result.subtitle).toBeUndefined();
  });

  it('never concatenates sender and conversation into the title (regression)', () => {
    // The previous bug used "<sender> | <conv>" which iOS Communication
    // Notifications systematically clobbered. The title must remain a pure
    // sender name so it survives intent donation; subtitle carries the group.
    const result = buildPushHeader({
      type: 'new_message',
      actor: { id: 'u1', username: 'meeshy', displayName: 'meeshy sama' },
      context: { conversationType: 'global', conversationTitle: 'Meeshy Global' },
    });
    expect(result.title).not.toContain('|');
    expect(result.title).not.toContain('Meeshy Global');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Action sociale — ce que la bannière iOS peut RÉELLEMENT montrer
// ──────────────────────────────────────────────────────────────────────────
//
// Sur le chemin Communication Notification, iOS réécrit le titre avec le
// displayName de l'INPerson expéditeur : le titre riche persisté (« elvira
// ndjiki a commenté un réel de Windie Nh ») ne peut donc PAS voyager par là.
// L'action voyage en subtitle, seul champ que le client peut rendre sous le
// nom — et elle s'y suffit : l'auteur du contenu y est déjà fusionné, et
// l'aperçu du contenu visé occupe le corps.
describe('buildPushHeader — action sociale', () => {
  it('rend l’action, auteur du contenu compris, sans rien lui adjoindre', () => {
    const result = buildPushHeader({
      type: 'friend_story_comment',
      actor: { id: 'u1', username: 'elvira', displayName: 'elvira ndjiki' },
      context: {},
      action: 'a commenté un réel de Windie Nh',
      entitySubtitle: 'Publication de Windie Nh',
    });
    expect(result.title).toBe('elvira ndjiki');
    expect(result.subtitle).toBe('a commenté un réel de Windie Nh');
  });

  it('ne répète JAMAIS la cible derrière l’action (régression : doublon de bannière)', () => {
    // Le défaut signalé : « a réagi ❤️ à votre publication · Votre publication »
    // sur deux lignes, puis la même phrase une troisième fois dans le corps.
    const result = buildPushHeader({
      type: 'post_like',
      actor: { id: 'u1', username: 'alice', displayName: 'Alice' },
      context: {},
      action: 'a réagi ❤️ à votre publication',
      entitySubtitle: 'Votre publication',
    });
    expect(result.subtitle).toBe('a réagi ❤️ à votre publication');
    expect(result.subtitle).not.toContain('·');
  });

  it('rend l’action seule quand aucune cible n’est fournie', () => {
    const result = buildPushHeader({
      type: 'friend_new_mood',
      actor: { id: 'u1', username: 'g', displayName: 'G' },
      context: {},
      action: 'a publié une nouvelle humeur',
    });
    expect(result.subtitle).toBe('a publié une nouvelle humeur');
  });

  it('borne le subtitle à 120 caractères', () => {
    const result = buildPushHeader({
      type: 'friend_story_comment',
      actor: { id: 'u1', username: 'alice', displayName: 'Alice' },
      context: {},
      action: `a commenté un réel de ${'x'.repeat(300)}`,
    });
    expect(result.subtitle!.length).toBe(120);
  });

  it('laisse les conversations intactes — l’action ne concerne pas les messages', () => {
    const result = buildPushHeader({
      type: 'new_message',
      actor: { id: 'u1', username: 'alice', displayName: 'Alice' },
      context: { conversationType: 'group', conversationTitle: 'Équipe Dev' },
      action: null,
    });
    expect(result).toEqual({ title: 'Alice', subtitle: 'Équipe Dev' });
  });

  it('préfère une cible explicite au nom de conversation quand il n’y a pas d’action', () => {
    // Comportement historique préservé : `params.subtitle` primait déjà sur le
    // sous-titre dérivé du type.
    const result = buildPushHeader({
      type: 'message_reaction',
      actor: { id: 'u1', username: 'alice', displayName: 'Alice' },
      context: { conversationType: 'group', conversationTitle: 'Équipe Dev' },
      entitySubtitle: 'En réponse à « salut »',
    });
    expect(result.subtitle).toBe('En réponse à « salut »');
  });
});
