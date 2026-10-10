/**
 * Les colonnes de clé d'API de `AgentLlmConfig`, et le re-scellement des
 * valeurs écrites en clair avant le chiffrement au repos.
 *
 * Une source unique : la route admin (`routes/admin/agent-llm.ts`) et le
 * script de maintenance (`scripts/reseal-agent-llm-secrets.ts`) lisent la même
 * liste de colonnes et le même contexte de scellement par colonne.
 */
import {
  SECRETS_AT_REST_KEY_ENV,
  SecretAtRestUnavailableError,
  hasValidSecretsKey,
  isSealedSecret,
  sealSecret,
} from '../../utils/secret-at-rest';

/**
 * Chaque colonne et le contexte qui la scelle (lié en données authentifiées :
 * une valeur d'une colonne ne s'ouvre pas pour l'autre).
 */
export const AGENT_LLM_SECRET_COLUMNS = [
  { column: 'apiKeyEncrypted', context: 'AgentLlmConfig.apiKey' },
  { column: 'fallbackApiKeyEncrypted', context: 'AgentLlmConfig.fallbackApiKey' },
] as const;

export type AgentLlmSecretColumn = (typeof AGENT_LLM_SECRET_COLUMNS)[number]['column'];
export type StoredAgentLlmSecrets = Partial<Record<AgentLlmSecretColumn, string | null>>;

/** Les colonnes d'une ligne qui portent une valeur non vide et non scellée. */
export function columnsToReseal(row: StoredAgentLlmSecrets): AgentLlmSecretColumn[] {
  return AGENT_LLM_SECRET_COLUMNS
    .filter(({ column }) => {
      const stored = row[column];
      return typeof stored === 'string' && stored !== '' && !isSealedSecret(stored);
    })
    .map(({ column }) => column);
}

type ResealPrisma = {
  agentLlmConfig: {
    findMany: (args: unknown) => Promise<Array<{ id: string } & StoredAgentLlmSecrets>>;
    update: (args: { where: { id: string }; data: StoredAgentLlmSecrets }) => Promise<unknown>;
  };
};

export interface ResealReport {
  scanned: number;
  rowsToReseal: number;
  resealed: number;
}

/**
 * Parcourt `AgentLlmConfig` et scelle chaque valeur encore en clair. À blanc
 * sauf `apply: true` ; idempotent (une valeur scellée n'est jamais retouchée).
 * Refuse de tourner sans `SECRETS_AT_REST_KEY` valide — sans quoi `sealSecret`
 * pourrait, en développement, rendre la valeur inchangée.
 */
export async function resealAgentLlmSecrets(
  prisma: ResealPrisma,
  { apply }: { apply: boolean },
): Promise<ResealReport> {
  if (!hasValidSecretsKey()) {
    throw new SecretAtRestUnavailableError(`${SECRETS_AT_REST_KEY_ENV} must be set to a valid key to reseal secrets`);
  }
  const rows = await prisma.agentLlmConfig.findMany({
    select: { id: true, apiKeyEncrypted: true, fallbackApiKeyEncrypted: true },
  });
  const report: ResealReport = { scanned: rows.length, rowsToReseal: 0, resealed: 0 };
  for (const row of rows) {
    const columns = columnsToReseal(row);
    if (columns.length === 0) continue;
    report.rowsToReseal += 1;
    if (!apply) continue;
    const data: StoredAgentLlmSecrets = {};
    for (const { column, context } of AGENT_LLM_SECRET_COLUMNS) {
      if (columns.includes(column)) data[column] = sealSecret(row[column] as string, context);
    }
    await prisma.agentLlmConfig.update({ where: { id: row.id }, data });
    report.resealed += 1;
  }
  return report;
}
