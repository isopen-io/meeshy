import { describe, it, expect } from 'vitest';
import {
  resolveOrchestratorDecision,
  resolveCapabilities,
  resolveAssistTier,
  neverCapableProbe,
  RIVER_ELIGIBILITY_THRESHOLD,
  ORCHESTRATOR_UNREAD_CAP,
  ORCHESTRATOR_ABSENCE_UNREAD_FLOOR,
  type ReadingModeCapabilities,
} from '../utils/reading-modes';

// -----------------------------------------------------------------------------
// Fixtures partagées
// -----------------------------------------------------------------------------

const NOW = Date.UTC(2026, 7, 15, 12, 0, 0);
const hoursAgo = (h: number) => NOW - h * 60 * 60 * 1000;

const baseCapabilities: ReadingModeCapabilities = {
  availableModes: ['focal', 'script', 'summary'],
  riverEligible: false,
  riverEligibilityReason: { threshold: RIVER_ELIGIBILITY_THRESHOLD, current: 1 },
};

// =============================================================================
// C-011 — resolveOrchestratorDecision
// =============================================================================

describe('resolveOrchestratorDecision — drapeau désactivé', () => {
  it("isFlagEnabled === false → mode historique 'bubbles', quel que soit le reste", () => {
    expect(
      resolveOrchestratorDecision({
        unreadCount: 999,
        lastOpenedAt: null,
        now: NOW,
        stickyChoice: 'focal',
        capabilities: baseCapabilities,
        isFlagEnabled: false,
      }),
    ).toEqual({ mode: 'bubbles', reason: 'flag-disabled' });
  });

  it('flag off prime même sur un choix collant explicite (bubbles ne vit que drapeau éteint)', () => {
    expect(
      resolveOrchestratorDecision({
        unreadCount: 3,
        lastOpenedAt: NOW,
        now: NOW,
        stickyChoice: 'riviere',
        capabilities: baseCapabilities,
        isFlagEnabled: false,
      }).mode,
    ).toBe('bubbles');
  });
});

describe('resolveOrchestratorDecision — choix collant PRIME toujours (drapeau on)', () => {
  it("stickyChoice='focal' gagne même à 0 non-lus", () => {
    expect(
      resolveOrchestratorDecision({
        unreadCount: 0,
        lastOpenedAt: NOW,
        now: NOW,
        stickyChoice: 'focal',
        capabilities: baseCapabilities,
        isFlagEnabled: true,
      }),
    ).toEqual({ mode: 'focal', reason: 'sticky' });
  });

  it("stickyChoice='resume' gagne à 5 non-lus (le défaut aurait rendu focal)", () => {
    expect(
      resolveOrchestratorDecision({
        unreadCount: 5,
        lastOpenedAt: NOW,
        now: NOW,
        stickyChoice: 'resume',
        capabilities: baseCapabilities,
        isFlagEnabled: true,
      }),
    ).toEqual({ mode: 'summary', reason: 'sticky' });
  });

  it("stickyChoice='focal' gagne même à >25 non-lus (le défaut aurait rendu summary)", () => {
    expect(
      resolveOrchestratorDecision({
        unreadCount: 30,
        lastOpenedAt: NOW,
        now: NOW,
        stickyChoice: 'focal',
        capabilities: baseCapabilities,
        isFlagEnabled: true,
      }),
    ).toEqual({ mode: 'focal', reason: 'sticky' });
  });

  it("stickyChoice='script' gagne même en absence > 24h avec >= 10 non-lus", () => {
    expect(
      resolveOrchestratorDecision({
        unreadCount: 15,
        lastOpenedAt: hoursAgo(48),
        now: NOW,
        stickyChoice: 'script',
        capabilities: baseCapabilities,
        isFlagEnabled: true,
      }),
    ).toEqual({ mode: 'script', reason: 'sticky' });
  });

  it("stickyChoice='riviere' se mappe sur le mode 'river' (la loi honore le choix ; le grisage est une affaire d'UI/capacités)", () => {
    expect(
      resolveOrchestratorDecision({
        unreadCount: 2,
        lastOpenedAt: NOW,
        now: NOW,
        stickyChoice: 'riviere',
        capabilities: baseCapabilities,
        isFlagEnabled: true,
      }).mode,
    ).toBe('river');
  });
});

