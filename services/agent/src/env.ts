import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3200),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  LLM_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-20250514'),

  ZMQ_PULL_PORT: z.coerce.number().int().positive().default(5560),
  ZMQ_PUB_PORT: z.coerce.number().int().positive().default(5561),
  ZMQ_HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  AGENT_SLIDING_WINDOW_SIZE: z.coerce.number().int().min(5).max(500).default(50),
  AGENT_ROLE_LOCK_THRESHOLD: z.coerce.number().min(0).max(1).default(0.8),
  AGENT_DEFAULT_TIMEOUT_SECONDS: z.coerce.number().int().min(10).max(600).default(300),
  AGENT_DEFAULT_COOLDOWN_SECONDS: z.coerce.number().int().min(5).max(300).default(60),

  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(2),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  LLM_WEB_SEARCH_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600000).default(600000),
  LLM_BASE_DELAY_MS: z.coerce.number().int().min(100).max(10000).default(1000),
}).superRefine((data, ctx) => {
  if (!data.OPENAI_API_KEY && !data.ANTHROPIC_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OPENAI_API_KEY'],
      message: 'At least one API key (OPENAI_API_KEY or ANTHROPIC_API_KEY) is required',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

export type EnvLoadResult =
  | { ok: true; env: Env }
  | { ok: false; message: string };

/**
 * Formate un message d'erreur d'environnement lisible et actionnable, au lieu
 * de laisser fuiter la stack trace ZodError brute (qui n'indique pas quoi
 * corriger ni comment).
 */
export function formatEnvError(error: z.ZodError): string {
  const issues = error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(racine)'} : ${issue.message}`)
    .join('\n');

  return [
    '',
    '================================================================',
    '[agent] Configuration invalide — démarrage impossible.',
    '================================================================',
    '',
    'Problème(s) détecté(s) :',
    issues,
    '',
    'Action requise : fournir au moins une clé LLM via les variables',
    "d'environnement du conteneur (docker-compose / .env) :",
    '  - OPENAI_API_KEY=sk-...          (si LLM_PROVIDER=openai)',
    '  - ANTHROPIC_API_KEY=sk-ant-...   (si LLM_PROVIDER=anthropic)',
    '',
    "Le service va s'arrêter (exit 1). Renseignez la configuration",
    'puis redémarrez le conteneur.',
    '================================================================',
    '',
  ].join('\n');
}

/**
 * Valide l'environnement sans effet de bord (pas de process.exit) afin de
 * rester testable. Retourne soit l'env valide, soit un message detaille.
 */
export function loadEnv(raw: NodeJS.ProcessEnv): EnvLoadResult {
  const result = envSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, env: result.data };
  }
  return { ok: false, message: formatEnvError(result.error) };
}

/**
 * Resout l'environnement au demarrage : en cas d'invalidite, affiche les
 * details puis arrete le process proprement (exit 1) au lieu de crasher sur
 * une stack ZodError non geree.
 */
function resolveEnvOrExit(raw: NodeJS.ProcessEnv): Env {
  const result = loadEnv(raw);
  if (!result.ok) {
    console.error(result.message);
    process.exit(1);
  }
  return result.env;
}

export const env: Env = resolveEnvOrExit(process.env);
