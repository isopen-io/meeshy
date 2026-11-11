import { describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { loadInviteCatalog, translateInvite } from '@/lib/i18n-invite-catalog';
import { loadOnboardingCatalog, translateOnboarding } from '@/lib/i18n-onboarding-catalog';
import { loadOnboardingProfileCatalog, translateOnboardingProfile } from '@/lib/i18n-onboarding-profile-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

/**
 * ÉPURE DES ÉCRANS D'ENTRÉE 3/3 (#17666) — les sept langues portent les textes
 * raccourcis, traduits (jamais copiés du français) ; rien de la phrase retirée
 * ne survit ; « World Wide » reçoit sa ligne d'orientation.
 */
describe('sept langues, quatre phrases raccourcies et une ligne neuve', () => {
  test('chaque langue sert ses textes, distincts du français hors du français', async () => {
    await Promise.all(
      SUPPORTED_INTERFACE_LANGUAGES.flatMap((l) => [loadInterfaceCatalog(l), loadInviteCatalog(l), loadOnboardingCatalog(l), loadOnboardingProfileCatalog(l)]),
    );
    const fr = {
      lead: translate('fr', 'magicLink.howItWorks'),
      friends: translateOnboarding('fr', 'onboarding.friends.body'),
      profile: translateOnboardingProfile('fr', 'onboarding.profile.body'),
      age: translateOnboarding('fr', 'onboarding.age.body'),
      about: translateInvite('fr', 'world.about'),
    };
    expect(fr.lead).toBe('Comment se connecter sans mot de passe ?');
    expect(fr.friends).toBe('Ajoute 3 personnes qui te ressemblent.');
    expect(fr.profile).toBe('Un visage et une bannière : on te reconnaît plus vite.');
    expect(fr.age).toBe('Pour te proposer les bons espaces.');
    expect(fr.about).toBe('La conversation ouverte au monde entier.');
    for (const l of SUPPORTED_INTERFACE_LANGUAGES.filter((code) => code !== 'fr')) {
      const served = [
        [translate(l, 'magicLink.howItWorks'), fr.lead],
        [translateOnboarding(l, 'onboarding.friends.body'), fr.friends],
        [translateOnboardingProfile(l, 'onboarding.profile.body'), fr.profile],
        [translateOnboarding(l, 'onboarding.age.body'), fr.age],
        [translateInvite(l, 'world.about'), fr.about],
      ] as const;
      for (const [text, french] of served) {
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toBe(french);
      }
      expect(translateOnboarding(l, 'onboarding.friends.body')).not.toContain('{points}');
    }
  });
});