describe('resolveOrchestratorDecision — branche ≤ 25 non-lus → focal', () => {
  it('0 non-lu → focal', () => {
    expect(
      resolveOrchestratorDecision({
        unreadCount: 0,
        lastOpenedAt: NOW,
        now: NOW,
        stickyChoice: 'auto',
        capabilities: baseCapabilities,
        isFlagEnabled: true,
      }),
    ).toEqual({ mode: 'focal', reason: 'default' });
  });

  it(`exactement ${ORCHESTRATOR_UNREAD_CAP} non-lus (borne incluse) → focal`, () => {
    expect(
      resolveOrchestratorDecision({
        unreadCount: ORCHESTRATOR_UNREAD_CAP,
        lastOpenedAt: NOW,
        now: NOW,
        stickyChoice: 'auto',
        capabilities: baseCapabilities,
        isFlagEnabled: true,
      }),
    ).toEqual({ mode: 'focal', reason: 'default' });
  });
});

describe('resolveOrchestratorDecision — branche > 25 non-lus → summary (Résumé Vivant)', () => {
  it(`${ORCHESTRATOR_UNREAD_CAP + 1} non-lus, lecteur récemment présent → summary quand même`, () => {
    expect(
      resolveOrchestratorDecision({
        unreadCount: ORCHESTRATOR_UNREAD_CAP + 1,
        lastOpenedAt: NOW,
        now: NOW,
        stickyChoice: 'auto',
        capabilities: baseCapabilities,
        isFlagEnabled: true,
      }),
    ).toEqual({ mode: 'summary', reason: 'unread-over-cap' });
  });

  it('999 non-lus → summary', () => {
    expect(
      resolveOrchestratorDecision({
        unreadCount: 999,
        lastOpenedAt: NOW,
        now: NOW,
        stickyChoice: 'auto',
        capabilities: baseCapabilities,
        isFlagEnabled: true,
      }).mode,
    ).toBe('summary');
  });
});

describe('resolveOrchestratorDecision — branche absence > 24h ET >= 10 non-lus → summary', () => {
  it(`absence de 25h avec ${ORCHESTRATOR_ABSENCE_UNREAD_FLOOR} non-lus → summary`, () => {
    expect(
      resolveOrchestratorDecision({
        unreadCount: ORCHESTRATOR_ABSENCE_UNREAD_FLOOR,
        lastOpenedAt: hoursAgo(25),
        now: NOW,
        stickyChoice: 'auto',
        capabilities: baseCapabilities,
        isFlagEnabled: true,
      }),
    ).toEqual({ mode: 'summary', reason: 'stale-absence' });
  });

  it('lastOpenedAt=null (jamais ouverte) vaut absence, avec >= 10 non-lus → summary', () => {
    expect(
      resolveOrchestratorDecision({
        unreadCount: 12,
        lastOpenedAt: null,
        now: NOW,
        stickyChoice: 'auto',
        capabilities: baseCapabilities,
        isFlagEnabled: true,
      }),
    ).toEqual({ mode: 'summary', reason: 'stale-absence' });
  });

  it('absence exactement égale à 24h (borne EXCLUE, pas strictement > 24h) → focal', () => {
    expect(
      resolveOrchestratorDecision({
        unreadCount: 20,
        lastOpenedAt: NOW - 24 * 60 * 60 * 1000,
        now: NOW,
        stickyChoice: 'auto',
        capabilities: baseCapabilities,
        isFlagEnabled: true,
      }),
    ).toEqual({ mode: 'focal', reason: 'default' });
  });

  it('absence > 24h mais < 10 non-lus (9) → focal (le plancher de non-lus tient)', () => {
    expect(
      resolveOrchestratorDecision({
        unreadCount: ORCHESTRATOR_ABSENCE_UNREAD_FLOOR - 1,
        lastOpenedAt: hoursAgo(48),
        now: NOW,
        stickyChoice: 'auto',
        capabilities: baseCapabilities,
        isFlagEnabled: true,
      }),
    ).toEqual({ mode: 'focal', reason: 'default' });
  });

  it('lecteur présent (< 24h) avec 10 non-lus → focal (pas de summary sans absence)', () => {
    expect(
      resolveOrchestratorDecision({
        unreadCount: ORCHESTRATOR_ABSENCE_UNREAD_FLOOR,
        lastOpenedAt: hoursAgo(1),
        now: NOW,
        stickyChoice: 'auto',
        capabilities: baseCapabilities,
        isFlagEnabled: true,
      }),
    ).toEqual({ mode: 'focal', reason: 'default' });
  });

  it('now et lastOpenedAt acceptent des dates ISO string (fonction pure, now injecté)', () => {
    expect(
      resolveOrchestratorDecision({
        unreadCount: 11,
        lastOpenedAt: new Date(hoursAgo(30)).toISOString(),
        now: new Date(NOW).toISOString(),
        stickyChoice: 'auto',
        capabilities: baseCapabilities,
        isFlagEnabled: true,
      }).mode,
    ).toBe('summary');
  });
});

