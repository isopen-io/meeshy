import { mergeDefinedFields } from '../config-form-merge';

/**
 * Régression admin 2026-06-01 : éditer une config agent existante écrasait le
 * form avec UNIQUEMENT les champs présents dans le record DB. Les champs ajoutés
 * après coup (ex. freshTopicProbability sur de vieux records) restaient
 * `undefined` → supprimés du body PUT → jamais persistés. Le merge avec les
 * defaults garantit un form complet, donc un payload complet à la sauvegarde.
 */

describe('mergeDefinedFields', () => {
  const defaults = { enabled: true, freshTopicProbability: 0.2, burstSize: 4, agentInstructions: null as string | null };

  it('keeps the default when a field is absent from the record', () => {
    const merged = mergeDefinedFields(defaults, { enabled: true });
    expect(merged.freshTopicProbability).toBe(0.2);
    expect(merged.burstSize).toBe(4);
  });

  it('overrides the default with a provided value', () => {
    const merged = mergeDefinedFields(defaults, { freshTopicProbability: 0.65 });
    expect(merged.freshTopicProbability).toBe(0.65);
  });

  it('keeps the default when the override value is undefined', () => {
    const merged = mergeDefinedFields(defaults, { freshTopicProbability: undefined });
    expect(merged.freshTopicProbability).toBe(0.2);
  });

  it('preserves an explicit null (meaningful for nullable fields)', () => {
    const merged = mergeDefinedFields({ ...defaults, agentInstructions: 'old' }, { agentInstructions: null });
    expect(merged.agentInstructions).toBeNull();
  });

  it('overrides a falsy value (0) correctly — does not treat 0 as missing', () => {
    const merged = mergeDefinedFields(defaults, { freshTopicProbability: 0 });
    expect(merged.freshTopicProbability).toBe(0);
  });

  it('does not mutate the defaults object', () => {
    const snapshot = { ...defaults };
    mergeDefinedFields(defaults, { freshTopicProbability: 0.9 });
    expect(defaults).toEqual(snapshot);
  });
});
