/**
 * conversation-wire-fields.test.ts
 *
 * `fast-json-stringify` — le sérialiseur de réponse de Fastify — SUPPRIME tout
 * champ absent du schéma déclaré. Sans erreur, sans log, sans le moindre
 * signal : le handler pose la valeur, elle n'atteint jamais le client.
 *
 * `GET /conversations` calcule le rôle du lecteur dans chaque conversation
 * (`currentUserRoleMap`, routes/conversations/core.ts) et le pose sous
 * `currentUserRole`. `conversationMinimalSchema` ne le déclarait pas. Mesuré en
 * production le 2026-08-24 : la clé était absente de CHAQUE ligne de liste.
 *
 * Conséquence en cascade sur les deux clients : iOS masque l'entrée
 * « Réglages » (`ConversationInfoSheet.canManageMembers`), la section de
 * permissions, le bouton d'ajout de membre et toutes les actions de rang —
 * tous adossés à un rôle qui vaut `member` par défaut faute d'être servi. Le
 * créateur d'un groupe ne pouvait donc rien y modifier.
 *
 * Le piège est déjà documenté DEUX fois dans `api-schemas.ts` (`cursorPagination`,
 * `isMember`) et il est tombé une troisième. Ce fichier est la garde qui
 * manquait : il ne lit pas le schéma, il SÉRIALISE et regarde ce qui sort.
 * Un test qui se contenterait d'un `toHaveProperty` sur `schema.properties`
 * passerait au vert sans rien prouver du fil.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import build from 'fast-json-stringify';
import {
  conversationListResponseSchema,
  conversationResponseSchema,
} from '@meeshy/shared/types/api-schemas';

const CONV_ID = '507f1f77bcf86cd7994390bb';

/** Ce que le handler de liste pose réellement pour une ligne de conversation. */
const listRowFromHandler = {
  id: CONV_ID,
  type: 'group',
  title: 'For iOS Testing',
  description: 'Un groupe de test',
  isActive: true,
  memberCount: 6,
  createdAt: '2026-02-25T22:21:26.871Z',
  currentUserRole: 'creator',
  currentUserJoinedAt: '2026-02-25T22:21:26.871Z',
  defaultWriteRole: 'everyone',
  isAnnouncementChannel: false,
  slowModeSeconds: 0,
  autoTranslateEnabled: true,
};

/** Ce que `GET /conversations/:id` pose pour la fiche détaillée. */
const detailFromHandler = {
  ...listRowFromHandler,
  status: 'active',
  visibility: 'private',
  updatedAt: '2026-08-24T10:47:11.986Z',
};

const serializeList = (row: Record<string, unknown>) =>
  JSON.parse(
    build(conversationListResponseSchema as never)({ success: true, data: [row] }),
  ).data[0];

const serializeDetail = (conversation: Record<string, unknown>) =>
  JSON.parse(
    build(conversationResponseSchema as never)({ success: true, data: conversation }),
  ).data;

describe('GET /conversations — ce qui survit à la sérialisation', () => {
  it('sert le rôle du lecteur dans la conversation', () => {
    expect(serializeList(listRowFromHandler).currentUserRole).toBe('creator');
  });

  it("sert la date d'adhésion du lecteur", () => {
    // `currentUserJoinedAt` alimente `memberJoinedAt` du ConversationViewModel
    // iOS, qui borne l'historique visible d'un membre arrivé en cours de route.
    expect(serializeList(listRowFromHandler).currentUserJoinedAt).toBe(
      '2026-02-25T22:21:26.871Z',
    );
  });

  it('sert la description et les quatre réglages de conteneur', () => {
    // L'écran de réglages iOS construit ses valeurs « originales » depuis la
    // conversation de la LISTE : absents du fil, ces champs y arrivaient à leur
    // valeur par défaut, et l'écran affichait une description vide sur un
    // groupe qui en a une.
    const row = serializeList(listRowFromHandler);
    expect(row.description).toBe('Un groupe de test');
    expect(row.defaultWriteRole).toBe('everyone');
    expect(row.isAnnouncementChannel).toBe(false);
    expect(row.slowModeSeconds).toBe(0);
    expect(row.autoTranslateEnabled).toBe(true);
  });
});

describe('GET /conversations/:id — ce qui survit à la sérialisation', () => {
  it('sert le rôle du lecteur dans la conversation', () => {
    expect(serializeDetail(detailFromHandler).currentUserRole).toBe('creator');
  });

  it("sert la date d'adhésion du lecteur", () => {
    expect(serializeDetail(detailFromHandler).currentUserJoinedAt).toBe(
      '2026-02-25T22:21:26.871Z',
    );
  });
});
