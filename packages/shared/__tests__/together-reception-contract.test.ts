/**
 * #17023 — recevoir des invitations « ensemble » est une préférence de réception, active par
 * défaut, qui se coupe par personne (`togetherBlocked`) ou pour tous (`togetherEnabled`), et la
 * borne des rafales d'une paire est publiée pour que les clients disent la même chose.
 */
import { describe, it, expect } from 'vitest';
import { NOTIFICATION_PREFERENCE_DEFAULTS, NotificationPreferenceSchema } from '../types/preferences/notification';
import { relationPersonSettingsSchema, relationPersonSettingsUpdateSchema } from '../types/relation-person-settings';
import { TOGETHER_INVITES_PER_PAIR, TOGETHER_INVITES_WINDOW_SECONDS } from '../types/together';

describe('la réception des invitations « ensemble »', () => {
  it('est active par défaut, y compris dans un document ancien qui ne la nomme pas', () => {
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.togetherEnabled).toBe(true);
    expect(NotificationPreferenceSchema.parse({}).togetherEnabled).toBe(true);
  });

  it('se coupe pour une personne, et une réponse d\'un serveur antérieur se lit encore', () => {
    expect(relationPersonSettingsUpdateSchema.safeParse({ togetherBlocked: true }).success).toBe(true);
    expect(relationPersonSettingsUpdateSchema.safeParse({ togetherBlocked: 'oui' }).success).toBe(false);
    const ancien = { userId: 'u', bringBlocked: false, talkieBlocked: false, listeningTitleShared: false, locationShared: false, locationHistoryShared: false, proximityShared: false };
    expect(relationPersonSettingsSchema.parse(ancien).togetherBlocked).toBeUndefined();
  });

  it('borne une paire à cinq invitations par dix minutes', () => {
    expect(TOGETHER_INVITES_PER_PAIR).toBe(5);
    expect(TOGETHER_INVITES_WINDOW_SECONDS).toBe(600);
  });
});