// =============================================================================
// C-012 — resolveCapabilities
// =============================================================================

describe('resolveCapabilities — drapeau désactivé', () => {
  it("isFlagEnabled === false → seul 'bubbles' est disponible, quelle que soit l'identité", () => {
    const registered = resolveCapabilities({
      identity: { isAnonymous: false },
      isFlagEnabled: false,
      conversationType: 'group',
      activeParticipantCount: 8,
    });
    const anonymous = resolveCapabilities({
      identity: { isAnonymous: true },
      isFlagEnabled: false,
      conversationType: 'group',
      activeParticipantCount: 8,
    });
    expect(registered.availableModes).toEqual(['bubbles']);
    expect(anonymous.availableModes).toEqual(['bubbles']);
  });
});

describe("resolveCapabilities — l'UNIQUE point de branchement invité/inscrit", () => {
  it('inscrit : focal + script + summary (Résumé Vivant visible)', () => {
    const capabilities = resolveCapabilities({
      identity: { isAnonymous: false },
      isFlagEnabled: true,
      conversationType: 'group',
      activeParticipantCount: 2,
    });
    expect(capabilities.availableModes).toEqual(
      expect.arrayContaining(['focal', 'script', 'summary']),
    );
    expect(capabilities.availableModes).not.toContain('bubbles');
  });

  it('invité (isAnonymous) : focal + script seulement — summary masqué (403 requiredAuth)', () => {
    const capabilities = resolveCapabilities({
      identity: { isAnonymous: true },
      isFlagEnabled: true,
      conversationType: 'group',
      activeParticipantCount: 2,
    });
    expect(capabilities.availableModes).toEqual(expect.arrayContaining(['focal', 'script']));
    expect(capabilities.availableModes).not.toContain('summary');
  });

  it("'river' n'est JAMAIS dans availableModes en phase 1, même éligible et inscrit (en sursis)", () => {
    const capabilities = resolveCapabilities({
      identity: { isAnonymous: false },
      isFlagEnabled: true,
      conversationType: 'group',
      activeParticipantCount: 10,
    });
    expect(capabilities.availableModes).not.toContain('river');
    expect(capabilities.riverEligible).toBe(true);
  });
});

