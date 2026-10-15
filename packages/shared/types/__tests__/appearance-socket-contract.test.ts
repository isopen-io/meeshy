import { describe, expect, it } from 'vitest';
import { SERVER_EVENTS } from '../socketio-events';
import type { ConversationPreferencesPayload, PackInstallationUpdatedEventData, ProfileDecorUpdatedEventData } from '../socketio-events';
import { DEFAULT_APPEARANCE } from '../conversation-appearance';
import { EMPTY_PROFILE_DECOR } from '../profile-decor';

describe('les contrats socket de l’apparence (#10631, #10632) — additifs', () => {
  it('profile:decor-updated suit la convention entité:action-mot avec traits d’union', () => {
    expect(SERVER_EVENTS.PROFILE_DECOR_UPDATED).toBe('profile:decor-updated');
    expect(SERVER_EVENTS.PROFILE_DECOR_UPDATED).toMatch(/^[a-z]+:[a-z]+(-[a-z]+)*$/);
  });

  it('un ancien payload (sans appearance ni owned) reste valide ; le nouveau les porte', () => {
    const base = {
      isPinned: false, isMuted: false, mentionsOnly: false, isArchived: false, tags: [], categoryId: null, orderInCategory: null,
      customName: null, reaction: null, readingMode: 'auto', clearHistoryBefore: null,
    } satisfies ConversationPreferencesPayload;
    const withAppearance: ConversationPreferencesPayload = { ...base, appearance: DEFAULT_APPEARANCE };
    const reset: ConversationPreferencesPayload = { ...base, appearance: null };
    expect([base, withAppearance, reset]).toHaveLength(3);
    const install: PackInstallationUpdatedEventData = { domain: 'wallpaper', slug: 'heritages', installed: true, at: '2026-10-14T10:00:00.000Z' };
    expect({ ...install, owned: true }.owned).toBe(true);
    const decor: ProfileDecorUpdatedEventData = { userId: 'u', decor: EMPTY_PROFILE_DECOR, at: '2026-10-14T10:00:00.000Z' };
    expect(decor.decor.avatarRing).toBeNull();
  });
});
