import {
  EnableBodySchema,
  DisableBodySchema,
  VerifyBodySchema,
  BackupCodesBodySchema,
} from '../../../validation/two-factor-schemas';

describe('EnableBodySchema', () => {
  it('accepts a 6-char code', () => {
    expect(EnableBodySchema.safeParse({ code: '123456' }).success).toBe(true);
  });

  it('rejects a 5-char code (too short)', () => {
    expect(EnableBodySchema.safeParse({ code: '12345' }).success).toBe(false);
  });

  it('rejects a 7-char code (too long)', () => {
    expect(EnableBodySchema.safeParse({ code: '1234567' }).success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(EnableBodySchema.safeParse({ code: '' }).success).toBe(false);
  });

  it('rejects missing code', () => {
    expect(EnableBodySchema.safeParse({}).success).toBe(false);
  });
});

describe('DisableBodySchema', () => {
  it('accepts a password without optional code', () => {
    expect(DisableBodySchema.safeParse({ password: 'mypassword' }).success).toBe(true);
  });

  it('accepts a password with a 6-char code', () => {
    expect(DisableBodySchema.safeParse({ password: 'mypassword', code: '123456' }).success).toBe(true);
  });

  it('accepts a password with an 8-char code (max)', () => {
    expect(DisableBodySchema.safeParse({ password: 'mypassword', code: '12345678' }).success).toBe(true);
  });

  it('rejects a code that is 5 chars (below min)', () => {
    expect(DisableBodySchema.safeParse({ password: 'mypassword', code: '12345' }).success).toBe(false);
  });

  it('rejects a code that is 9 chars (above max)', () => {
    expect(DisableBodySchema.safeParse({ password: 'mypassword', code: '123456789' }).success).toBe(false);
  });

  it('rejects an empty password', () => {
    expect(DisableBodySchema.safeParse({ password: '' }).success).toBe(false);
  });

  it('rejects missing password', () => {
    expect(DisableBodySchema.safeParse({}).success).toBe(false);
  });
});

describe('VerifyBodySchema', () => {
  it('accepts a 6-char code', () => {
    expect(VerifyBodySchema.safeParse({ code: '123456' }).success).toBe(true);
  });

  it('accepts a 9-char code (max)', () => {
    expect(VerifyBodySchema.safeParse({ code: '123456789' }).success).toBe(true);
  });

  it('rejects a 5-char code (below min)', () => {
    expect(VerifyBodySchema.safeParse({ code: '12345' }).success).toBe(false);
  });

  it('rejects a 10-char code (above max)', () => {
    expect(VerifyBodySchema.safeParse({ code: '1234567890' }).success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(VerifyBodySchema.safeParse({ code: '' }).success).toBe(false);
  });

  it('rejects missing code', () => {
    expect(VerifyBodySchema.safeParse({}).success).toBe(false);
  });
});

describe('BackupCodesBodySchema', () => {
  it('accepts a 6-char code', () => {
    expect(BackupCodesBodySchema.safeParse({ code: '123456' }).success).toBe(true);
  });

  it('rejects a 5-char code', () => {
    expect(BackupCodesBodySchema.safeParse({ code: '12345' }).success).toBe(false);
  });

  it('rejects a 7-char code', () => {
    expect(BackupCodesBodySchema.safeParse({ code: '1234567' }).success).toBe(false);
  });

  it('rejects missing code', () => {
    expect(BackupCodesBodySchema.safeParse({}).success).toBe(false);
  });
});
