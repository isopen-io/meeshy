import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { randomBytes } from 'crypto';
import {
  SECRETS_AT_REST_KEY_ENV,
  SecretAtRestUnavailableError,
  isSealedSecret,
  openSecret,
  sealSecret,
  secretHint,
} from '../secret-at-rest';

const CONTEXTE = 'AgentLlmConfig.apiKey';
const CLE_FOURNISSEUR = 'sk-test-abcdefghijklmnop1234';

describe('secret-at-rest — un secret stocké est chiffré, et ne revient en clair qu\'à qui le demande', () => {
  const saved = { key: process.env[SECRETS_AT_REST_KEY_ENV], nodeEnv: process.env.NODE_ENV };

  beforeEach(() => {
    process.env[SECRETS_AT_REST_KEY_ENV] = randomBytes(32).toString('base64');
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    if (saved.key === undefined) delete process.env[SECRETS_AT_REST_KEY_ENV];
    else process.env[SECRETS_AT_REST_KEY_ENV] = saved.key;
    process.env.NODE_ENV = saved.nodeEnv;
  });

  it('la valeur scellée ne contient pas le clair et porte le format versionné v1:<nonce>:<tag>:<chiffré>', () => {
    const sealed = sealSecret(CLE_FOURNISSEUR, CONTEXTE);
    expect(sealed).not.toContain(CLE_FOURNISSEUR);
    expect(sealed).not.toContain(CLE_FOURNISSEUR.slice(-8));
    const parts = sealed.split(':');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('v1');
    expect(Buffer.from(parts[1], 'base64')).toHaveLength(12);
    expect(Buffer.from(parts[2], 'base64')).toHaveLength(16);
    expect(isSealedSecret(sealed)).toBe(true);
  });

  it('aller-retour : sceller puis ouvrir rend le clair', () => {
    expect(openSecret(sealSecret(CLE_FOURNISSEUR, CONTEXTE), CONTEXTE)).toBe(CLE_FOURNISSEUR);
  });

  it('deux scellements du même clair diffèrent (nonce aléatoire)', () => {
    expect(sealSecret(CLE_FOURNISSEUR, CONTEXTE)).not.toBe(sealSecret(CLE_FOURNISSEUR, CONTEXTE));
  });

  it('une valeur scellée pour un autre contexte ne s\'ouvre pas', () => {
    const sealed = sealSecret(CLE_FOURNISSEUR, CONTEXTE);
    expect(() => openSecret(sealed, 'AgentLlmConfig.fallbackApiKey')).toThrow();
  });

  it('une valeur altérée ne s\'ouvre pas', () => {
    const [v, nonce, tag, data] = sealSecret(CLE_FOURNISSEUR, CONTEXTE).split(':');
    const altered = Buffer.from(data, 'base64');
    altered[0] ^= 0xff;
    expect(() => openSecret([v, nonce, tag, altered.toString('base64')].join(':'), CONTEXTE)).toThrow();
  });

  it('rétrocompatibilité : une ancienne valeur stockée en clair est lue comme clair', () => {
    expect(isSealedSecret(CLE_FOURNISSEUR)).toBe(false);
    expect(openSecret(CLE_FOURNISSEUR, CONTEXTE)).toBe(CLE_FOURNISSEUR);
  });

  it('secretHint rend les 4 derniers caractères, scellé ou clair, et null pour une valeur vide', () => {
    expect(secretHint(sealSecret(CLE_FOURNISSEUR, CONTEXTE), CONTEXTE)).toBe('1234');
    expect(secretHint(CLE_FOURNISSEUR, CONTEXTE)).toBe('1234');
    expect(secretHint('', CONTEXTE)).toBeNull();
    expect(secretHint(null, CONTEXTE)).toBeNull();
  });

  it('secretHint ne jette jamais : une valeur illisible donne null', () => {
    const sealed = sealSecret(CLE_FOURNISSEUR, CONTEXTE);
    process.env[SECRETS_AT_REST_KEY_ENV] = randomBytes(32).toString('base64');
    expect(secretHint(sealed, CONTEXTE)).toBeNull();
  });

  it('secretHint ne révèle rien d\'une clé trop courte', () => {
    expect(secretHint(sealSecret('abc', CONTEXTE), CONTEXTE)).toBeNull();
  });

  it.each(['production', 'staging'])('en %s sans clé de chiffrement, le scellement est REFUSÉ', (env) => {
    process.env.NODE_ENV = env;
    delete process.env[SECRETS_AT_REST_KEY_ENV];
    expect(() => sealSecret(CLE_FOURNISSEUR, CONTEXTE)).toThrow(SecretAtRestUnavailableError);
  });

  it('en développement sans clé de chiffrement, la valeur reste lisible (clair) — jamais en production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env[SECRETS_AT_REST_KEY_ENV];
    const stored = sealSecret(CLE_FOURNISSEUR, CONTEXTE);
    expect(openSecret(stored, CONTEXTE)).toBe(CLE_FOURNISSEUR);
  });

  it('une clé de chiffrement qui ne fait pas 32 octets est refusée, quel que soit l\'environnement', () => {
    process.env[SECRETS_AT_REST_KEY_ENV] = Buffer.from('trop-courte').toString('base64');
    expect(() => sealSecret(CLE_FOURNISSEUR, CONTEXTE)).toThrow(SecretAtRestUnavailableError);
  });

  it('ouvrir une valeur scellée sans clé de chiffrement est refusé', () => {
    const sealed = sealSecret(CLE_FOURNISSEUR, CONTEXTE);
    delete process.env[SECRETS_AT_REST_KEY_ENV];
    expect(() => openSecret(sealed, CONTEXTE)).toThrow(SecretAtRestUnavailableError);
  });
});
