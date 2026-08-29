/**
 * Révoquer une session coupe le socket de CET appareil, et lui seul (#4213).
 *
 * Un socket inscrit s'authentifie au JWT SEUL, et n'est jamais revérifié après
 * le connect. `UserSession.sessionToken` stocke le hash d'un jeton opaque que
 * rien n'obligeait le client à transmettre au handshake : il n'existait donc
 * AUCUN moyen de dire quel socket appartient à quelle session, et révoquer une
 * session laissait l'appareil recevoir tout le temps réel indéfiniment.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { disconnectSession, SOCKET_SESSION_ID } from '../disconnectSession';

const UTILISATEUR = 'u-1';

function socketDouble(sessionId?: string) {
  return {
    data: sessionId ? { [SOCKET_SESSION_ID]: sessionId } : {},
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
}

function ioDouble(sockets: ReturnType<typeof socketDouble>[]) {
  const salle = { fetchSockets: jest.fn<any>(async () => sockets) };
  return { io: { in: jest.fn((_room: string) => salle) }, salle };
}

describe('Seul le socket VISÉ est coupé', () => {
  it("ferme le socket de la session nommée", async () => {
    const vise = socketDouble('sess-A');
    const { io } = ioDouble([vise]);

    const fermes = await disconnectSession({ io: io as never, userId: UTILISATEUR, sessionId: 'sess-A' });

    expect(fermes).toBe(1);
    // Émettre PUIS fermer : l'émission est une courtoisie au client conforme,
    // c'est la fermeture qui révoque.
    expect(vise.emit).toHaveBeenCalledWith('auth:session-revoked', expect.objectContaining({ code: 'session_revoked' }));
    expect(vise.disconnect).toHaveBeenCalledWith(true);
  });

  it("laisse connecté le socket d'une AUTRE session — c'est le témoin qui compte", async () => {
    // Une révocation qui déconnecte trop est indiscernable d'une panne, et
    // l'utilisateur la vit comme telle. `disconnectRevokedSessions` couperait
    // celui-ci : c'est pourquoi ces deux fonctions sont distinctes.
    const vise = socketDouble('sess-A');
    const epargne = socketDouble('sess-B');
    const { io } = ioDouble([vise, epargne]);

    const fermes = await disconnectSession({ io: io as never, userId: UTILISATEUR, sessionId: 'sess-A' });

    expect(fermes).toBe(1);
    expect(epargne.disconnect).not.toHaveBeenCalled();
    expect(epargne.emit).not.toHaveBeenCalled();
  });

  it("laisse connecté un socket SANS identifiant de session — le repli est une décision", async () => {
    // Un client antérieur à ce lot ne transmet pas son jeton au handshake.
    // Couper tous les sockets anonymes de session reviendrait à déconnecter
    // toutes les versions installées à chaque révocation d'une session tierce,
    // y compris celle depuis laquelle on agit. Le contrôle qui compte reste la
    // révocation EN BASE, déjà committée.
    const ancien = socketDouble(undefined);
    const { io } = ioDouble([ancien]);

    const fermes = await disconnectSession({ io: io as never, userId: UTILISATEUR, sessionId: 'sess-A' });

    expect(fermes).toBe(0);
    expect(ancien.disconnect).not.toHaveBeenCalled();
  });

  it("cherche dans la room PERSONNELLE de l'utilisateur", async () => {
    const { io } = ioDouble([]);

    await disconnectSession({ io: io as never, userId: UTILISATEUR, sessionId: 'sess-A' });

    expect(io.in).toHaveBeenCalledWith(`user:${UTILISATEUR}`);
  });
});

describe('Best-effort : la révocation est déjà écrite', () => {
  it('ne lève pas quand il n’y a pas d’adaptateur', async () => {
    await expect(disconnectSession({ io: null, userId: UTILISATEUR, sessionId: 'sess-A' })).resolves.toBe(0);
  });

  it("ne lève pas quand l'adaptateur échoue — et le signale à l'appelant", async () => {
    const onError = jest.fn();
    const io = { in: () => ({ fetchSockets: jest.fn<any>(async () => { throw new Error('adapter down'); }) }) };

    const fermes = await disconnectSession({ io: io as never, userId: UTILISATEUR, sessionId: 'sess-A', onError });

    expect(fermes).toBe(0);
    expect(onError).toHaveBeenCalled();
  });

  it('ne fait rien sans identifiant de session — jamais une coupe générale par défaut', async () => {
    const socket = socketDouble('sess-A');
    const { io } = ioDouble([socket]);

    expect(await disconnectSession({ io: io as never, userId: UTILISATEUR, sessionId: '' })).toBe(0);
    expect(socket.disconnect).not.toHaveBeenCalled();
  });
});
