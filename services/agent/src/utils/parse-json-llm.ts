import { jsonrepair } from 'jsonrepair';

/**
 * Parse JSON from LLM output, stripping markdown code fences if present.
 * Handles: ```json ... ```, ``` ... ```, text before/after fences, and raw JSON.
 *
 * LLMs (notably gpt-4o-mini) frequently emit near-JSON: trailing commas,
 * single-quoted keys/values, unquoted keys, or output truncated at the token
 * cap. We attempt strict parsing first, then fall back to `jsonrepair` — a
 * battle-tested repair pass that also closes truncated structures — so a
 * single stray comma never discards a whole strategist/observer cycle.
 */
export function parseJsonLlm<T = unknown>(content: string): T {
  const cleaned = extractJsonRegion(content);

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const repaired = JSON.parse(jsonrepair(cleaned));
    if (repaired === null || typeof repaired !== 'object') {
      throw new Error(
        `parseJsonLlm: no JSON object/array recoverable from output: "${cleaned.slice(0, 80)}"`,
      );
    }
    return repaired as T;
  }
}

function extractJsonRegion(content: string): string {
  let cleaned = content.trim();

  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  } else {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
  }

  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
    const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      cleaned = jsonMatch[1];
    }
  }

  return cleaned;
}
