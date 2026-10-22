/**
 * @jest-environment node
 *
 * Directive #11570 — l'application Android native est attribuée à la
 * plateforme « android » : `platform` du contexte v2 est lu par `enumOrDrop`.
 */
import { describe, it, expect } from '@jest/globals';
import { SocialEventsContextSchema } from '../../../../routes/social/eventsV2Schemas';

describe('SocialEventsContextSchema.platform', () => {
  it("conserve 'android' tel quel", () => {
    expect(SocialEventsContextSchema.parse({ platform: 'android' }).platform).toBe('android');
  });

  it.each(['ios', 'web', 'android_shell', 'pwa'])("accepte la valeur historique '%s'", (platform) => {
    expect(SocialEventsContextSchema.parse({ platform }).platform).toBe(platform);
  });

  it('retire une plateforme inconnue sans refuser le contexte', () => {
    const parsed = SocialEventsContextSchema.parse({ platform: 'symbian', appVersion: '1.0.0' });
    expect(parsed.platform).toBeUndefined();
    expect(parsed.appVersion).toBe('1.0.0');
  });
});
