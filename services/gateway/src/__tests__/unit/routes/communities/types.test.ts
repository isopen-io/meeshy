/**
 * communities/types unit tests
 *
 * @jest-environment node
 */

import {
  CommunityRole,
  CreateCommunitySchema,
  UpdateCommunitySchema,
  AddMemberSchema,
  UpdateMemberRoleSchema,
  generateIdentifier,
} from '../../../../routes/communities/types';

// ---------------------------------------------------------------------------
// generateIdentifier
// ---------------------------------------------------------------------------

describe('generateIdentifier', () => {
  describe('with customIdentifier', () => {
    it('returns customIdentifier prefixed with mshy_ when no prefix', () => {
      expect(generateIdentifier('My Community', 'my-community')).toBe('mshy_my-community');
    });

    it('returns customIdentifier unchanged when it already starts with mshy_', () => {
      expect(generateIdentifier('My Community', 'mshy_my-community')).toBe('mshy_my-community');
    });

    it('prefixes even identifiers containing @ and _', () => {
      expect(generateIdentifier('Foo', 'foo_bar@baz')).toBe('mshy_foo_bar@baz');
    });
  });

  describe('without customIdentifier (auto-generate)', () => {
    it('lowercases the name and prefixes with mshy_', () => {
      expect(generateIdentifier('Hello World')).toBe('mshy_hello-world');
    });

    it('replaces invalid characters with hyphens and collapses them', () => {
      // 'Café & Brasserie': é, space, &, space all become hyphens → collapsed to one
      expect(generateIdentifier('Café & Brasserie')).toBe('mshy_caf-brasserie');
    });

    it('collapses consecutive hyphens into one', () => {
      // 'A  B': two spaces → two hyphens → collapsed to one
      expect(generateIdentifier('A  B')).toBe('mshy_a-b');
    });

    it('removes leading hyphens from result', () => {
      expect(generateIdentifier('!Hello')).toBe('mshy_hello');
    });

    it('removes trailing hyphens from result', () => {
      expect(generateIdentifier('Hello!')).toBe('mshy_hello');
    });

    it('handles alphanumeric-only name without modification', () => {
      expect(generateIdentifier('Test123')).toBe('mshy_test123');
    });

    it('preserves hyphens and underscores in name', () => {
      expect(generateIdentifier('my-community_dev')).toBe('mshy_my-community_dev');
    });

    it('preserves @ in name', () => {
      expect(generateIdentifier('@channel')).toBe('mshy_@channel');
    });
  });
});

// ---------------------------------------------------------------------------
// CommunityRole enum
// ---------------------------------------------------------------------------

describe('CommunityRole', () => {
  it('has ADMIN, MODERATOR, MEMBER values', () => {
    expect(CommunityRole.ADMIN).toBe('admin');
    expect(CommunityRole.MODERATOR).toBe('moderator');
    expect(CommunityRole.MEMBER).toBe('member');
  });
});

// ---------------------------------------------------------------------------
// CreateCommunitySchema
// ---------------------------------------------------------------------------

describe('CreateCommunitySchema', () => {
  it('accepts valid minimal input', () => {
    const result = CreateCommunitySchema.safeParse({ name: 'My Community' });
    expect(result.success).toBe(true);
  });

  it('defaults isPrivate to true when omitted', () => {
    const result = CreateCommunitySchema.safeParse({ name: 'Test' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isPrivate).toBe(true);
  });

  it('rejects name shorter than 1 char', () => {
    expect(CreateCommunitySchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects name longer than 100 chars', () => {
    expect(CreateCommunitySchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false);
  });

  it('rejects identifier with invalid chars', () => {
    expect(
      CreateCommunitySchema.safeParse({ name: 'Test', identifier: 'has space' }).success
    ).toBe(false);
  });

  it('accepts identifier with letters, numbers, hyphens, underscores, @', () => {
    const result = CreateCommunitySchema.safeParse({
      name: 'Test',
      identifier: 'foo-bar_baz@123',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all optional fields when provided', () => {
    const result = CreateCommunitySchema.safeParse({
      name: 'Community',
      identifier: 'my-id',
      description: 'A description',
      avatar: 'https://cdn.example.com/avatar.png',
      isPrivate: false,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// UpdateCommunitySchema
// ---------------------------------------------------------------------------

describe('UpdateCommunitySchema', () => {
  it('accepts empty object (all fields optional)', () => {
    expect(UpdateCommunitySchema.safeParse({}).success).toBe(true);
  });

  it('rejects name shorter than 1 char', () => {
    expect(UpdateCommunitySchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('accepts banner field', () => {
    const result = UpdateCommunitySchema.safeParse({ banner: 'https://example.com/banner.png' });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AddMemberSchema
// ---------------------------------------------------------------------------

describe('AddMemberSchema', () => {
  it('accepts userId with default role (member)', () => {
    const result = AddMemberSchema.safeParse({ userId: 'user_001' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.role).toBe(CommunityRole.MEMBER);
  });

  it('accepts role ADMIN', () => {
    const result = AddMemberSchema.safeParse({ userId: 'u1', role: 'admin' });
    expect(result.success).toBe(true);
  });

  it('accepts role MODERATOR', () => {
    const result = AddMemberSchema.safeParse({ userId: 'u1', role: 'moderator' });
    expect(result.success).toBe(true);
  });

  it('rejects unknown role', () => {
    expect(AddMemberSchema.safeParse({ userId: 'u1', role: 'superuser' }).success).toBe(false);
  });

  it('rejects missing userId', () => {
    expect(AddMemberSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UpdateMemberRoleSchema
// ---------------------------------------------------------------------------

describe('UpdateMemberRoleSchema', () => {
  it('accepts all valid roles', () => {
    for (const role of ['admin', 'moderator', 'member']) {
      expect(UpdateMemberRoleSchema.safeParse({ role }).success).toBe(true);
    }
  });

  it('rejects missing role', () => {
    expect(UpdateMemberRoleSchema.safeParse({}).success).toBe(false);
  });

  it('rejects invalid role string', () => {
    expect(UpdateMemberRoleSchema.safeParse({ role: 'USER' }).success).toBe(false);
  });
});
