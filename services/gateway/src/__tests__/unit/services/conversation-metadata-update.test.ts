/**
 * Les deux fonctions que la route de MEMBRE (`PUT|PATCH /conversations/:id`)
 * et la route SOUVERAINE (`PATCH /admin/conversations/:id`) partagent pour
 * écrire les métadonnées d'une conversation (#7845 E). Extraites de
 * `core-lifecycle.ts` : deux copies de cette composition divergeraient au
 * premier réglage ajouté.
 *
 * @jest-environment node
 */
import {
  composeConversationUpdate,
  broadcastConversationUpdated,
} from '../../../services/conversations/conversation-metadata-update';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

describe('composeConversationUpdate', () => {
  it('ne pose AUCUNE clé pour un champ absent — absent veut dire « ne touche pas »', () => {
    expect(composeConversationUpdate({})).toEqual({ updateData: {}, changedFields: {} });
  });

  it('compose les huit réglages présents, dans les données écrites ET dans l\'annonce', () => {
    const body = {
      title: 'Équipe',
      description: 'Le fil',
      avatar: null,
      banner: 'b.jpg',
      defaultWriteRole: 'admin',
      isAnnouncementChannel: true,
      slowModeSeconds: 10,
      autoTranslateEnabled: false,
    };
    const { updateData, changedFields } = composeConversationUpdate(body);
    expect(updateData).toEqual(body);
    expect(changedFields).toEqual(body);
  });

  it('assainit le titre et la description (XSS) avant de les écrire', () => {
    const { updateData, changedFields } = composeConversationUpdate({
      title: '<script>alert(1)</script>Salon',
      description: '<img src=x onerror=alert(1)>Texte',
    });
    expect(updateData.title).not.toContain('<script>');
    expect(updateData.description).not.toContain('onerror');
    expect(changedFields.title).toBe(updateData.title);
  });

  it('garde un `false` et un `0` — ce sont des valeurs, pas des absences', () => {
    const { updateData } = composeConversationUpdate({ isAnnouncementChannel: false, slowModeSeconds: 0 });
    expect(updateData).toEqual({ isAnnouncementChannel: false, slowModeSeconds: 0 });
  });
});

describe('broadcastConversationUpdated', () => {
  function fauxIO() {
    const emissions: Array<{ rooms: string[]; event: string; payload: Record<string, unknown> }> = [];
    const chain = (rooms: string[]) => ({
      to: (room: string) => chain([...rooms, room]),
      emit: (event: string, payload: Record<string, unknown>) => {
        emissions.push({ rooms, event, payload });
        return true;
      },
    });
    return { io: { to: (room: string) => chain([room]) }, emissions };
  }

  it('diffuse conversation:updated à la room ET aux rooms personnelles des ACTIFS seuls', () => {
    const { io, emissions } = fauxIO();
    broadcastConversationUpdated({
      io: io as never,
      conversationId: 'c1',
      participants: [
        { id: 'p1', userId: 'u1', isActive: true },
        { id: 'p2', userId: null, isActive: true },
        { id: 'p3', userId: 'u3', isActive: false },
      ],
      changedFields: { title: 'Nouveau' },
      updatedBy: 'admin-1',
    });

    expect(emissions).toHaveLength(1);
    expect(emissions[0].event).toBe(SERVER_EVENTS.CONVERSATION_UPDATED);
    expect(emissions[0].rooms).toEqual([ROOMS.conversation('c1'), ROOMS.user('u1'), ROOMS.user('p2')]);
    expect(emissions[0].payload).toMatchObject({ conversationId: 'c1', title: 'Nouveau', updatedBy: { id: 'admin-1' } });
    expect(typeof emissions[0].payload.updatedAt).toBe('string');
    expect(emissions[0].payload).not.toHaveProperty('lastMessageTranslations');
  });

  it('ne fait rien sans couche Socket.IO', () => {
    expect(() => broadcastConversationUpdated({
      io: null,
      conversationId: 'c1',
      participants: [],
      changedFields: { title: 'x' },
      updatedBy: 'a',
    })).not.toThrow();
  });
});
