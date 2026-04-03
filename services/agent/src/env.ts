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
}).superRefine((data, ctx) => {
  if (!data.OPENAI_API_KEY && !data.ANTHROPIC_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OPENAI_API_KEY'],
      message: 'At least one API key (OPENAI_API_KEY or ANTHROPIC_API_KEY) is required',
    });
  }
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
