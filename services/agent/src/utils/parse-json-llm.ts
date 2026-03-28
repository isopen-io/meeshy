/**
 * Parse JSON from LLM output, stripping markdown code fences if present.
 * Handles: ```json ... ```, ``` ... ```, text before/after fences, and raw JSON.
 */
export function parseJsonLlm<T = unknown>(content: string): T {
  let cleaned = content.trim();

  // Extract JSON from within code fences (handles text before/after)
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  } else {
    // Fallback: strip leading/trailing fences if present
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
  }

  // Try to extract JSON object/array if surrounded by non-JSON text
  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
    const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      cleaned = jsonMatch[1];
    }
  }

  return JSON.parse(cleaned) as T;
}
