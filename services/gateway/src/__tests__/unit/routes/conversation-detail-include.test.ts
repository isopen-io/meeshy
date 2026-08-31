import {
  conversationDetailInclude,
  conversationUserPreferencesSelect,
  CONVERSATION_DETAIL_PARTICIPANTS_CAP
} from '../../../routes/conversations/core';

/**
 * Iter 33 (F1) + iter 35 (F8) — bandwidth guards for the GET /conversations/:id
 * DETAIL include. Iter 33 capped hydrated participants (active only, max 100).
 * Iter 35 converts the participant `include` to a strict `select`: the wire
 * schema (`conversationParticipantSchema`) already strips everything else via
 * fast-json-stringify, so the DB was hydrating dead scalars — including the
 * sensitive `sessionTokenHash` and the embedded `anonymousSession` document —
 * for up to 100 participants on every conversation open.
 */
describe('conversationDetailInclude (F1 participants cap + F8 strict select)', () => {
  const participants = conversationDetailInclude.participants as {
    where: unknown;
    orderBy: unknown;
    take: number;
    select: Record<string, unknown>;
  };

  it('only includes active participants — members who left are served by the dedicated endpoint', () => {
    expect(participants.where).toEqual({ isActive: true });
  });

  it('caps hydrated participants at the detail preview limit', () => {
    expect(CONVERSATION_DETAIL_PARTICIPANTS_CAP).toBe(100);
    expect(participants.take).toBe(CONVERSATION_DETAIL_PARTICIPANTS_CAP);
  });

  it('orders by joinedAt asc so the capped page is deterministic (DM peers always present)', () => {
    expect(participants.orderBy).toEqual({ joinedAt: 'asc' });
  });

  it('selects exactly the participant scalars the wire schema declares', () => {
    const select = { ...participants.select };
    delete select.user;
    expect(Object.keys(select).sort()).toEqual([
      'avatar',
      'displayName',
      'id',
      'isActive',
      'isOnline',
      'joinedAt',
      'lastActiveAt',
      'permissions',
      'role',
      'type',
      'userId'
    ]);
  });

  it('never hydrates sensitive or dead participant fields (stripped from the wire anyway)', () => {
    for (const field of ['sessionTokenHash', 'anonymousSession', 'shareLinkId', 'deletedForMe', 'leftAt', 'bannedAt', 'nickname', 'conversationId', 'language']) {
      expect(participants.select[field]).toBeUndefined();
    }
  });

  it('keeps the nested user fields the server needs for default title generation (the wire strips nested user)', () => {
    const userSelect = (participants.select.user as { select: Record<string, unknown> }).select;
    expect(Object.keys(userSelect).sort()).toEqual([
      'displayName',
      'firstName',
      'id',
      'lastName',
      'username'
    ]);
  });

  it('exposes the exact active-member total so clients never need the full roster for a count', () => {
    expect(conversationDetailInclude._count).toEqual({
      select: { participants: { where: { isActive: true } } }
    });
  });
});

/**
 * Titre DM stable — le select des userPreferences (liste ET détail) doit
 * inclure `customName` : c'est lui qui pilote le nom affiché d'un DM côté
 * client. Son absence créait un flip-flop de titre (liste froide = nom du
 * participant, premier pin/mute = surnom via la réponse du PATCH préférences —
 * vu « sandra raveloson » → « Sany » 2026-07-04). `reaction` était sélectionné
 * mais strippé du wire (conversationMinimalSchema) — les deux contrats sont
 * verrouillés ensemble, ce test côté DB, api-schemas.test.ts côté wire.
 */
describe('conversationUserPreferencesSelect (titre DM stable)', () => {
  it('hydrate exactement les préférences que le wire déclare — customName et reaction compris', () => {
    expect(Object.keys(conversationUserPreferencesSelect).sort()).toEqual([
      'categoryId',
      // Ajouté pour le masquage personnel de l'aperçu de ligne de liste
      // (`resolveVisibleLastMessages`). Contrairement aux autres clés, il est
      // lu SERVEUR-side uniquement : le wire ne le déclare pas, donc
      // fast-json-stringify le strippe. Il est ici parce qu'il vit dans le
      // MÊME document que les préférences déjà sélectionnées — le lire coûte
      // zéro requête, alors qu'une lecture séparée en aurait coûté une par
      // chargement de liste.
      //
      // `deletedForUserAt` figurait ici pour la même raison, et n'y figure
      // plus : `95ca2becd2` l'a retiré du `select` en même temps que des deux
      // contrats de fil (arbitrage (a) — un champ sans écrivain servait
      // « pas supprimée » à une conversation RÉELLEMENT dans la corbeille).
      // Un témoin qui gèle la composition d'un `select` tombe quand ce
      // `select` change à dessein : c'est son travail, et c'est ici la seule
      // ligne à en tirer.
      'clearHistoryBefore',
      'customName',
      'isArchived',
      'isMuted',
      'isPinned',
      'reaction',
      // G-123 — choix collant du mode de lecture (G-121), lu pour l'entrée
      // d'orchestrateur du pont ✦ (workshop A6). SERVEUR-side uniquement,
      // comme `clearHistoryBefore` : le wire ne le
      // déclare pas, `fast-json-stringify` le strippe de la réponse.
      'readingMode',
      'tags'
    ]);
  });
});
