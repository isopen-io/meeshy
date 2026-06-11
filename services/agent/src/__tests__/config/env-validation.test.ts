// Les imports de `../../env` déclenchent le chargement top-level (process.exit
// si invalide) : on fournit un env minimal valide AVANT l'import pour ne pas
// tuer le worker Jest. Les tests ciblent la fonction pure `loadEnv(raw)`.
process.env.DATABASE_URL = 'mongodb://mock';
process.env.OPENAI_API_KEY = 'mock-key';

import { loadEnv } from '../../env';

const baseEnv = (): NodeJS.ProcessEnv =>
  ({ DATABASE_URL: 'mongodb://mock' } as NodeJS.ProcessEnv);

describe('loadEnv', () => {
  it('échoue avec un message détaillé quand aucune clé LLM est fournie', () => {
    const result = loadEnv(baseEnv());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('OPENAI_API_KEY');
      expect(result.message).toContain('ANTHROPIC_API_KEY');
      expect(result.message).toContain('démarrage impossible');
      expect(result.message).toContain('exit 1');
    }
  });

  it('réussit quand OPENAI_API_KEY est fournie', () => {
    const result = loadEnv({ ...baseEnv(), OPENAI_API_KEY: 'sk-test' } as NodeJS.ProcessEnv);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.env.OPENAI_API_KEY).toBe('sk-test');
    }
  });

  it('réussit quand ANTHROPIC_API_KEY est fournie', () => {
    const result = loadEnv({
      ...baseEnv(),
      ANTHROPIC_API_KEY: 'sk-ant-test',
    } as NodeJS.ProcessEnv);

    expect(result.ok).toBe(true);
  });

  it('échoue quand DATABASE_URL est absente', () => {
    const result = loadEnv({ OPENAI_API_KEY: 'sk-test' } as NodeJS.ProcessEnv);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('DATABASE_URL');
    }
  });
});
