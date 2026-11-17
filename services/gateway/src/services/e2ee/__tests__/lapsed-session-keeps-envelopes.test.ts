/**
 * Constat GW-13 de la revue E2EE du 2026-11-17 (#18906, #19016, rejoint AND-21) —
 * un appareil dont la session finit SANS geste de l'utilisateur (éviction au-delà
 * de `MAX_SESSIONS_PER_USER`, expiration) retrouve, à sa reconnexion, les
 * messages chiffrés qui l'attendaient. Le retrait l'ôte de l'annuaire et vide ses
 * pré-clés ; il ne vide ses enveloppes que sur une fin EXPLICITE (déconnexion,
 * révocation, mot de passe changé…), et le balayage de 30 jours reste la borne.
 *
 * Le chemin complet : enrôlement, enveloppe en attente, fin de session par le
 * motif qu'écrit `SessionService`, retrait, réenrôlement de la MÊME installation
 * (`takeSlot` garde les enveloppes de sa génération), relecture.
 *
 * @jest-environment node
 */
import { createE2EEDirectory } from '../E2EEDirectory';
import { createE2EEEnvelopeRelay } from '../E2EEEnvelopeRelay';
import { retireDevicesOfSession } from '../device-retirement';
import { createFakeE2EEStore, type FakeE2EEStore } from './fake-e2ee-store';
import { fakeDeviceKeys, fakeVerifier } from './fake-signatures';

const ALICE = 'a1'.repeat(12);
const BOB = 'b2'.repeat(12);
const SESSION_BEFORE = 'c3'.repeat(12);
const SESSION_AFTER = 'd4'.repeat(12);
const CONVERSATION = 'f0'.repeat(12);
const NOW = new Date('2026-11-17T12:00:00Z');

type Keys = ReturnType<typeof fakeDeviceKeys>;

const requestOf = (keys: Keys, signedAt: number) => ({
  binding: keys.binding(ALICE, signedAt),
  registrationId: keys.registrationId,
  identityKey: keys.identityKey,
  signedPreKey: keys.signedPreKey,
  kyberLastResort: keys.kyberLastResort,
  platform: 'ios' as const,
  oneTimePreKeys: keys.oneTimePreKeys,
  kyberPreKeys: keys.kyberPreKeys,
});

/** Ce que `SessionService` écrit sur la ligne avant de retirer l'appareil. */
const endSession = (store: FakeE2EEStore, sessionId: string, invalidatedReason: string) => {
  const session = store.collections.UserSession.rows.find((row) => row.id === sessionId);
  if (!session) throw new Error('session absente du banc');
  Object.assign(session, { isValid: false, invalidatedAt: NOW, invalidatedReason });
};

async function enrolledWithAPendingEnvelope() {
  const store = createFakeE2EEStore();
  [SESSION_BEFORE, SESSION_AFTER].forEach((id) =>
    store.collections.UserSession.insert({ id, userId: ALICE, isValid: true, expiresAt: new Date(NOW.getTime() + 86_400_000) }));
  const directory = createE2EEDirectory({ prisma: store.prisma as never, verifier: fakeVerifier, now: () => NOW });
  const keys = fakeDeviceKeys({ oneTime: 2, kyber: 2 });
  const { deviceId } = await directory.enrollDevice({ userId: ALICE, sessionId: SESSION_BEFORE, request: requestOf(keys, NOW.getTime()) });
  store.collections.MessageEnvelope.insert({
    messageId: '0'.repeat(23) + '1', conversationId: CONVERSATION, recipientUserId: ALICE, recipientDeviceId: deviceId,
    recipientRegistrationId: keys.registrationId, senderUserId: BOB, senderDeviceId: 1, type: 3, body: 'Y2lwaGVy',
  });
  const comesBack = () =>
    directory.enrollDevice({ userId: ALICE, sessionId: SESSION_AFTER, request: requestOf(keys, NOW.getTime() + 1) });
  const pendingAfterReturn = () => createE2EEEnvelopeRelay({ prisma: store.prisma as never }).listFor({ userId: ALICE, sessionId: SESSION_AFTER });
  return { store, deviceId, comesBack, pendingAfterReturn };
}

const activeDevicesOf = (store: FakeE2EEStore) => store.collections.E2EEDevice.rows.filter((row) => row.retiredAt === null).length;

describe('GW-13 — une fin de session SANS geste garde les messages chiffrés en attente', () => {
  it.each(['session_limit_exceeded', 'expired', 'EXPIRED'])(
    'motif %s : l’appareil est retiré, son enveloppe reste, et la même installation la relit en revenant',
    async (reason) => {
      const h = await enrolledWithAPendingEnvelope();
      endSession(h.store, SESSION_BEFORE, reason);

      await expect(retireDevicesOfSession(h.store.prisma as never, { sessionId: SESSION_BEFORE, now: NOW })).resolves.toBe(1);
      expect(activeDevicesOf(h.store)).toBe(0);
      expect(h.store.collections.MessageEnvelope.rows).toHaveLength(1);

      await h.comesBack();
      await expect(h.pendingAfterReturn()).resolves.toEqual([expect.objectContaining({ body: 'Y2lwaGVy', senderUserId: BOB })]);
    },
  );
});

describe('GW-13 — une fin de session EXPLICITE efface toujours ce que l’appareil n’a pas lu', () => {
  it.each(['user_revoked', 'logout', 'admin_revoke', 'password_changed', 'PASSWORD_RESET', 'user_revoked_all', 'motif-inconnu'])(
    'motif %s : l’enveloppe est effacée avec le retrait, et rien ne revient',
    async (reason) => {
      const h = await enrolledWithAPendingEnvelope();
      endSession(h.store, SESSION_BEFORE, reason);

      await expect(retireDevicesOfSession(h.store.prisma as never, { sessionId: SESSION_BEFORE, now: NOW })).resolves.toBe(1);
      expect(h.store.collections.MessageEnvelope.rows).toHaveLength(0);

      await h.comesBack();
      await expect(h.pendingAfterReturn()).resolves.toEqual([]);
    },
  );
});
