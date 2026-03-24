import { describe, it, expect } from 'vitest';
import { getSenderUserId } from '../../utils/sender-identity';

describe('getSenderUserId', () => {
  it('should return null for null/undefined sender', () => {
    expect(getSenderUserId(null)).toBeNull();
    expect(getSenderUserId(undefined)).toBeNull();
  });

  it('should return userId from flat structure', () => {
    const sender = { id: 'part-123', userId: 'user-123' };
    expect(getSenderUserId(sender)).toBe('user-123');
  });

  it('should return user.id from nested structure', () => {
    const sender = { id: 'part-123', user: { id: 'user-123' } };
    expect(getSenderUserId(sender)).toBe('user-123');
  });

  it('should prioritize flat userId over nested user.id', () => {
    const sender = { id: 'part-123', userId: 'user-flat', user: { id: 'user-nested' } };
    expect(getSenderUserId(sender)).toBe('user-flat');
  });

  it('should return null if no userId found', () => {
    const sender = { id: 'part-123' };
    expect(getSenderUserId(sender)).toBeNull();
  });

  it('should return null if nested user has no id', () => {
    const sender = { id: 'part-123', user: { name: 'Test' } };
    expect(getSenderUserId(sender as any)).toBeNull();
  });
});
