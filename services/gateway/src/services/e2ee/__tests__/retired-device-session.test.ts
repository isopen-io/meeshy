/**
 * La fermeture de la session d'un appareil retiré (#13013) : elle ne dit
 * « fermée » que d'une session qui ne vit plus, et ne coupe la socket qu'alors.
 *
 * @jest-environment node
 */
import { createRetiredDeviceSessionCloser } from '../retired-device-session';

const SESSION = { userId: 'a1'.repeat(12), sessionId: 'c3'.repeat(12) };

function closer(params: { invalidated: boolean; live: boolean }) {
  const disconnected: string[] = [];
  const close = createRetiredDeviceSessionCloser({
    invalidate: async () => params.invalidated,
    isLive: async () => params.live,
    disconnect: async ({ sessionId }) => {
      disconnected.push(sessionId);
    },
  });
  return { close, disconnected };
}

describe('createRetiredDeviceSessionCloser', () => {
  it('une session invalidée est fermée, et sa socket coupée', async () => {
    const { close, disconnected } = closer({ invalidated: true, live: true });
    await expect(close(SESSION)).resolves.toBe(true);
    expect(disconnected).toEqual([SESSION.sessionId]);
  });

  it("une invalidation qui échoue sur une session encore valide n'est PAS une fermeture", async () => {
    const { close, disconnected } = closer({ invalidated: false, live: true });
    await expect(close(SESSION)).resolves.toBe(false);
    expect(disconnected).toEqual([]);
  });

  it('une session déjà close ou échue ne vit plus : fermée', async () => {
    const { close } = closer({ invalidated: false, live: false });
    await expect(close(SESSION)).resolves.toBe(true);
  });
});
