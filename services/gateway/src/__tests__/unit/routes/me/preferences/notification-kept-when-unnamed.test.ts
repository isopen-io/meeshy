/**
 * #14441 (m1) — un REMPLACEMENT des préférences de notification qui ne nomme pas
 * `bringEnabled` ne rouvre pas le Bring que la personne a coupé : la valeur stockée
 * est gardée. Une clé NOMMÉE gagne toujours.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { keepUnnamedKeys } from '../../../../../routes/me/preferences/preference-registry';

const prismaWith = (notification: Record<string, unknown> | null) => ({
  userPreferences: { findUnique: jest.fn(async () => (notification === null ? null : { notification })) },
}) as never;

describe('keepUnnamedKeys — notification.bringEnabled', () => {
  it('absent du corps, coupé au stockage : reste coupé', async () => {
    const out = await keepUnnamedKeys(prismaWith({ bringEnabled: false }), 'u', 'notification', { dndEnabled: true }, { dndEnabled: true, bringEnabled: true });
    expect(out.bringEnabled).toBe(false);
  });

  it('nommé dans le corps : le corps gagne, sans lecture', async () => {
    const prisma = prismaWith({ bringEnabled: false });
    const out = await keepUnnamedKeys(prisma, 'u', 'notification', { bringEnabled: true, talkieEnabled: true, togetherEnabled: true }, { bringEnabled: true, talkieEnabled: true, togetherEnabled: true });
    expect(out.bringEnabled).toBe(true);
    expect((prisma as unknown as { userPreferences: { findUnique: jest.Mock } }).userPreferences.findUnique).not.toHaveBeenCalled();
  });

  it('talkieEnabled, coupé au stockage et absent du corps : reste coupé', async () => {
    const out = await keepUnnamedKeys(prismaWith({ talkieEnabled: false }), 'u', 'notification', {}, { talkieEnabled: true });
    expect(out.talkieEnabled).toBe(false);
  });

  it('togetherEnabled (#17023), coupé au stockage et absent du corps : reste coupé', async () => {
    const out = await keepUnnamedKeys(prismaWith({ togetherEnabled: false }), 'u', 'notification', {}, { togetherEnabled: true });
    expect(out.togetherEnabled).toBe(false);
  });

  it('rien de stocké : le document est rendu tel quel', async () => {
    const out = await keepUnnamedKeys(prismaWith(null), 'u', 'notification', {}, { dndEnabled: false });
    expect(out).toEqual({ dndEnabled: false });
  });

  it('une catégorie sans clé gardée ne lit rien', async () => {
    const prisma = prismaWith({ bringEnabled: false });
    const out = await keepUnnamedKeys(prisma, 'u', 'audio', {}, { a: 1 });
    expect(out).toEqual({ a: 1 });
  });
});
