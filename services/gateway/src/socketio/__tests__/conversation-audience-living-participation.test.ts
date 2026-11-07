/**
 * Cliquet : une AUDIENCE de diffusion de conversation lit l'appartenance
 * VIVANTE (#16690). Détail, et la distinction audience / exclusion qui décide
 * du sens du correctif : `conversation-audience-living-participation.ts`.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  sweepConversationAudiences,
  audienceKey,
  DELIBERATELY_WIDE,
} from './conversation-audience-living-participation';

describe('audiences de diffusion — l’appartenance VIVANTE, par la même constante que les portes', () => {
  const sites = sweepConversationAudiences();

  /**
   * Une garde négative dont le balayage rend `[]` reste VERTE — elle
   * n'atteste alors rien du tout. Même précaution que
   * `presence-visibility-viewer-aware-guard`.
   */
  it('balaie réellement quelque chose', () => {
    expect(sites.length).toBeGreaterThan(8);
  });

  it('n’en laisse aucune sur `isActive` nu, hors refus DÉLIBÉRÉS et motivés', () => {
    const bare = sites
      .filter((site) => !site.usesLaw)
      .map((site) => ({ key: audienceKey(sites, site), line: site.line, where: site.where }))
      .filter((site) => !(site.key in DELIBERATELY_WIDE));

    expect(bare).toEqual([]);
  });

  /**
   * L'inventaire de refus n'est pas une dette à faire grossir : chaque entrée
   * doit encore DÉSIGNER un site, sans quoi elle autorise en silence un site
   * futur qui reprendrait la même clé.
   */
  it('ne garde aucun refus périmé', () => {
    const keys = new Set(sites.filter((site) => !site.usesLaw).map((site) => audienceKey(sites, site)));
    for (const declared of Object.keys(DELIBERATELY_WIDE)) {
      expect(keys.has(declared)).toBe(true);
    }
  });

  it('motive chaque refus', () => {
    for (const [key, reason] of Object.entries(DELIBERATELY_WIDE)) {
      expect(reason.length).toBeGreaterThan(80);
      expect(key).toMatch(/\.ts#\d+$/);
    }
  });
});
