import { describe, expect, test } from 'bun:test';

import { EXTERNAL_CONVERSATION_ERROR_CODES } from '@meeshy/shared/types/external-conversation';
import { EXTERNAL_INTEROP_NOTICE_VERSION, type ExternalInteropConsentStatus } from '@meeshy/shared/types/external-interop-compliance';

import type { ApiResult } from './http';
import {
  consentAnswerOf,
  type ConsentAnswer,
  readExternalInteropConsent,
  recordExternalInteropConsent,
  reportExternalContent,
  type ExternalInteropDeps,
} from './external-interop-compliance';

/**
 * LES PORTES DE CONFORMITÉ DE L'INTEROPÉRABILITÉ (#17120) — ce qui part sur le fil : la version de l'information
 * que CE client montre (jamais une date), et le texte d'un signalement seulement s'il a été joint.
 */
type Sent = { readonly method: string; readonly path: string; readonly body?: unknown };

const gateway = () => {
  const sent: Sent[] = [];
  const deps: ExternalInteropDeps = {
    source: 'gateway',
    transport: {
      request: async <T,>(request: Sent) => {
        sent.push(request);
        return { ok: true, data: {} as T } as const;
      },
    } as ExternalInteropDeps['transport'],
  };
  return { deps, sent };
};

describe('le consentement', () => {
  test('se lit pour WhatsApp', async () => {
    const { deps, sent } = gateway();
    await readExternalInteropConsent(deps);
    expect(sent).toEqual([{ method: 'GET', path: '/api/v1/conversations/external/consent?network=whatsapp' }]);
  });

  test('s’écrit sous la version que ce client montre, sans aucune date', async () => {
    const { deps, sent } = gateway();
    await recordExternalInteropConsent(deps, true);
    expect(sent).toEqual([
      { method: 'PUT', path: '/api/v1/conversations/external/consent', body: { network: 'whatsapp', noticeVersion: EXTERNAL_INTEROP_NOTICE_VERSION, granted: true } },
    ]);
  });

  test('en fixtures, la porte se dit absente sans appel', async () => {
    const { sent } = gateway();
    const result = await readExternalInteropConsent({ source: 'fixtures', transport: { request: async () => { throw new Error('jamais'); } } as ExternalInteropDeps['transport'] });
    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(sent).toEqual([]);
  });

  const ANSWERS: ReadonlyArray<readonly [ApiResult<ExternalInteropConsentStatus> | null, ConsentAnswer]> = [
    [{ ok: false, status: 409, error: 'x', code: EXTERNAL_CONVERSATION_ERROR_CODES.NOTICE_OUTDATED }, 'outdated'],
    [{ ok: false, status: 403, error: 'x', code: EXTERNAL_CONVERSATION_ERROR_CODES.DISABLED }, 'unavailable'],
    [{ ok: false, status: 404, error: 'x' }, 'unavailable'],
    [{ ok: false, status: 500, error: 'x' }, 'failed'],
    [null, 'failed'],
  ];
  for (const [result, expected] of ANSWERS) {
    test(`une réponse ${JSON.stringify(result)} se lit « ${expected} »`, () => {
      expect(consentAnswerOf(result)).toBe(expected);
    });
  }
});

describe('le signalement', () => {
  test('ne transporte aucun texte quand rien n’a été joint', async () => {
    const { deps, sent } = gateway();
    await reportExternalContent(deps, '6730c0ffee0000000000abcd', { reason: 'spam', blockPeer: true });
    expect(sent).toEqual([{ method: 'POST', path: '/api/v1/conversations/6730c0ffee0000000000abcd/external/report', body: { reportType: 'spam', blockPeer: true } }]);
  });

  test('transporte le texte joint, nettoyé', async () => {
    const { deps, sent } = gateway();
    await reportExternalContent(deps, '6730c0ffee0000000000abcd', { reason: 'harassment', blockPeer: false, disclosedText: '  texte fictif  ' });
    expect(sent[0]?.body).toEqual({ reportType: 'harassment', blockPeer: false, disclosedText: 'texte fictif' });
  });
});
