/**
 * Revue « incomplete redaction registry » — **l'adresse, l'agent et le lieu
 * d'un événement de sécurité ne se servent au titulaire QUE si l'acteur EST le
 * titulaire**, et ce classement est FERMÉ par défaut : un type nouveau ou non
 * classé est masqué.
 *
 * Le témoin balaie le CODE de la passerelle : tout type d'événement qu'un
 * producteur écrit doit figurer au registre. Un producteur neuf qui oublie de
 * se classer fait tomber ce témoin — il ne sert jamais une trace par défaut.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  SECURITY_EVENT_ACTORS,
  forAccountHolder,
  forAdministration,
} from '../../../services/auth/security-event-view';

const SRC = resolve(__dirname, '../../..');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === '__tests__' ? [] : sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
  });

const producedEventTypes = (): Set<string> => {
  const files = sourceFiles(SRC).map((path) => readFileSync(path, 'utf8'));
  const all = files.join('\n');
  const constants = new Map([...all.matchAll(/export const ([A-Z_]+_EVENT)\s*=\s*'([A-Z0-9_]+)'/g)].map((m) => [m[1], m[2]]));
  const found = new Set<string>();
  for (const text of files) {
    for (const m of text.matchAll(/eventType:\s*'([A-Z0-9_]+)'/g)) found.add(m[1]);
    for (const m of text.matchAll(/eventType:\s*([A-Z_]+_EVENT)\b/g)) {
      const value = constants.get(m[1]);
      if (value) found.add(value);
    }
    for (const m of text.matchAll(/logSecurityEvent\(\s*(?:[^,()'"]+,\s*){0,2}'([A-Z][A-Z0-9_]+)'/g)) found.add(m[1]);
  }
  return found;
};

describe('le registre des acteurs couvre TOUT ce que le code produit', () => {
  it('le balayage voit bien les producteurs (un balayage vide serait vert à tort)', () => {
    const produced = producedEventTypes();
    expect(produced.size).toBeGreaterThanOrEqual(35);
    for (const known of ['MAGIC_LINK_LOGIN_SUCCESS', 'PHONE_TRANSFER_INITIATED', 'EMAIL_RELEASED_BY_CLAIM', 'SESSION_TRUSTED', 'ACCOUNT_UNLOCKED']) {
      expect(produced).toContain(known);
    }
  });

  it('chaque type produit est classé', () => {
    const unclassified = [...producedEventTypes()].filter((type) => !(type in SECURITY_EVENT_ACTORS)).sort();
    expect(unclassified).toEqual([]);
  });
});

const event = (eventType: string) => ({
  eventType,
  ipAddress: '198.51.100.9',
  userAgent: 'Agent/1.0',
  geoLocation: 'Lyon, France',
  deviceFingerprint: 'fp',
});

describe('forAccountHolder — fermé par défaut', () => {
  it('sert la trace d’un événement dont l’acteur est le titulaire', () => {
    expect(forAccountHolder(event('MAGIC_LINK_LOGIN_SUCCESS'))).toMatchObject({ ipAddress: '198.51.100.9', geoLocation: 'Lyon, France' });
  });

  it.each(['PHONE_TRANSFER_INITIATED', 'PASSWORD_RESET_REQUEST', 'TWO_FA_FAILED', 'EMAIL_RELEASED_BY_CLAIM', 'UN_TYPE_JAMAIS_VU'])(
    '%s : ni adresse, ni agent, ni lieu, ni empreinte',
    (type) => {
      expect(forAccountHolder(event(type))).toMatchObject({ ipAddress: null, userAgent: null, geoLocation: null, deviceFingerprint: null });
    },
  );
});

describe('forAdministration', () => {
  it('l’administration voit la trace d’une tentative non prouvée (enquête de sécurité)', () => {
    expect(forAdministration(event('PASSWORD_RESET_REQUEST'))).toMatchObject({ ipAddress: '198.51.100.9' });
  });

  it.each(['PHONE_TRANSFER_INITIATED', 'EMAIL_RELEASED_BY_CLAIM', 'UN_TYPE_JAMAIS_VU'])(
    '%s : la trace d’un AUTRE compte, ou d’un type non classé, est masquée',
    (type) => {
      expect(forAdministration(event(type))).toMatchObject({ ipAddress: null, geoLocation: null });
    },
  );
});
