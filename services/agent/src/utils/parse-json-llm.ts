/**
 * Parse JSON from LLM output, stripping markdown code fences if present.
 * LLMs often wrap JSON in ```json ... ``` blocks.
 */
export function parseJsonLlm<T = unknown>(content: string): T {
  const stripped = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  return JSON.parse(stripped) as T;
}
