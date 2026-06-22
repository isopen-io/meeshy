import { mergeDefinedFields } from '@/components/admin/agent/config-form-merge';

describe('mergeDefinedFields', () => {
  describe('basic merging', () => {
    it('returns the defaults when overrides is empty', () => {
      const defaults = { a: 1, b: 'hello', c: true };
      expect(mergeDefinedFields(defaults, {})).toEqual({ a: 1, b: 'hello', c: true });
    });

    it('overrides a field when override value is defined', () => {
      const defaults = { a: 1, b: 'hello' };
      const result = mergeDefinedFields(defaults, { a: 42 });
      expect(result).toEqual({ a: 42, b: 'hello' });
    });

    it('overrides multiple fields at once', () => {
      const defaults = { a: 1, b: 'hello', c: true };
      const result = mergeDefinedFields(defaults, { a: 99, c: false });
      expect(result).toEqual({ a: 99, b: 'hello', c: false });
    });

    it('does not mutate the defaults object', () => {
      const defaults = { a: 1, b: 'hello' };
      mergeDefinedFields(defaults, { a: 999 });
      expect(defaults.a).toBe(1);
    });

    it('does not mutate the overrides object', () => {
      const defaults = { a: 1, b: 'hello' };
      const overrides = { a: 42 };
      mergeDefinedFields(defaults, overrides);
      expect(overrides.a).toBe(42);
    });
  });

  describe('undefined handling', () => {
    it('skips override when the value is undefined', () => {
      const defaults = { a: 1, b: 'hello' };
      const result = mergeDefinedFields(defaults, { a: undefined });
      expect(result.a).toBe(1);
    });

    it('preserves defaults for all keys not present in overrides', () => {
      const defaults = { x: 10, y: 20, z: 30 };
      const result = mergeDefinedFields(defaults, { y: 99 });
      expect(result.x).toBe(10);
      expect(result.z).toBe(30);
    });
  });

  describe('null handling', () => {
    it('preserves explicit null overrides (null is a meaningful value)', () => {
      const defaults = { instructions: 'default text' as string | null };
      const result = mergeDefinedFields(defaults, { instructions: null });
      expect(result.instructions).toBeNull();
    });
  });

  describe('falsy-but-defined values', () => {
    it('preserves override of 0 (falsy number)', () => {
      const defaults = { count: 5 };
      expect(mergeDefinedFields(defaults, { count: 0 }).count).toBe(0);
    });

    it('preserves override of empty string (falsy string)', () => {
      const defaults = { name: 'default' };
      expect(mergeDefinedFields(defaults, { name: '' }).name).toBe('');
    });

    it('preserves override of false (falsy boolean)', () => {
      const defaults = { enabled: true };
      expect(mergeDefinedFields(defaults, { enabled: false }).enabled).toBe(false);
    });
  });

  describe('new fields in overrides', () => {
    it('adds a key from overrides that was not in defaults', () => {
      const defaults: Record<string, unknown> = { a: 1 };
      const result = mergeDefinedFields(defaults, { b: 'new' } as Partial<typeof defaults>);
      expect(result.b).toBe('new');
    });
  });
});
