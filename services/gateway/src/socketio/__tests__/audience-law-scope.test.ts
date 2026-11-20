/**
 * #20091 — la PORTÉE du cliquet de #16690, et ce qu'elle laisse dehors.
 *
 * SQUELETTE : ce fichier tombe. Il réserve les chemins du lot (règle #5243).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { sweepConversationAudiences } from './conversation-audience-living-participation';

describe('#20091 — le balayage des audiences voit tout `src/`, pas un répertoire', () => {
  it('relève les audiences qui vivent hors de `src/socketio/`', () => {
    const outside = sweepConversationAudiences().filter((site) => site.file.startsWith('..'));

    expect(outside.length).toBeGreaterThan(0);
  });
});
