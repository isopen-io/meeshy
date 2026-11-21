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

  // `bannedAt` est OBLIGATOIRE dans la signature depuis #20103 : un champ non
  // projeté vaut `undefined`, et `undefined == null` est vrai, donc la garde
  // rendrait `true` pour un banni. Le compilateur est ici la garde, et cette
  // fixture le montre — la retirer ne compile plus.
  it('diffuse conversation:updated à la room ET aux rooms personnelles des ACTIFS seuls', () => {
    const { io, emissions } = fauxIO();
    broadcastConversationUpdated({
      io: io as never,
      conversationId: 'c1',
      participants: [
        { id: 'p1', userId: 'u1', isActive: true, bannedAt: null },
        { id: 'p2', userId: null, isActive: true, bannedAt: null },
        { id: 'p3', userId: 'u3', isActive: false, bannedAt: null },
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

describe("#20103 — ce que `conversation:updated` PORTE décide de son audience", () => {
  /**
   * `conversation:updated` transporte le TITRE, la description, l'avatar et la
   * bannière — du CONTENU, pas une rétractation. Un membre actif-et-banni n'a
   * accès ni à la room du fil ni à son REST : lui servir le nouveau titre lui
   * donne un contenu qu'aucune autre porte ne lui rend, et c'est exactement la
   * fuite que #20110 a fermée sur la charge d'ARRIVÉE d'un groupe.
   *
   * La loi se juge donc sur `participationEstVivante`, pas sur `isActive` nu —
   * et le TYPE de l'unité exige `bannedAt`, pour qu'une projection qui l'omet
   * ne compile pas : un champ non projeté vaut `undefined`, et
   * `undefined == null` est vrai, donc la garde rendrait `true` pour un banni
   * sans qu'aucun témoin ne rougisse (#20136).
   */
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

  it("ne sert pas le nouveau titre à un membre actif-et-BANNI", () => {
    const { io, emissions } = fauxIO();
    broadcastConversationUpdated({
      io: io as never,
      conversationId: 'c1',
      participants: [
        { id: 'p1', userId: 'u1', isActive: true, bannedAt: null },
        { id: 'p2', userId: 'u2', isActive: true, bannedAt: new Date('2026-11-01T00:00:00.000Z') },
      ],
      changedFields: { title: 'Nouveau' },
      updatedBy: 'admin-1',
    });

    expect(emissions).toHaveLength(1);
    expect(emissions[0].rooms).not.toContain(ROOMS.user('u2'));
    // La mesure INVERSE, sans laquelle « n'atteint personne » passerait aussi.
    expect(emissions[0].rooms).toEqual([ROOMS.conversation('c1'), ROOMS.user('u1')]);
    expect(emissions[0].payload).toMatchObject({ title: 'Nouveau' });
  });

  it("sert les vivants dont la colonne `bannedAt` est ABSENTE du document", () => {
    const { io, emissions } = fauxIO();
    broadcastConversationUpdated({
      io: io as never,
      conversationId: 'c1',
      // `bannedAt: undefined` est la forme que MongoDB rend pour un participant
      // JAMAIS banni : la colonne n'est pas dans le document. La confondre avec
      // un bannissement fermerait l'annonce à toute la population.
      participants: [{ id: 'p1', userId: 'u1', isActive: true, bannedAt: undefined }],
      changedFields: { title: 'Nouveau' },
      updatedBy: 'admin-1',
    });

    expect(emissions).toHaveLength(1);
    expect(emissions[0].rooms).toEqual([ROOMS.conversation('c1'), ROOMS.user('u1')]);
  });

  it("ne nomme AUCUNE room personnelle quand plus aucun membre n'est vivant", () => {
    const { io, emissions } = fauxIO();
    broadcastConversationUpdated({
      io: io as never,
      conversationId: 'c1',
      participants: [
        { id: 'p1', userId: 'u1', isActive: false, bannedAt: null },
        { id: 'p2', userId: 'u2', isActive: true, bannedAt: new Date('2026-11-01T00:00:00.000Z') },
      ],
      changedFields: { title: 'Nouveau' },
      updatedBy: 'admin-1',
    });

    // La room de conversation reste seule en tête de chaîne : un banni n'y a
    // pas accès (il n'y entre pas à la connexion socket), donc elle ne le
    // porte pas. Ce qui devait disparaître est sa room PERSONNELLE, le seul
    // chemin qui joint un client posé sur l'écran de LISTE.
    expect(emissions).toHaveLength(1);
    expect(emissions[0].rooms).toEqual([ROOMS.conversation('c1')]);
  });
});
