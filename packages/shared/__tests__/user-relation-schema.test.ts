import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schema = readFileSync(join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');

const block = (kind: 'model' | 'type', name: string): string => {
  const match = schema.match(new RegExp(`^${kind} ${name} \\{[\\s\\S]*?^\\}`, 'm'));
  if (!match) throw new Error(`${kind} ${name} absent du schéma`);
  return match[0];
};

describe('schéma — le lien entre deux personnes (#13926)', () => {
  const relation = block('model', 'UserRelation');

  it('porte le niveau ACCORDÉ par direction, la date d’entrée et les cool-downs', () => {
    for (const field of ['userLowId', 'userHighId', 'grantedByLow', 'grantedByHigh', 'levelSince', 'cooldownLowUntil', 'cooldownHighUntil', 'origin', 'transitions']) {
      expect(relation).toMatch(new RegExp(`^\\s+${field}\\s`, 'm'));
    }
    expect(relation).toMatch(/grantedByLow\s+String\s+@default\("PUBLIC"\)/);
    expect(relation).toMatch(/grantedByHigh\s+String\s+@default\("PUBLIC"\)/);
  });

  it('n’a qu’une ligne par paire non orientée et un seul index de plus (le côté high)', () => {
    const indexes = relation.split('\n').filter((l) => l.trim().startsWith('@@'));
    expect(indexes.map((l) => l.trim())).toEqual(['@@unique([userLowId, userHighId])', '@@index([userHighId])']);
  });

  it('embarque l’historique (date, de, vers) comme type composite, sans collection de plus', () => {
    const transition = block('type', 'RelationTransition');
    for (const field of ['actorId', 'from', 'to', 'at']) {
      expect(transition).toMatch(new RegExp(`^\\s+${field}\\s`, 'm'));
    }
    expect(relation).toMatch(/transitions\s+RelationTransition\[\]/);
    expect(schema).not.toMatch(/^model UserRelationTransition /m);
  });

  it('étend FriendRequest d’un niveau visé facultatif (null = FRIEND, l’ancien sens)', () => {
    expect(block('model', 'FriendRequest')).toMatch(/targetLevel\s+String\?/);
  });

  it('déclare AtomLink, réservé à l’Atome, avec son unique', () => {
    const atom = block('model', 'AtomLink');
    expect(atom).toMatch(/@@unique\(\[atomId, electronId\]\)/);
    expect(atom).toMatch(/verifiedAt\s+DateTime\?/);
  });

  it('a sa migration d’index idempotente, qui pose l’unique de paire et celui d’AtomLink', () => {
    const migration = readFileSync(join(__dirname, '..', 'prisma', 'migrations', '2026-10-31-user-relation-indexes.mongodb.js'), 'utf8');
    expect(migration).toMatch(/collection: 'UserRelation'[^}]*key: \{ userLowId: 1, userHighId: 1 \}, unique: true/);
    expect(migration).toMatch(/collection: 'UserRelation'[^}]*key: \{ userHighId: 1 \}/);
    expect(migration).toMatch(/collection: 'AtomLink'[^}]*key: \{ atomId: 1, electronId: 1 \}, unique: true/);
    expect(migration).toMatch(/DRY_RUN/);
  });
});
