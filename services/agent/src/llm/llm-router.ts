import type { LlmProvider, LlmChatParams, LlmChatResponse } from './types';

/**
 * Hot-swappable wrapper around an LlmProvider. The graph captures one
 * reference at boot and never sees it change, so without this indirection
 * an admin updating the LLM config via /admin/agent/llm or /admin/agent/global-config
 * would require an agent restart for the new provider to take effect.
 *
 * Calls in flight at swap time finish on the previous instance; new calls
 * land on the swapped-in one. No queueing, no quiescing.
 */
export class LlmRouter implements LlmProvider {
  private current: LlmProvider;

  constructor(initial: LlmProvider) {
    this.current = initial;
  }

  get name(): string {
    return this.current.name;
  }

  async chat(params: LlmChatParams): Promise<LlmChatResponse> {
    return this.current.chat(params);
  }

  swap(next: LlmProvider): void {
    this.current = next;
  }
}