describe("resolveCapabilities — éligibilité Rivière (≥ 5 actifs, jamais en 'direct')", () => {
  it('4 actifs (groupe) → inéligible, raison structurée {threshold: 5, current: 4}', () => {
    const capabilities = resolveCapabilities({
      identity: { isAnonymous: false },
      isFlagEnabled: true,
      conversationType: 'group',
      activeParticipantCount: 4,
    });
    expect(capabilities.riverEligible).toBe(false);
    expect(capabilities.riverEligibilityReason).toEqual({ threshold: 5, current: 4 });
  });

  it('5 actifs en groupe → éligible', () => {
    const capabilities = resolveCapabilities({
      identity: { isAnonymous: false },
      isFlagEnabled: true,
      conversationType: 'group',
      activeParticipantCount: 5,
    });
    expect(capabilities.riverEligible).toBe(true);
    expect(capabilities.riverEligibilityReason).toEqual({ threshold: 5, current: 5 });
  });

  it("5 actifs en 'direct' → inéligible malgré le seuil atteint (jamais en direct)", () => {
    const capabilities = resolveCapabilities({
      identity: { isAnonymous: false },
      isFlagEnabled: true,
      conversationType: 'direct',
      activeParticipantCount: 5,
    });
    expect(capabilities.riverEligible).toBe(false);
    expect(capabilities.riverEligibilityReason).toEqual({ threshold: 5, current: 5 });
  });

  it('RIVER_ELIGIBILITY_THRESHOLD exporté vaut 5', () => {
    expect(RIVER_ELIGIBILITY_THRESHOLD).toBe(5);
  });
});

// =============================================================================
// C-013 — resolveAssistTier + AssistCapabilityProbing
// =============================================================================

describe('resolveAssistTier — cascade de capacité (local → serveur → déterministe)', () => {
  it('appareil capable → localAgent, quels que soient chiffrement/consentement', () => {
    expect(
      resolveAssistTier({
        deviceCapability: true,
        encryptionMode: 'e2ee',
        userConsent: false,
        conversationType: 'group',
      }),
    ).toBe('localAgent');

    expect(
      resolveAssistTier({
        deviceCapability: true,
        encryptionMode: null,
        userConsent: true,
        conversationType: 'direct',
      }),
    ).toBe('localAgent');
  });

  it('appareil incapable, chiffrement non-e2ee, consentement donné → serverAgent', () => {
    expect(
      resolveAssistTier({
        deviceCapability: false,
        encryptionMode: 'server',
        userConsent: true,
        conversationType: 'group',
      }),
    ).toBe('serverAgent');

    expect(
      resolveAssistTier({
        deviceCapability: false,
        encryptionMode: 'hybrid',
        userConsent: true,
        conversationType: 'group',
      }),
    ).toBe('serverAgent');

    expect(
      resolveAssistTier({
        deviceCapability: false,
        encryptionMode: null,
        userConsent: true,
        conversationType: 'group',
      }),
    ).toBe('serverAgent');
  });

  it('appareil incapable, non-e2ee, consentement refusé → deterministic', () => {
    expect(
      resolveAssistTier({
        deviceCapability: false,
        encryptionMode: 'server',
        userConsent: false,
        conversationType: 'group',
      }),
    ).toBe('deterministic');
  });

  it("GARDE NON NÉGOCIABLE — e2ee ∧ incapable ⇒ deterministic, JAMAIS serverAgent (même consentement donné)", () => {
    expect(
      resolveAssistTier({
        deviceCapability: false,
        encryptionMode: 'e2ee',
        userConsent: true,
        conversationType: 'group',
      }),
    ).toBe('deterministic');
  });

  it('GARDE NON NÉGOCIABLE — e2ee ∧ incapable ∧ consentement refusé ⇒ deterministic', () => {
    expect(
      resolveAssistTier({
        deviceCapability: false,
        encryptionMode: 'e2ee',
        userConsent: false,
        conversationType: 'direct',
      }),
    ).toBe('deterministic');
  });
});

describe('AssistCapabilityProbing — neverCapableProbe renvoie false partout', () => {
  it('false pour toute conversationType', () => {
    expect(neverCapableProbe.probe({ conversationType: 'direct' })).toBe(false);
    expect(neverCapableProbe.probe({ conversationType: 'group' })).toBe(false);
    expect(neverCapableProbe.probe({ conversationType: 'public' })).toBe(false);
    expect(neverCapableProbe.probe({ conversationType: 'global' })).toBe(false);
    expect(neverCapableProbe.probe({ conversationType: 'broadcast' })).toBe(false);
  });
});
