const messagesCreate = jest.fn();

jest.mock(
  '@anthropic-ai/sdk',
  () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({ messages: { create: messagesCreate } })),
  }),
  { virtual: true },
);

import { createAnthropicProvider } from '../../llm/providers/anthropic-provider';

function makeProvider() {
  return createAnthropicProvider({ provider: 'anthropic', apiKey: 'k', model: 'claude-haiku-4-5-20251001' });
}

function searchedAnswer() {
  return {
    model: 'claude-haiku-4-5-20251001',
    usage: { input_tokens: 5, output_tokens: 7, server_tool_use: { web_search_requests: 1 } },
    stop_reason: 'end_turn',
    content: [
      { type: 'text', text: 'Je vais chercher les nouvelles.' },
      { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'faits divers Yaoundé' } },
      {
        type: 'web_search_tool_result',
        tool_use_id: 'srvtoolu_1',
        content: [{ type: 'web_search_result', url: 'https://actucameroun.com/bus-feu', title: 'Bus en feu', encrypted_content: 'x' }],
      },
      { type: 'text', text: 'Selon la presse, ' },
      {
        type: 'text',
        text: 'un bus a pris feu à Yaoundé.',
        citations: [
          { type: 'web_search_result_location', url: 'https://actucameroun.com/bus-feu', title: 'Bus en feu', cited_text: 'Un bus…', encrypted_index: 'a' },
          { type: 'web_search_result_location', url: 'https://actucameroun.com/bus-feu', title: 'Bus en feu (dup)', cited_text: 'Un bus…', encrypted_index: 'b' },
          { type: 'web_search_result_location', url: 'https://www.camerounweb.com/x', title: 'X', cited_text: '…', encrypted_index: 'c' },
          { type: 'char_location', document_index: 0, cited_text: '…' },
        ],
      },
    ],
  };
}

describe('Anthropic provider — web search citations', () => {
  beforeEach(() => {
    messagesCreate.mockReset();
  });

  it('asks for the server-side web search tool when tools carry web_search_preview', async () => {
    messagesCreate.mockResolvedValue(searchedAnswer());
    await makeProvider().chat({
      messages: [{ role: 'user', content: 'quoi de neuf ?' }],
      tools: [{ type: 'web_search_preview', search_context_size: 'medium' }],
    });
    const request = messagesCreate.mock.calls[0]?.[0];
    expect(request.tools).toEqual([expect.objectContaining({ type: 'web_search_20250305', name: 'web_search' })]);
  });

  it('surfaces web_search_result_location citations, deduplicated, in order, and the answer written after the search', async () => {
    messagesCreate.mockResolvedValue(searchedAnswer());
    const response = await makeProvider().chat({
      messages: [{ role: 'user', content: 'quoi de neuf ?' }],
      tools: [{ type: 'web_search_preview' }],
    });
    expect(response.content).toBe('Selon la presse, un bus a pris feu à Yaoundé.');
    expect(response.citations).toEqual([
      { url: 'https://actucameroun.com/bus-feu', title: 'Bus en feu' },
      { url: 'https://www.camerounweb.com/x', title: 'X' },
    ]);
  });

  it('returns no citations when the answer carries none', async () => {
    messagesCreate.mockResolvedValue({
      model: 'm',
      usage: { input_tokens: 1, output_tokens: 1 },
      content: [{ type: 'text', text: 'Rien.' }],
    });
    const response = await makeProvider().chat({
      messages: [{ role: 'user', content: 'x' }],
      tools: [{ type: 'web_search_preview' }],
    });
    expect(response.citations ?? []).toEqual([]);
  });

  it('sends no tool and carries no citations on the plain path', async () => {
    messagesCreate.mockResolvedValue({
      model: 'm',
      usage: { input_tokens: 1, output_tokens: 1 },
      content: [{ type: 'text', text: 'Salut' }],
    });
    const response = await makeProvider().chat({ messages: [{ role: 'user', content: 'x' }] });
    expect(messagesCreate.mock.calls[0]?.[0].tools).toBeUndefined();
    expect(response.content).toBe('Salut');
    expect(response.citations).toBeUndefined();
  });
});
