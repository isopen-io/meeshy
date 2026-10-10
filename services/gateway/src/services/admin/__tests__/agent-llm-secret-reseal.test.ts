/**
 * Re-scellement des clés d'API LLM écrites en clair avant le chiffrement au
 * repos : quelles colonnes sont re-scellées, et ce que le parcours écrit.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { randomBytes } from 'crypto';
import { columnsToReseal, resealAgentLlmSecrets } from '../agent-llm-secret-reseal';
import { SECRETS_AT_REST_KEY_ENV, SecretAtRestUnavailableError, openSecret, sealSecret } from '../../../utils/secret-at-rest';

const CLE = 'sk-proj-ABCDEFGHIJKLMNOPQRSTUV9876';
const CLE_SECOURS = 'sk-ant-secours-ZYXWVUTSRQPO5555';

describe('columnsToReseal — seules les valeurs non vides et non scellées sont re-scellées', () => {
  const saved = process.env[SECRETS_AT_REST_KEY_ENV];
  beforeEach(() => { process.env[SECRETS_AT_REST_KEY_ENV] = randomBytes(32).toString('base64'); });
  afterEach(() => {
    if (saved === undefined) delete process.env[SECRETS_AT_REST_KEY_ENV];
    else process.env[SECRETS_AT_REST_KEY_ENV] = saved;
  });

  it('une valeur en clair est à re-sceller', () => {
    expect(columnsToReseal({ apiKeyEncrypted: CLE, fallbackApiKeyEncrypted: CLE_SECOURS }))
      .toEqual(['apiKeyEncrypted', 'fallbackApiKeyEncrypted']);
  });

  it('une valeur déjà scellée, vide, nulle ou absente ne l\'est pas', () => {
    expect(columnsToReseal({ apiKeyEncrypted: sealSecret(CLE, 'AgentLlmConfig.apiKey'), fallbackApiKeyEncrypted: null })).toEqual([]);
    expect(columnsToReseal({ apiKeyEncrypted: '', fallbackApiKeyEncrypted: undefined })).toEqual([]);
    expect(columnsToReseal({})).toEqual([]);
  });

  it('une ligne mixte ne désigne que la colonne en clair', () => {
    expect(columnsToReseal({ apiKeyEncrypted: sealSecret(CLE, 'AgentLlmConfig.apiKey'), fallbackApiKeyEncrypted: CLE_SECOURS }))
      .toEqual(['fallbackApiKeyEncrypted']);
  });
});

describe('resealAgentLlmSecrets — à blanc par défaut, idempotent, refuse sans clé valide', () => {
  const saved = process.env[SECRETS_AT_REST_KEY_ENV];
  let rows: Array<Record<string, any>>;
  let prisma: any;

  beforeEach(() => {
    process.env[SECRETS_AT_REST_KEY_ENV] = randomBytes(32).toString('base64');
    rows = [
      { id: 'a', apiKeyEncrypted: CLE, fallbackApiKeyEncrypted: null },
      { id: 'b', apiKeyEncrypted: sealSecret(CLE, 'AgentLlmConfig.apiKey'), fallbackApiKeyEncrypted: CLE_SECOURS },
      { id: 'c', apiKeyEncrypted: '', fallbackApiKeyEncrypted: null },
    ];
    prisma = {
      agentLlmConfig: {
        findMany: jest.fn(async () => rows.map((r) => ({ ...r }))),
        update: jest.fn(async (args: any) => {
          const row = rows.find((r) => r.id === args.where.id)!;
          Object.assign(row, args.data);
          return row;
        }),
      },
    };
  });
  afterEach(() => {
    if (saved === undefined) delete process.env[SECRETS_AT_REST_KEY_ENV];
    else process.env[SECRETS_AT_REST_KEY_ENV] = saved;
  });

  it('à blanc : compte les lignes à re-sceller sans rien écrire', async () => {
    const report = await resealAgentLlmSecrets(prisma, { apply: false });
    expect(report).toEqual({ scanned: 3, rowsToReseal: 2, resealed: 0 });
    expect(prisma.agentLlmConfig.update).not.toHaveBeenCalled();
  });

  it('--apply : scelle les seules colonnes en clair, puis un second passage ne trouve plus rien', async () => {
    const report = await resealAgentLlmSecrets(prisma, { apply: true });
    expect(report).toEqual({ scanned: 3, rowsToReseal: 2, resealed: 2 });
    expect(Object.keys(prisma.agentLlmConfig.update.mock.calls[0][0].data)).toEqual(['apiKeyEncrypted']);
    expect(Object.keys(prisma.agentLlmConfig.update.mock.calls[1][0].data)).toEqual(['fallbackApiKeyEncrypted']);
    expect(openSecret(rows[0].apiKeyEncrypted, 'AgentLlmConfig.apiKey')).toBe(CLE);
    expect(openSecret(rows[1].fallbackApiKeyEncrypted, 'AgentLlmConfig.fallbackApiKey')).toBe(CLE_SECOURS);

    const again = await resealAgentLlmSecrets(prisma, { apply: true });
    expect(again).toEqual({ scanned: 3, rowsToReseal: 0, resealed: 0 });
  });

  it.each([['absente', undefined], ['invalide', 'pas-une-cle']])('refuse de tourner avec une clé %s', async (_cas, cle) => {
    if (cle === undefined) delete process.env[SECRETS_AT_REST_KEY_ENV];
    else process.env[SECRETS_AT_REST_KEY_ENV] = cle;
    await expect(resealAgentLlmSecrets(prisma, { apply: false })).rejects.toBeInstanceOf(SecretAtRestUnavailableError);
    expect(prisma.agentLlmConfig.findMany).not.toHaveBeenCalled();
  });
});
