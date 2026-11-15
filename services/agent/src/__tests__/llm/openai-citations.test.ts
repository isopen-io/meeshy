const responsesCreate = jest.fn();
const completionsCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    responses: { create: responsesCreate },
    chat: { completions: { create: completionsCreate } },
  })),
}));

import { createOpenAiProvider } from '../../llm/providers/openai-provider';

function makeProvider() {
  return createOpenAiProvider({ provider: 'openai', apiKey: 'k', model: 'gpt-4o-mini' });
}

describe('OpenAI provider — web search citations', () => {
  beforeEach(() => {
    responsesCreate.mockReset();
    completionsCreate.mockReset();
  });

  it('surfaces url_citation annotations of the answer, deduplicated, in order', async () => {
    responsesCreate.mockResolvedValue({
      model: 'gpt-4o-mini',
      usage: { input_tokens: 5, output_tokens: 7 },
      output: [
        { type: 'web_search_call', status: 'completed' },
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'Un bus a pris feu à Yaoundé.',
              annotations: [
                { type: 'url_citation', url: 'https://actucameroun.com/bus-feu', title: 'Bus en feu' },
                { type: 'url_citation', url: 'https://actucameroun.com/bus-feu', title: 'Bus en feu (dup)' },
                { type: 'url_citation', url: 'https://www.camerounweb.com/x', title: 'X' },
                { type: 'file_citation', file_id: 'f1' },
              ],
            },
          ],
        },
      ],
    });

    const response = await makeProvider().chat({
      messages: [{ role: 'user', content: 'quoi de neuf ?' }],
      tools: [{ type: 'web_search_preview' }],
    });

    expect(response.content).toBe('Un bus a pris feu à Yaoundé.');
    expect(response.citations).toEqual([
      { url: 'https://actucameroun.com/bus-feu', title: 'Bus en feu' },
      { url: 'https://www.camerounweb.com/x', title: 'X' },
    ]);
  });

  it('returns no citations when the answer carries no annotation', async () => {
    responsesCreate.mockResolvedValue({
      model: 'gpt-4o-mini',
      usage: { input_tokens: 1, output_tokens: 1 },
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Rien.' }] }],
    });
    const response = await makeProvider().chat({
      messages: [{ role: 'user', content: 'x' }],
      tools: [{ type: 'web_search_preview' }],
    });
    expect(response.citations ?? []).toEqual([]);
  });

  it('carries no citations on the plain chat-completions path', async () => {
    completionsCreate.mockResolvedValue({
      model: 'gpt-4o-mini',
      usage: { prompt_tokens: 1, completion_tokens: 1 },
      choices: [{ message: { content: 'Salut' } }],
    });
    const response = await makeProvider().chat({ messages: [{ role: 'user', content: 'x' }] });
    expect(response.content).toBe('Salut');
    expect(response.citations).toBeUndefined();
  });
});
