/**
 * La passerelle présente le secret interne à l'agent pour la proposition de saison (#10234, revue de 795c747d98) ;
 * sans secret configuré, elle n'appelle pas.
 *
 * @jest-environment node
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({ enhancedLogger: { child: () => ({ warn: jest.fn() }), warn: jest.fn() } }));

import { AGENT_INTERNAL_TOKEN_HEADER, AgentHttpClient, AgentUnavailableError } from '../../../services/AgentHttpClient';

const INPUT = { number: 2, startDay: '2027-02-15', themeKey: 'language:es', previousThemes: [], brief: null };
const original = process.env.AGENT_INTERNAL_TOKEN;

afterEach(() => {
  process.env.AGENT_INTERNAL_TOKEN = original;
  jest.restoreAllMocks();
});

describe('AgentHttpClient.proposeSeason', () => {
  it('envoie le secret interne dans son en-tête', async () => {
    process.env.AGENT_INTERNAL_TOKEN = 'gateway-side-secret-0123456789abcdef';
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { themeKey: 'language:es' } }), { status: 200 }),
    );
    await new AgentHttpClient('http://agent:3200').proposeSeason(INPUT);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://agent:3200/api/agent/game/season-proposal');
    expect((init!.headers as Record<string, string>)[AGENT_INTERNAL_TOKEN_HEADER]).toBe('gateway-side-secret-0123456789abcdef');
  });

  it.each([undefined, '', '  '])('sans secret (%p) : n’appelle pas, agent indisponible', async (value) => {
    if (value === undefined) delete process.env.AGENT_INTERNAL_TOKEN;
    else process.env.AGENT_INTERNAL_TOKEN = value;
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    await expect(new AgentHttpClient('http://agent:3200').proposeSeason(INPUT)).rejects.toBeInstanceOf(AgentUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
