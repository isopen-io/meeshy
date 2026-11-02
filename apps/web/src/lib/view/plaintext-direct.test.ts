import { describe, expect, test } from 'bun:test';

import type { ApiResult } from '@/lib/api/http';
import { endToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';

import { openPlaintextDirect, type PlaintextDirectPorts } from './plaintext-direct';

/**
 * **OUVRIR UNE CONVERSATION NON CHIFFRÉE À CÔTÉ DU TÊTE-À-TÊTE CHIFFRÉ**
 * (#12966) — le geste de la fiche Chiffrement : demander à la passerelle le
 * tête-à-tête qu'elle lit (`plaintext: true`), puis y aller. Jamais dans le
 * tête-à-tête chiffré d'où l'on part, ni dans un autre chiffré : une passerelle
 * qui ne connaîtrait pas la demande le rendrait, et y mener serait mentir.
 */
type Served = { readonly id: string; readonly encryptionMode?: string | null };

function ports(served: ApiResult<Served> | Error, online = true) {
  const opened: string[] = [];
  const asked: string[] = [];
  const value: PlaintextDirectPorts = {
    online: () => online,
    open: async (peerId) => {
      asked.push(peerId);
      if (served instanceof Error) throw served;
      return served;
    },
    go: (conversationId) => opened.push(conversationId),
  };
  return { value, opened, asked };
}

const FROM = 'c-sealed';

describe('openPlaintextDirect', () => {
  test('demande le tête-à-tête lisible avec le pair, puis y mène', async () => {
    const p = ports({ ok: true, data: { id: 'c-readable', encryptionMode: null } });
    expect(await openPlaintextDirect(p.value, { peerId: 'u-amina', fromConversationId: FROM })).toBe('opened');
    expect(p.asked).toEqual(['u-amina']);
    expect(p.opened).toEqual(['c-readable']);
  });

  test('hors connexion : rien ne part, rien ne s’ouvre', async () => {
    const p = ports({ ok: true, data: { id: 'c-readable' } }, false);
    expect(await openPlaintextDirect(p.value, { peerId: 'u-amina', fromConversationId: FROM })).toBe('offline');
    expect(p.asked).toEqual([]);
    expect(p.opened).toEqual([]);
  });

  test('un refus ou une panne : échec, on reste où l’on est', async () => {
    const refused = ports({ ok: false, status: 500, error: 'boom' });
    expect(await openPlaintextDirect(refused.value, { peerId: 'u-amina', fromConversationId: FROM })).toBe('failed');
    const thrown = ports(new Error('network'));
    expect(await openPlaintextDirect(thrown.value, { peerId: 'u-amina', fromConversationId: FROM })).toBe('failed');
    expect([...refused.opened, ...thrown.opened]).toEqual([]);
  });

  test('un tête-à-tête que ce compte a déjà VU chiffré, servi sans mode : échec, jamais d’ouverture (#12949)', async () => {
    endToEndRegimeLedger.getState().learnEndToEnd('c-seen-sealed');
    const seen = ports({ ok: true, data: { id: 'c-seen-sealed', encryptionMode: null } });
    expect(await openPlaintextDirect(seen.value, { peerId: 'u-amina', fromConversationId: FROM })).toBe('failed');
    expect(seen.opened).toEqual([]);
    endToEndRegimeLedger.getState().reset();
  });

  test('une passerelle qui rend le tête-à-tête chiffré d’où l’on part, ou un autre chiffré : échec, jamais d’ouverture', async () => {
    const same = ports({ ok: true, data: { id: FROM, encryptionMode: null } });
    expect(await openPlaintextDirect(same.value, { peerId: 'u-amina', fromConversationId: FROM })).toBe('failed');
    const sealed = ports({ ok: true, data: { id: 'c-other', encryptionMode: 'E2EE' } });
    expect(await openPlaintextDirect(sealed.value, { peerId: 'u-amina', fromConversationId: FROM })).toBe('failed');
    expect([...same.opened, ...sealed.opened]).toEqual([]);
  });
});
