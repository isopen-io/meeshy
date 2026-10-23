/**
 * #12543 — **la fin d'une session retire l'appareil chiffré qu'elle avait
 * enrôlé** : déconnexion, révocation (par l'utilisateur, par l'admin, par
 * l'éviction au-delà de MAX_SESSIONS_PER_USER), « déconnecter partout ».
 * Sans ce retrait, les appareils morts s'accumulaient jusqu'à rendre le compte
 * injoignable en E2EE.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { createHash } from 'crypto';
import {
  endCurrentSession,
  initSessionService,
  invalidateAllSessions,
  invalidateSession,
  logout,
} from '../../../services/SessionService';
import { createFakeE2EEStore } from '../../../services/e2ee/__tests__/fake-e2ee-store';

const ALICE = 'a1'.repeat(12);
const S1 = 'c3'.repeat(12);
const S2 = 'd4'.repeat(12);
const TOKEN = 'jeton-de-la-session-1';

function aliceWithTwoDevices() {
  const store = createFakeE2EEStore();
  [S1, S2].forEach((id, index) => {
    store.collections.UserSession.insert({
      id, userId: ALICE, isValid: true, sessionToken: createHash('sha256').update(index === 0 ? TOKEN : 'autre').digest('hex'),
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    store.collections.E2EEDevice.insert({ userId: ALICE, deviceId: index + 1, registrationId: 100 + index, sessionId: id, identityKey: 'ik', platform: 'ios' });
    store.collections.E2EEOneTimePreKey.insert({ userId: ALICE, deviceId: index + 1, kind: 'ec', keyId: 1, publicKey: 'cGs=' });
  });
  initSessionService(store.prisma as never);
  const active = () => store.collections.E2EEDevice.rows.filter((row) => row.retiredAt === null).map((row) => row.deviceId);
  return { store, active };
}

describe("la fin d'une session retire son appareil chiffré", () => {
  it('à la révocation de CETTE session, et seulement elle', async () => {
    const { store, active } = aliceWithTwoDevices();

    await invalidateSession(S1, 'user_revoked');

    expect(active()).toEqual([2]);
    expect(store.collections.E2EEOneTimePreKey.rows.map((row) => row.deviceId)).toEqual([2]);
  });

  it('à la déconnexion par le jeton de session', async () => {
    const { active } = aliceWithTwoDevices();

    await logout(TOKEN);

    expect(active()).toEqual([2]);
  });

  it('à la déconnexion de la session courante nommée par son sid', async () => {
    const { active } = aliceWithTwoDevices();

    await endCurrentSession(ALICE, { sessionId: S2 });

    expect(active()).toEqual([1]);
  });

  it('à « déconnecter partout »', async () => {
    const { active } = aliceWithTwoDevices();

    await invalidateAllSessions(ALICE);

    expect(active()).toEqual([]);
  });

  it("ne fait jamais échouer la fermeture de session quand l'annuaire est indisponible", async () => {
    const { store } = aliceWithTwoDevices();
    initSessionService({ ...store.prisma, e2EEDevice: undefined } as never);

    await expect(invalidateSession(S1, 'user_revoked')).resolves.toBe(true);
  });
});
