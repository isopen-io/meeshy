/**
 * « X a rejoint la conversation » — une seule loi pour les quatre portes.
 *
 * Quatre chemins font entrer quelqu'un dans une conversation, et aucun ne le
 * disait au fil :
 *
 *   | porte                                     | qui entre                 |
 *   |-------------------------------------------|---------------------------|
 *   | `POST /anonymous/join/:linkId`            | un anonyme, par lien      |
 *   | `POST /conversations/join/:linkId`        | un inscrit, par lien      |
 *   | `POST /conversations/:id/participants`    | ajouté par un membre      |
 *   | `POST /conversations/:id/invite`          | invité par un membre      |
 *
 * Les membres présents voyaient donc un inconnu prendre la parole sans jamais
 * avoir vu arriver personne — et rien ne signalait qu'il s'agissait d'un
 * visiteur SANS COMPTE, la distinction la plus importante quand la porte est un
 * lien public.
 *
 * Le texte stocké est un REPLI, pas la vérité affichée : le sens vit dans
 * `metadata`, que les clients rendent dans la langue du lecteur. Même contrat
 * que le résumé d'appel (`CallSystemMessage`), dont le `content` est vide et
 * dont toute la substance est dans `metadata.kind`.
 *
 * L'avis est un ACCESSOIRE de l'entrée, jamais sa condition : une panne d'écriture
 * ou de diffusion ne doit pas renvoyer un anonyme qui vient d'être admis — pour
 * lui, ce lien est la seule porte, et il n'y a pas de seconde tentative.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { postJoinSystemMessage, JOIN_SYSTEM_MESSAGE_KIND } from '../../../../services/conversations/joinSystemMessage';

const CONV_ID = '507f1f77bcf86cd799439022';
const PARTICIPANT_ID = '507f1f77bcf86cd799439033';

type Harness = {
  prisma: { message: { create: jest.Mock } };
  broadcast: jest.Mock;
};

function harness(): Harness {
  return {
    prisma: {
      message: {
        create: jest.fn<any>().mockImplementation(async ({ data }: any) => ({ id: 'msg-1', ...data })),
      },
    },
    broadcast: jest.fn<any>().mockResolvedValue(undefined),
  };
}

const anonymousJoin = {
  conversationId: CONV_ID,
  participantId: PARTICIPANT_ID,
  displayName: 'ano_bob_sm123',
  isAnonymous: true,
  viaShareLink: true,
};

const registeredJoin = {
  conversationId: CONV_ID,
  participantId: PARTICIPANT_ID,
  displayName: 'Alice Smith',
  isAnonymous: false,
  viaShareLink: false,
};

describe('postJoinSystemMessage', () => {
  let h: Harness;
  beforeEach(() => { h = harness(); });

  it('écrit un message SYSTÈME attribué au participant qui arrive', async () => {
    await postJoinSystemMessage(h as never, registeredJoin);

    const { data } = h.prisma.message.create.mock.calls[0][0] as any;
    expect(data).toMatchObject({
      conversationId: CONV_ID,
      senderId: PARTICIPANT_ID,
      messageType: 'system',
      messageSource: 'system',
    });
  });

  it('porte le sens dans `metadata`, pas dans le texte — les clients localisent', async () => {
    await postJoinSystemMessage(h as never, anonymousJoin);

    const { data } = h.prisma.message.create.mock.calls[0][0] as any;
    expect(data.metadata).toEqual({
      kind: JOIN_SYSTEM_MESSAGE_KIND,
      participantId: PARTICIPANT_ID,
      displayName: 'ano_bob_sm123',
      isAnonymous: true,
      viaShareLink: true,
    });
  });

  it('dit explicitement que l’arrivant n’a PAS de compte', async () => {
    await postJoinSystemMessage(h as never, anonymousJoin);

    const { data } = h.prisma.message.create.mock.calls[0][0] as any;
    expect(data.metadata.isAnonymous).toBe(true);
    expect(data.content).toMatch(/sans compte/i);
  });

  it('CONTRE-ÉPREUVE — n’invente pas « sans compte » pour un inscrit', async () => {
    await postJoinSystemMessage(h as never, registeredJoin);

    const { data } = h.prisma.message.create.mock.calls[0][0] as any;
    expect(data.metadata.isAnonymous).toBe(false);
    expect(data.content).not.toMatch(/sans compte/i);
  });

  it('nomme l’arrivant dans le repli texte', async () => {
    await postJoinSystemMessage(h as never, registeredJoin);

    const { data } = h.prisma.message.create.mock.calls[0][0] as any;
    expect(data.content).toContain('Alice Smith');
  });

  it('diffuse le message pour que les présents le voient arriver en direct', async () => {
    await postJoinSystemMessage(h as never, registeredJoin);

    expect(h.broadcast).toHaveBeenCalledTimes(1);
    expect(h.broadcast.mock.calls[0][1]).toBe(CONV_ID);
  });

  it('n’exige pas de diffuseur — une conversation peut être servie sans socket', async () => {
    const created = await postJoinSystemMessage(
      { prisma: h.prisma, broadcast: undefined } as never,
      registeredJoin
    );

    expect(created).not.toBeNull();
  });

  // Les deux témoins suivants portent l'invariant central : l'avis est un
  // accessoire de l'entrée. Ils échouent si le service se met à propager.
  it('AVALE une panne de diffusion — l’entrée est déjà acquise', async () => {
    h.broadcast.mockRejectedValue(new Error('socket down'));

    await expect(postJoinSystemMessage(h as never, anonymousJoin)).resolves.not.toThrow();
  });

  it('AVALE une panne d’écriture et rend `null`', async () => {
    h.prisma.message.create.mockRejectedValue(new Error('mongo down'));

    await expect(postJoinSystemMessage(h as never, anonymousJoin)).resolves.toBeNull();
  });

  it('ne diffuse rien quand l’écriture a échoué', async () => {
    h.prisma.message.create.mockRejectedValue(new Error('mongo down'));

    await postJoinSystemMessage(h as never, anonymousJoin);

    expect(h.broadcast).not.toHaveBeenCalled();
  });

  it('distingue l’arrivée PAR LIEN de l’ajout par un membre', async () => {
    await postJoinSystemMessage(h as never, anonymousJoin);
    await postJoinSystemMessage(h as never, registeredJoin);

    const first = (h.prisma.message.create.mock.calls[0][0] as any).data.metadata;
    const second = (h.prisma.message.create.mock.calls[1][0] as any).data.metadata;
    expect(first.viaShareLink).toBe(true);
    expect(second.viaShareLink).toBe(false);
  });
});
