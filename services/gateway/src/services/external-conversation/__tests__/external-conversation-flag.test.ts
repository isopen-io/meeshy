/**
 * #17117 — le drapeau des conversations externes : ÉTEINT par défaut, armé par
 * la seule valeur exacte `on`, et jamais en production tant que l'accord avec
 * Meta n'est pas signé, même demandé. Garde de configuration : la composition
 * de production le pose éteint.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EXTERNAL_CONVERSATIONS_FLAG, externalConversationsEnabled } from '../external-conversation-flag';

const COMPOSE = join(__dirname, '../../../../../../infrastructure/docker/compose');

describe('le drapeau des conversations externes', () => {
  it('est éteint sans configuration', () => {
    expect(externalConversationsEnabled({})).toBe(false);
    expect(externalConversationsEnabled({ NODE_ENV: 'development' })).toBe(false);
    expect(externalConversationsEnabled({ MEESHY_ENV: 'staging', NODE_ENV: 'production' })).toBe(false);
  });

  it.each(['true', 'ON', '1', 'yes', ' on', 'enabled'])('reste éteint pour la valeur %p : seule « on » l’arme', (value) => {
    expect(externalConversationsEnabled({ [EXTERNAL_CONVERSATIONS_FLAG]: value, NODE_ENV: 'development' })).toBe(false);
  });

  it.each([
    ['au staging déclaré', { MEESHY_ENV: 'staging', NODE_ENV: 'production' }],
    ['en développement', { NODE_ENV: 'development' }],
    ['en test', { NODE_ENV: 'test' }],
  ])('s’allume %s quand il est armé', (_label, env) => {
    expect(externalConversationsEnabled({ ...env, [EXTERNAL_CONVERSATIONS_FLAG]: 'on' })).toBe(true);
  });

  it.each([
    ['la production', { NODE_ENV: 'production' }],
    ['un NODE_ENV absent', {}],
    ['un NODE_ENV inconnu', { NODE_ENV: 'Production' }],
    ['un MEESHY_ENV qui n’est pas staging', { NODE_ENV: 'production', MEESHY_ENV: 'prod' }],
  ])('reste éteint dans %s, même armé', (_label, env) => {
    expect(externalConversationsEnabled({ ...env, [EXTERNAL_CONVERSATIONS_FLAG]: 'on' })).toBe(false);
  });

  it('la composition de production le pose éteint, la composition de staging le laisse éteint par défaut', () => {
    const production = readFileSync(join(COMPOSE, 'docker-compose.prod.yml'), 'utf8');
    const staging = readFileSync(join(COMPOSE, 'docker-compose.staging.yml'), 'utf8');

    expect(production).toMatch(new RegExp(`^\\s*- ${EXTERNAL_CONVERSATIONS_FLAG}=off\\s*$`, 'm'));
    expect(staging).toMatch(new RegExp(`^\\s*- ${EXTERNAL_CONVERSATIONS_FLAG}=\\$\\{${EXTERNAL_CONVERSATIONS_FLAG}:-off\\}\\s*$`, 'm'));
  });
});
