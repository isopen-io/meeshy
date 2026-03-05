import { createQualityGateNode } from '../../agents/quality-gate';
import type { LlmProvider } from '../../llm/types';

const mockLlm: LlmProvider = {
  name: 'mock',
  async chat({ messages }) {
    const content = messages[0]?.content ?? '';
    const isGood = content.includes('Bonjour');
    return {
      content: JSON.stringify({ coherent: isGood, score: isGood ? 0.9 : 0.2, reason: 'test' }),
      usage: { inputTokens: 10, outputTokens: 10 },
      model: 'mock',
      latencyMs: 5,
    };
  },
};

describe('Quality Gate', () => {
  it('passes good responses through', async () => {
    const gate = createQualityGateNode(mockLlm);
    const result = await gate({
      pendingResponse: {
        type: 'agent:response',
        content: 'Bonjour, comment ça va ?',
        metadata: { roleConfidence: 0.8, agentType: 'animator' },
      },
      toneProfiles: {
        'user1': { tone: 'amical', vocabularyLevel: 'courant', typicalLength: 'moyen' },
      },
      selectedUserId: 'user1',
    } as any);
    expect(result.pendingResponse).toBeTruthy();
    expect((result as any).pendingResponse.metadata.roleConfidence).toBe(0.9);
  });

  it('rejects low quality responses', async () => {
    const gate = createQualityGateNode(mockLlm);
    const result = await gate({
      pendingResponse: {
        type: 'agent:response',
        content: 'Generic response without greeting',
        metadata: { roleConfidence: 0.8, agentType: 'animator' },
      },
      toneProfiles: {
        'user1': { tone: 'amical', vocabularyLevel: 'courant', typicalLength: 'moyen' },
      },
      selectedUserId: 'user1',
    } as any);
    expect(result.pendingResponse).toBeNull();
  });

  it('handles null pending response', async () => {
    const gate = createQualityGateNode(mockLlm);
    const result = await gate({
      pendingResponse: null,
      toneProfiles: {},
      selectedUserId: 'user1',
    } as any);
    expect(result.pendingResponse).toBeNull();
  });

  it('handles missing profile gracefully', async () => {
    const gate = createQualityGateNode(mockLlm);
    const result = await gate({
      pendingResponse: {
        type: 'agent:response',
        content: 'Bonjour',
        metadata: { roleConfidence: 0.8, agentType: 'animator' },
      },
      toneProfiles: {},
      selectedUserId: 'user1',
    } as any);
    // No profile means gate returns state as-is
    expect(result.pendingResponse).toBeTruthy();
  });

  it('handles LLM error gracefully', async () => {
    const errorLlm: LlmProvider = {
      name: 'error-mock',
      async chat() { throw new Error('LLM unavailable'); },
    };
    const gate = createQualityGateNode(errorLlm);
    const state = {
      pendingResponse: {
        type: 'agent:response',
        content: 'Bonjour',
        metadata: { roleConfidence: 0.8, agentType: 'animator' },
      },
      toneProfiles: { 'user1': { tone: 'amical', vocabularyLevel: 'courant', typicalLength: 'moyen' } },
      selectedUserId: 'user1',
    } as any;
    const result = await gate(state);
    // On error, returns state unchanged
    expect(result).toEqual(state);
  });
});
