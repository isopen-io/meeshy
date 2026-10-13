/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { detachBehaviourOf } from '../consentWithdrawal';

const USER = '6a8832e9731e308cebfb12b0';

async function commandsOf(userId: string) {
  const commands: Record<string, unknown>[] = [];
  await detachBehaviourOf({ $runCommandRaw: async (command) => { commands.push(command); return { ok: 1 }; } }, userId);
  return commands;
}

type Update = { readonly q: unknown; readonly u: unknown; readonly multi: boolean };
const updateOf = (commands: readonly Record<string, unknown>[], collection: string): Update =>
  (commands.find((command) => command.update === collection)?.updates as Update[])[0];

const unsetOf = (update: Update): readonly string[] =>
  (update.u as Record<string, unknown>[]).flatMap((stage) => ('$unset' in stage ? (stage.$unset as string[]) : []));

describe('le retrait du consentement d’analyse détache le comportement déjà rangé', () => {
  it('ne vise que les lignes du compte, toutes', async () => {
    const update = updateOf(await commandsOf(USER), 'ContentEvent');
    expect(update.q).toEqual({ userId: { $oid: USER } });
    expect(update.multi).toBe(true);
  });

  it('retire le compte et ce qui relie ses événements entre eux', async () => {
    const unset = unsetOf(updateOf(await commandsOf(USER), 'ContentEvent'));
    expect(unset).toEqual(expect.arrayContaining([
      'userId', 'appSessionId', 'listing.feedRequestId', 'listing.listingSessionId', 'props.searchNonce', 'props.queryFingerprint',
    ]));
  });

  it('retire les identifiants qui rejoignent une AUTRE ligne portant le compte — l’impression comptée et la mutation', async () => {
    const unset = unsetOf(updateOf(await commandsOf(USER), 'ContentEvent'));
    expect(unset).toEqual(expect.arrayContaining(['props.impressionEventKey', 'props.mutationId']));
  });

  it('ramène les impressions du compte à ce qu’un compte qui REFUSE l’analyse laisse : le comptage, sans mesure ni contexte', async () => {
    const update = updateOf(await commandsOf(USER), 'PostImpression');
    expect(update.q).toEqual({ userId: { $oid: USER } });
    expect(update.multi).toBe(true);
    expect(Object.keys((update.u as { $unset: Record<string, string> }).$unset).sort()).toEqual([
      'appSessionId', 'feedRequestId', 'platform', 'position', 'rankingSource', 'viewable', 'visibleFraction', 'visibleMs',
    ]);
  });
});
