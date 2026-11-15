/**
 * La barrière de session (#13013) : une session dont l'appareil a été retiré
 * par le propriétaire ne garde AUCUN appareil actif, même quand un enrôlement
 * court en même temps que le retrait.
 *
 * @jest-environment node
 */
import { E2EE_ERROR_CODES } from '@meeshy/shared/types/e2ee-directory';
import { createE2EEDirectory, E2EEDirectoryError } from '../E2EEDirectory';
import { createFakeE2EEStore } from './fake-e2ee-store';
import { fakeDeviceKeys, fakeVerifier } from './fake-signatures';

const NOW = new Date('2026-10-23T12:00:00Z');
const ALICE = 'a1'.repeat(12);
const THIEF = 'c3'.repeat(12);
const OWNER = 'd4'.repeat(12);
const OTHER = 'e5'.repeat(12);

type Keys = ReturnType<typeof fakeDeviceKeys>;

const requestOf = (keys: Keys) => ({
  binding: keys.binding(ALICE, NOW.getTime()),
  registrationId: keys.registrationId,
  identityKey: keys.identityKey,
  signedPreKey: keys.signedPreKey,
  kyberLastResort: keys.kyberLastResort,
  platform: 'ios' as const,
  oneTimePreKeys: keys.oneTimePreKeys,
  kyberPreKeys: keys.kyberPreKeys,
});

function setup() {
  const store = createFakeE2EEStore();
  [THIEF, OWNER, OTHER].forEach((id) => store.collections.UserSession.insert({ id, isValid: true, expiresAt: new Date(NOW.getTime() + 86_400_000) }));
  const directory = createE2EEDirectory({ prisma: store.prisma as never, verifier: fakeVerifier, now: () => NOW });
  const enroll = (sessionId: string, registrationId: number) =>
    directory.enrollDevice({ userId: ALICE, sessionId, request: requestOf(fakeDeviceKeys({ registrationId })) });
  const activeOf = (sessionId: string) => store.collections.E2EEDevice.rows.filter((row) => row.sessionId === sessionId && row.retiredAt === null);
  return { store, directory, enroll, activeOf };
}

describe('la barrière de session', () => {
  it("un enrôlement du voleur pendant la fermeture ne laisse aucun appareil actif sur la session retirée", async () => {
    const { directory, enroll, activeOf } = setup();
    const other = await enroll(OTHER, 11);
    const stolen = await enroll(THIEF, 22);
    await directory.retireDevice({ userId: ALICE, deviceId: other.deviceId });

    const result = await directory.retireDevice({
      userId: ALICE,
      deviceId: stolen.deviceId,
      signOut: {
        callerSessionId: OWNER,
        close: async () => {
          await enroll(THIEF, 33);
          return true;
        },
      },
    });

    expect(result).toEqual({ signedOut: true });
    expect(activeOf(THIEF)).toEqual([]);
  });

  it("une barrière posée PENDANT l'enrôlement le défait : 403 et aucun appareil actif", async () => {
    const { store, enroll, activeOf } = setup();
    const delegate = store.prisma.e2EERevokedIdentity as { findFirst: (args: { where: Record<string, unknown> }) => Promise<unknown> };
    const findFirst = delegate.findFirst.bind(delegate);
    const seen = { barrierChecks: 0 };
    delegate.findFirst = async (args) => {
      if (args.where.sessionId === THIEF && (seen.barrierChecks += 1) === 1) {
        const answer = await findFirst(args);
        store.collections.E2EERevokedIdentity.insert({ userId: ALICE, identityKey: 'cmV2b2tlZA==', sessionId: THIEF });
        return answer;
      }
      return findFirst(args);
    };

    const refusal = await enroll(THIEF, 44).then(
      () => null,
      (error: unknown) => error,
    );

    expect(refusal).toBeInstanceOf(E2EEDirectoryError);
    expect((refusal as E2EEDirectoryError).code).toBe(E2EE_ERROR_CODES.SESSION_RETIRED);
    expect(activeOf(THIEF)).toEqual([]);
  });
});
