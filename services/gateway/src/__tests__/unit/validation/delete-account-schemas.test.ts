import {
  DeleteAccountBodySchema,
  TokenQuerySchema,
} from '../../../validation/delete-account-schemas';

describe('DeleteAccountBodySchema', () => {
  it('accepts the exact confirmation phrase', () => {
    const result = DeleteAccountBodySchema.safeParse({ confirmationPhrase: 'SUPPRIMER MON COMPTE' });
    expect(result.success).toBe(true);
  });

  it('rejects a wrong phrase', () => {
    const result = DeleteAccountBodySchema.safeParse({ confirmationPhrase: 'delete my account' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty string', () => {
    const result = DeleteAccountBodySchema.safeParse({ confirmationPhrase: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a case-variant of the phrase', () => {
    const result = DeleteAccountBodySchema.safeParse({ confirmationPhrase: 'supprimer mon compte' });
    expect(result.success).toBe(false);
  });

  it('rejects missing confirmationPhrase field', () => {
    const result = DeleteAccountBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects extra unknown fields (strict)', () => {
    const result = DeleteAccountBodySchema.safeParse({
      confirmationPhrase: 'SUPPRIMER MON COMPTE',
      extra: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('TokenQuerySchema', () => {
  it('accepts a non-empty token', () => {
    expect(TokenQuerySchema.safeParse({ token: 'abc123' }).success).toBe(true);
  });

  it('accepts a single-character token', () => {
    expect(TokenQuerySchema.safeParse({ token: 'x' }).success).toBe(true);
  });

  it('rejects an empty token', () => {
    expect(TokenQuerySchema.safeParse({ token: '' }).success).toBe(false);
  });

  it('rejects missing token field', () => {
    expect(TokenQuerySchema.safeParse({}).success).toBe(false);
  });

  it('rejects extra unknown fields (strict)', () => {
    const result = TokenQuerySchema.safeParse({ token: 'abc', extra: true });
    expect(result.success).toBe(false);
  });
});
