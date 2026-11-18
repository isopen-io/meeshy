/**
 * #19454 — ne plus recevoir la position continue d'un Sang est une préférence de RÉCEPTION, par
 * personne (`bloodLocationMuted`), additive : une réponse d'un serveur antérieur se lit encore.
 */
import { describe, it, expect } from 'vitest';
import { relationPersonSettingsSchema, relationPersonSettingsUpdateSchema } from '../types/relation-person-settings';

describe('ne plus recevoir la position continue d\'un Sang', () => {
  it('se coupe et se rouvre pour une personne, en booléen seulement', () => {
    expect(relationPersonSettingsUpdateSchema.safeParse({ bloodLocationMuted: true }).success).toBe(true);
    expect(relationPersonSettingsUpdateSchema.safeParse({ bloodLocationMuted: false }).success).toBe(true);
    expect(relationPersonSettingsUpdateSchema.safeParse({ bloodLocationMuted: 'oui' }).success).toBe(false);
  });

  it('une réponse d\'un serveur antérieur, sans la clé, se lit encore', () => {
    const ancien = { userId: 'u', bringBlocked: false, talkieBlocked: false, listeningTitleShared: false, locationShared: false, locationHistoryShared: false, proximityShared: false };
    expect(relationPersonSettingsSchema.parse(ancien).bloodLocationMuted).toBeUndefined();
    expect(relationPersonSettingsSchema.parse({ ...ancien, bloodLocationMuted: true }).bloodLocationMuted).toBe(true);
  });
});
