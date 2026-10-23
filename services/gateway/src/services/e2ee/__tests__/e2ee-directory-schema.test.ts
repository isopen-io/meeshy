/**
 * L'annuaire par appareil ne détient QUE des clés publiques (#3706, spec
 * 2026-10-23 § 3.3). Ce témoin lit le schéma Prisma lui-même : un champ de clé
 * privée ajouté demain à l'un de ces modèles le fait rougir, quel que soit le
 * code qui l'écrirait.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const SCHEMA = readFileSync(join(__dirname, '../../../../../../packages/shared/prisma/schema.prisma'), 'utf8');

const DIRECTORY_MODELS = ['E2EEDevice', 'E2EEOneTimePreKey', 'MessageEnvelope'] as const;

const modelBody = (name: string): string | undefined => {
  const match = new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, 'm').exec(SCHEMA);
  return match?.[1];
};

const fieldLines = (body: string): readonly string[] =>
  body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//') && !line.startsWith('@@'));

describe("l'annuaire E2EE par appareil (schéma)", () => {
  it.each(DIRECTORY_MODELS)('déclare le modèle %s', (name) => {
    expect(modelBody(name)).toBeDefined();
  });

  it.each(DIRECTORY_MODELS)("le modèle %s ne porte aucun champ de clé privée, ni dans son nom ni dans sa doc", (name) => {
    const body = modelBody(name) ?? '';
    const offending = fieldLines(body).filter((line) => /private|secret|privkey/i.test(line));
    expect(offending).toEqual([]);
  });

  it('garantit un appareil par (utilisateur, deviceId) et une pré-clé par (appareil, nature, keyId)', () => {
    expect(modelBody('E2EEDevice')).toMatch(/@@unique\(\[userId, deviceId\]\)/);
    expect(modelBody('E2EEOneTimePreKey')).toMatch(/@@unique\(\[userId, deviceId, kind, keyId\]\)/);
  });

  it('indexe la réservation sur usedAt et la lecture des enveloppes par appareil destinataire', () => {
    expect(modelBody('E2EEOneTimePreKey')).toMatch(/@@index\(\[userId, deviceId, kind, usedAt\]\)/);
    expect(modelBody('MessageEnvelope')).toMatch(/@@index\(\[recipientUserId, recipientDeviceId, createdAt\]\)/);
    expect(modelBody('MessageEnvelope')).toMatch(/@@unique\(\[messageId, recipientUserId, recipientDeviceId\]\)/);
  });

  it("laisse SignalPreKeyBundle en place pour les clients publiés — et le détecteur y voit ses champs privés hérités", () => {
    const legacy = fieldLines(modelBody('SignalPreKeyBundle') ?? '').filter((line) => /private|secret|privkey/i.test(line));
    expect(legacy.length).toBeGreaterThan(0);
  });
});
