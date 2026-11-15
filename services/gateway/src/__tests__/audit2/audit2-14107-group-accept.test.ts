/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { acceptMessageRequest } from '../../services/messaging/messageRequests';
import { relationPairKey } from '@meeshy/shared/types/relation';
import { ADULT_BIRTH, MINOR_BIRTH, messagingWorld } from '../helpers/messaging-circle-world';

const NOW = new Date('2026-11-02T12:00:00.000Z');
const OLD = new Date('2025-01-01T00:00:00.000Z');
const AJOUTEUR = '6300000000000000000000a1';
const MUET = '6300000000000000000000a2';
const MINEUR = '6300000000000000000000a3';
const GROUPE = '6300000000000000000000d1';

describe('contre-audit #14107 — accepter une demande de GROUPE', () => {
  const monde = () =>
    messagingWorld({
      users: [
        { id: AJOUTEUR, birthDate: ADULT_BIRTH, createdAt: OLD },
        { id: MUET, birthDate: ADULT_BIRTH, createdAt: OLD },
        { id: MINEUR, birthDate: MINOR_BIRTH, createdAt: OLD },
      ],
      conversations: [{ id: GROUPE, type: 'group' }],
      participants: [
        // L'ordre de lecture n'est pas celui de l'ajout : un membre quelconque, réduit au silence par l'hôte, vient en premier.
        { id: 'p-muet', conversationId: GROUPE, userId: MUET, role: 'member', isActive: true, permissions: { canSendMessages: false, canSendImages: false } },
        { id: 'p-ajouteur', conversationId: GROUPE, userId: AJOUTEUR, role: 'admin', isActive: true, permissions: {} },
        { id: 'p-mineur', conversationId: GROUPE, userId: MINEUR, role: 'member', isActive: true, messageRequestAt: new Date('2026-11-01T00:00:00.000Z'), messageRequestRisk: 100, messageRequestFromId: AJOUTEUR },
      ],
    });

  it('ne relève le lien qu\'avec celui qui a fait entrer, et ne réécrit les droits d\'aucun autre membre', async () => {
    const world = monde();
    const verdict = await acceptMessageRequest(world.prisma as unknown as PrismaClient, { conversationId: GROUPE, userId: MINEUR, now: NOW });
    const muet = world.participant.rows.find((p) => p.id === 'p-muet');
    const paireMuet = relationPairKey(MINEUR, MUET);
    const lienAvecMuet = world.relations.relations().find((r: any) => r.userLowId === paireMuet.userLowId && r.userHighId === paireMuet.userHighId);
    expect({
      requester: verdict.kind === 'accepted' ? verdict.requesterId : null,
      droitsDuMuet: muet?.permissions,
      lienAvecMuet: lienAvecMuet ?? null,
    }).toEqual({
      requester: AJOUTEUR,
      droitsDuMuet: { canSendMessages: false, canSendImages: false },
      lienAvecMuet: null,
    });
  });

  it('une demande de groupe antérieure à la colonne de provenance se lève sans relever aucun lien ni toucher aucun droit (audit 3, M-a)', async () => {
    const world = monde();
    const mineur = world.participant.rows.find((p) => p.id === 'p-mineur');
    if (mineur) delete mineur.messageRequestFromId;
    const verdict = await acceptMessageRequest(world.prisma as unknown as PrismaClient, { conversationId: GROUPE, userId: MINEUR, now: NOW });
    expect(verdict).toEqual({ kind: 'accepted', requesterId: null, requesterParticipantId: null, levelRaised: false });
    expect(mineur?.messageRequestAt).toBeNull();
    expect(world.relations.relations()).toHaveLength(0);
    expect(world.participant.rows.find((p) => p.id === 'p-muet')?.permissions).toEqual({ canSendMessages: false, canSendImages: false });
  });
});
