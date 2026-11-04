import { afterEach, describe, expect, test } from 'bun:test';

import { endToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';
import type { ApiResult } from '@/lib/api/http';

import { E2EE_ERROR_CODES } from '@meeshy/shared/types/e2ee-directory';

import {
  SWITCH_REFUSAL_CODES,
  decodeEncryptionStatus,
  encryptionSwitchLock,
  encryptionSwitchTargets,
  switchConversationEncryption,
  type EncryptionSwitchPorts,
} from './conversation-encryption-switch';

/**
 * **CHANGER LE CHIFFREMENT DEPUIS LE WEB** (#14648, #14663) — miroir de
 * `ConversationEncryptionModeSwitch` et de `ConversationEncryptionDetailContent`
 * (iOS) : un tête-à-tête que le serveur lit passe à un autre mode au rôle
 * autorisé ; le bout en bout ne se quitte jamais (#12949) et ne s'active pas
 * depuis le navigateur tant que #12975 n'est pas tranchée.
 */

afterEach(() => endToEndRegimeLedger.getState().reset());

const modes = (targets: ReturnType<typeof encryptionSwitchTargets>) => targets.map((target) => target.mode);

describe('les modes proposés', () => {
  test('serveur : hybride proposé, le bout en bout affiché mais réservé aux applications installées', () => {
    const targets = encryptionSwitchTargets({ servedMode: 'server', sealed: false, mayToggle: true });
    expect(targets).toEqual([
      { mode: 'hybrid', available: true, unavailability: null },
      { mode: 'e2ee', available: false, unavailability: 'client-not-yet' },
    ]);
  });

  test('hybride : le retour au serveur se propose (#14663), le bout en bout se voit, grisé', () => {
    expect(encryptionSwitchTargets({ servedMode: 'hybrid', sealed: false, mayToggle: true })).toEqual([
      { mode: 'server', available: true, unavailability: null },
      { mode: 'e2ee', available: false, unavailability: 'client-not-yet' },
    ]);
  });

  test('le mode servi ne se repropose pas', () => {
    expect(modes(encryptionSwitchTargets({ servedMode: 'server', sealed: false, mayToggle: true }))).not.toContain('server');
    expect(modes(encryptionSwitchTargets({ servedMode: 'hybrid', sealed: false, mayToggle: true }))).not.toContain('hybrid');
  });

  test('les modes se proposent dans l’ordre serveur → hybride → bout en bout, la casse et les blancs repliés', () => {
    expect(modes(encryptionSwitchTargets({ servedMode: ' Server ', sealed: false, mayToggle: true }))).toEqual(['hybrid', 'e2ee']);
    expect(modes(encryptionSwitchTargets({ servedMode: 'HYBRID', sealed: false, mayToggle: true }))).toEqual(['server', 'e2ee']);
  });

  test('hybride → serveur suit le droit SERVI : sans lui, rien ne se propose', () => {
    expect(encryptionSwitchTargets({ servedMode: 'hybrid', sealed: false, mayToggle: false })).toEqual([]);
  });

  test('un groupe monte de mode au droit SERVI (rang de modérateur compris côté passerelle)', () => {
    expect(modes(encryptionSwitchTargets({ servedMode: 'server', sealed: false, mayToggle: true }))).toEqual(['hybrid', 'e2ee']);
  });

  test('créée avant le chiffrement systématique : serveur et hybride s’activent', () => {
    const targets = encryptionSwitchTargets({ servedMode: null, sealed: false, mayToggle: true });
    expect(targets.filter((target) => target.available).map((target) => target.mode)).toEqual(['server', 'hybrid']);
  });

  test('bout en bout servi : rien ne se propose, aucune rétrogradation', () => {
    expect(encryptionSwitchTargets({ servedMode: 'e2ee', sealed: false, mayToggle: true })).toEqual([]);
  });

  test('vue e2ee par ce compte puis servie en serveur : la rétrogradation servie est ignorée, rien ne se propose', () => {
    expect(encryptionSwitchTargets({ servedMode: 'server', sealed: true, mayToggle: true })).toEqual([]);
  });

  test('un mode inconnu se lit bout en bout : rien ne se propose (fermé par défaut)', () => {
    expect(encryptionSwitchTargets({ servedMode: 'signal_v9', sealed: false, mayToggle: true })).toEqual([]);
  });

  test('sans le droit servi, rien ne se propose', () => {
    expect(encryptionSwitchTargets({ servedMode: 'server', sealed: false, mayToggle: false })).toEqual([]);
  });
});

describe('ce qui ferme le geste (#14664)', () => {
  test('rien ne le ferme : un tête-à-tête servi serveur, ni vu e2ee, ni retenu', () => {
    expect(encryptionSwitchLock(endToEndRegimeLedger.getState(), { conversationId: 'c1', servedMode: 'server' })).toBeNull();
  });

  test('servi e2ee, d’un mode inconnu ou vu e2ee : scellée', () => {
    expect(encryptionSwitchLock(endToEndRegimeLedger.getState(), { conversationId: 'c1', servedMode: 'e2ee' })).toBe('sealed');
    expect(encryptionSwitchLock(endToEndRegimeLedger.getState(), { conversationId: 'c1', servedMode: 'signal_v9' })).toBe('sealed');
    endToEndRegimeLedger.getState().learnEndToEnd('c1');
    expect(encryptionSwitchLock(endToEndRegimeLedger.getState(), { conversationId: 'c1', servedMode: 'server' })).toBe('sealed');
  });

  test('un fil qui retient l’envoi ferme le geste sans dire « bout en bout »', () => {
    endToEndRegimeLedger.getState().holdSend('c1', true);
    expect(encryptionSwitchLock(endToEndRegimeLedger.getState(), { conversationId: 'c1', servedMode: 'server' })).toBe('held');
  });

  test('scellée l’emporte sur retenue', () => {
    endToEndRegimeLedger.getState().holdSend('c1', true);
    endToEndRegimeLedger.getState().learnEndToEnd('c1');
    expect(encryptionSwitchLock(endToEndRegimeLedger.getState(), { conversationId: 'c1', servedMode: 'server' })).toBe('sealed');
  });
});

describe('les codes de refus', () => {
  test('sont ceux de la passerelle', () => {
    expect(SWITCH_REFUSAL_CODES).toEqual({ irreversible: E2EE_ERROR_CODES.IRREVERSIBLE, regimeChanged: E2EE_ERROR_CODES.REGIME_CHANGED });
  });
});

describe('l’état servi', () => {
  test('lit le mode et le droit servis', () => {
    expect(decodeEncryptionStatus({ isEncrypted: true, mode: 'hybrid', canToggleEncryption: true })).toEqual({ mode: 'hybrid', canToggleEncryption: true });
  });

  test('une passerelle qui ne sert pas le droit ne l’accorde pas', () => {
    expect(decodeEncryptionStatus({ isEncrypted: true, mode: 'server' })).toEqual({ mode: 'server', canToggleEncryption: false });
  });

  test('une charge illisible ne rend rien', () => {
    expect(decodeEncryptionStatus('nope')).toBeNull();
    expect(decodeEncryptionStatus({ mode: 42 })).toBeNull();
  });
});

type Recorded = { readonly posted: string[]; readonly learned: string[] };

const portsOf = (answer: ApiResult<unknown>, online = true): EncryptionSwitchPorts & Recorded => {
  const posted: string[] = [];
  const learned: string[] = [];
  return {
    posted,
    learned,
    online: () => online,
    post: (mode) => {
      posted.push(mode);
      return Promise.resolve(answer);
    },
    learn: (mode) => {
      learned.push(mode);
    },
  };
};

const ok = (mode: string): ApiResult<unknown> => ({ ok: true, data: { isEncrypted: true, mode, canToggleEncryption: true } });
const refused = (status: number, code?: string): ApiResult<unknown> => ({ ok: false, status, error: 'refused', ...(code === undefined ? {} : { code }) });

describe('changer de mode', () => {
  test('serveur → hybride : le POST part, le cache apprend le mode servi', async () => {
    const ports = portsOf(ok('hybrid'));
    const outcome = await switchConversationEncryption(ports, { conversationId: 'c1', servedMode: 'server', target: 'hybrid' });
    expect(outcome).toEqual({ kind: 'switched', mode: 'hybrid' });
    expect(ports.posted).toEqual(['hybrid']);
    expect(ports.learned).toEqual(['hybrid']);
  });

  test('le web ne demande JAMAIS le bout en bout : aucun octet ne part', async () => {
    const ports = portsOf(ok('e2ee'));
    const outcome = await switchConversationEncryption(ports, { conversationId: 'c1', servedMode: 'server', target: 'e2ee' });
    expect(outcome).toEqual({ kind: 'refused' });
    expect(ports.posted).toEqual([]);
  });

  test('depuis une conversation vue e2ee : refus local, aucune requête', async () => {
    endToEndRegimeLedger.getState().learnEndToEnd('c1');
    const ports = portsOf(ok('server'));
    const outcome = await switchConversationEncryption(ports, { conversationId: 'c1', servedMode: 'server', target: 'hybrid' });
    expect(outcome).toEqual({ kind: 'irreversible' });
    expect(ports.posted).toEqual([]);
  });

  test('un fil qui retient l’envoi : refus local dédié, jamais « bout en bout », aucune requête (#14664)', async () => {
    endToEndRegimeLedger.getState().holdSend('c1', true);
    const ports = portsOf(ok('hybrid'));
    const outcome = await switchConversationEncryption(ports, { conversationId: 'c1', servedMode: 'server', target: 'hybrid' });
    expect(outcome).toEqual({ kind: 'held' });
    expect(ports.posted).toEqual([]);
    expect(endToEndRegimeLedger.getState().sealed.c1).toBeUndefined();
  });

  test('depuis une conversation servie e2ee : refus local, aucune requête', async () => {
    const ports = portsOf(ok('server'));
    expect(await switchConversationEncryption(ports, { conversationId: 'c1', servedMode: 'e2ee', target: 'server' })).toEqual({ kind: 'irreversible' });
    expect(ports.posted).toEqual([]);
  });

  test('depuis un mode inconnu : lu comme bout en bout, aucune requête', async () => {
    const ports = portsOf(ok('hybrid'));
    expect(await switchConversationEncryption(ports, { conversationId: 'c1', servedMode: 'signal_v9', target: 'hybrid' })).toEqual({ kind: 'irreversible' });
    expect(ports.posted).toEqual([]);
  });

  test('409 E2EE_IRREVERSIBLE : la conversation est scellée et le cache apprend le bout en bout', async () => {
    const ports = portsOf(refused(409, 'E2EE_IRREVERSIBLE'));
    const outcome = await switchConversationEncryption(ports, { conversationId: 'c2', servedMode: 'server', target: 'hybrid' });
    expect(outcome).toEqual({ kind: 'irreversible' });
    expect(endToEndRegimeLedger.getState().sealed.c2).toBe(true);
    expect(ports.learned).toEqual(['e2ee']);
  });

  test('une réponse qui annonce le bout en bout scelle la conversation', async () => {
    const ports = portsOf(ok('e2ee'));
    await switchConversationEncryption(ports, { conversationId: 'c3', servedMode: 'server', target: 'hybrid' });
    expect(endToEndRegimeLedger.getState().sealed.c3).toBe(true);
    expect(ports.learned).toEqual(['e2ee']);
  });

  test('une réponse sans mode n’ouvre rien : le mode demandé reste, rien n’est appris vers le clair', async () => {
    const ports = portsOf({ ok: true, data: { isEncrypted: false, mode: null } });
    const outcome = await switchConversationEncryption(ports, { conversationId: 'c4', servedMode: 'server', target: 'hybrid' });
    expect(outcome).toEqual({ kind: 'failed' });
    expect(ports.learned).toEqual([]);
  });

  const REFUSALS: ReadonlyArray<readonly [ApiResult<unknown>, string]> = [
    [refused(409, 'E2EE_REGIME_CHANGED'), 'regime-changed'],
    [refused(400, 'ENCRYPTION_ALREADY_ENABLED'), 'regime-changed'],
    [refused(403, 'ENCRYPTION_ACTIVATION_RESTRICTED'), 'restricted'],
    [refused(503, 'SERVER_AT_REST_UNAVAILABLE'), 'unavailable'],
    [refused(500), 'failed'],
  ];
  REFUSALS.forEach(([answer, kind]) => {
    test(`refus ${answer.ok ? '' : `${answer.status} ${answer.code ?? ''}`} ⇒ ${kind}`, async () => {
      const ports = portsOf(answer);
      expect(await switchConversationEncryption(ports, { conversationId: 'c5', servedMode: 'server', target: 'hybrid' })).toEqual({ kind });
      expect(ports.learned).toEqual([]);
    });
  });

  test('hors connexion : rien ne part', async () => {
    const ports = portsOf(ok('hybrid'), false);
    expect(await switchConversationEncryption(ports, { conversationId: 'c6', servedMode: 'server', target: 'hybrid' })).toEqual({ kind: 'offline' });
    expect(ports.posted).toEqual([]);
  });

  test('une requête qui lève se dit échouée', async () => {
    const ports: EncryptionSwitchPorts = { online: () => true, post: () => Promise.reject(new Error('boom')), learn: () => undefined };
    expect(await switchConversationEncryption(ports, { conversationId: 'c7', servedMode: 'server', target: 'hybrid' })).toEqual({ kind: 'failed' });
  });

  test('hybride → serveur part (#14663) : le mode servi est appris', async () => {
    const ports = portsOf(ok('server'));
    expect(await switchConversationEncryption(ports, { conversationId: 'c9', servedMode: 'hybrid', target: 'server' })).toEqual({ kind: 'switched', mode: 'server' });
    expect(ports.posted).toEqual(['server']);
    expect(ports.learned).toEqual(['server']);
  });

  test('hybride → serveur dans une conversation vue e2ee ne part jamais', async () => {
    endToEndRegimeLedger.getState().learnEndToEnd('c10');
    const ports = portsOf(ok('server'));
    expect(await switchConversationEncryption(ports, { conversationId: 'c10', servedMode: 'hybrid', target: 'server' })).toEqual({ kind: 'irreversible' });
    expect(ports.posted).toEqual([]);
  });

  test('un 409 E2EE_IRREVERSIBLE sur hybride → serveur scelle la conversation', async () => {
    const ports = portsOf(refused(409, E2EE_ERROR_CODES.IRREVERSIBLE));
    expect(await switchConversationEncryption(ports, { conversationId: 'c12', servedMode: 'hybrid', target: 'server' })).toEqual({ kind: 'irreversible' });
    expect(endToEndRegimeLedger.getState().sealed['c12']).toBe(true);
  });

  test('un 403 sur hybride → serveur (rang de groupe) se dit comme tel', async () => {
    const ports = portsOf(refused(403));
    expect(await switchConversationEncryption(ports, { conversationId: 'c13', servedMode: 'hybrid', target: 'server' })).toEqual({ kind: 'forbidden' });
  });

  test('403 sans code (rang de groupe insuffisant) se dit comme tel', async () => {
    const ports = portsOf(refused(403));
    expect(await switchConversationEncryption(ports, { conversationId: 'c11', servedMode: 'server', target: 'hybrid' })).toEqual({ kind: 'forbidden' });
  });

  test('le mode déjà porté ne repart pas', async () => {
    const ports = portsOf(ok('server'));
    expect(await switchConversationEncryption(ports, { conversationId: 'c8', servedMode: 'server', target: 'server' })).toEqual({ kind: 'refused' });
    expect(ports.posted).toEqual([]);
  });
});
