/**
 * Merge a partial config record onto a complete set of defaults, keeping the
 * default whenever the record's value is `undefined` (absent field). Explicit
 * `null` is preserved — it is a meaningful value for nullable fields such as
 * `agentInstructions`. Falsy-but-defined values (0, '', false) override.
 *
 * Editing an existing agent config must always yield a COMPLETE form so the
 * PUT payload carries every field; otherwise fields added after a record was
 * created (e.g. freshTopicProbability) stay `undefined`, get stripped from the
 * JSON body, and silently never persist.
 */
export function mergeDefinedFields<T extends object>(defaults: T, overrides: Partial<T>): T {
  const merged = { ...defaults };
  (Object.keys(overrides) as (keyof T)[]).forEach((key) => {
    const value = overrides[key];
    if (value !== undefined) {
      merged[key] = value as T[keyof T];
    }
  });
  return merged;
}
