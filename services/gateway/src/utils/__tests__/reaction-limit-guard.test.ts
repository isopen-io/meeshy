import { assertReactionAllowed } from '../reaction-limit-guard';
import { ConflictError } from '../../errors/custom-errors';
import {
  MAX_REACTIONS_PER_OBJECT,
  REACTION_LIMIT_REACHED_MESSAGE,
} from '@meeshy/shared/utils/reaction-limit';

describe('assertReactionAllowed', () => {
  it('does not throw when the count is below the limit', () => {
    expect(() => assertReactionAllowed(0)).not.toThrow();
    expect(() => assertReactionAllowed(MAX_REACTIONS_PER_OBJECT - 1)).not.toThrow();
  });

  it('throws when the count is exactly at the limit', () => {
    expect(() => assertReactionAllowed(MAX_REACTIONS_PER_OBJECT)).toThrow(ConflictError);
  });

  it('throws when the count is already above the limit (incoherent state)', () => {
    expect(() => assertReactionAllowed(MAX_REACTIONS_PER_OBJECT + 3)).toThrow(ConflictError);
  });

  it('throws a ConflictError carrying the shared code, status and message', () => {
    let caught: unknown;
    try {
      assertReactionAllowed(MAX_REACTIONS_PER_OBJECT);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConflictError);
    const conflict = caught as ConflictError;
    expect(conflict.code).toBe('REACTION_LIMIT_REACHED');
    expect(conflict.statusCode).toBe(409);
    expect(conflict.message).toBe(REACTION_LIMIT_REACHED_MESSAGE);
  });
});
