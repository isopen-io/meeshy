/**
 * Unit tests for services/posts/postVisibility.ts
 * Covers: canUserViewPost with all PostVisibility branches
 */

import { describe, it, expect, jest } from '@jest/globals';
import { canUserViewPost } from '../../../services/posts/postVisibility';

jest.mock('../../../services/posts/communityVisibility', () => ({
  doUsersShareCommunity: jest.fn<any>().mockResolvedValue(false),
}));

import { doUsersShareCommunity } from '../../../services/posts/communityVisibility';

function makePrisma(): any {
  return {
    friendRequest: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
  };
}

const AUTHOR_ID = 'author-1';
const OTHER_USER = 'user-other';

// Helper to build post records
function makePost(visibility: string, visibilityUserIds: string[] = [], authorId = AUTHOR_ID): any {
  return { authorId, visibility, visibilityUserIds };
}

describe('canUserViewPost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (doUsersShareCommunity as jest.Mock).mockResolvedValue(false);
  });

  it('returns true when user is the post author', async () => {
    const prisma = makePrisma();
    const result = await canUserViewPost(prisma, makePost('PUBLIC'), AUTHOR_ID);
    expect(result).toBe(true);
  });

  it('returns true for PUBLIC visibility', async () => {
    const prisma = makePrisma();
    const result = await canUserViewPost(prisma, makePost('PUBLIC'), OTHER_USER);
    expect(result).toBe(true);
  });

  it('returns false for PRIVATE visibility', async () => {
    const prisma = makePrisma();
    const result = await canUserViewPost(prisma, makePost('PRIVATE'), OTHER_USER);
    expect(result).toBe(false);
  });

  it('returns true for ONLY visibility when user is in list', async () => {
    const prisma = makePrisma();
    const result = await canUserViewPost(prisma, makePost('ONLY', [OTHER_USER]), OTHER_USER);
    expect(result).toBe(true);
  });

  it('returns false for ONLY visibility when user is not in list', async () => {
    const prisma = makePrisma();
    const result = await canUserViewPost(prisma, makePost('ONLY', ['someone-else']), OTHER_USER);
    expect(result).toBe(false);
  });

  it('delegates to doUsersShareCommunity for COMMUNITY visibility', async () => {
    const prisma = makePrisma();
    (doUsersShareCommunity as jest.Mock).mockResolvedValueOnce(true);

    const result = await canUserViewPost(prisma, makePost('COMMUNITY'), OTHER_USER);
    expect(result).toBe(true);
    expect(doUsersShareCommunity).toHaveBeenCalledWith(prisma, AUTHOR_ID, OTHER_USER);
  });

  it('returns false for COMMUNITY when users share no community', async () => {
    const prisma = makePrisma();
    (doUsersShareCommunity as jest.Mock).mockResolvedValueOnce(false);

    const result = await canUserViewPost(prisma, makePost('COMMUNITY'), OTHER_USER);
    expect(result).toBe(false);
  });

  it('returns true for FRIENDS visibility when user is a friend', async () => {
    const prisma = makePrisma();
    prisma.friendRequest.findFirst.mockResolvedValueOnce({ id: 'fr-1' });

    const result = await canUserViewPost(prisma, makePost('FRIENDS'), OTHER_USER);
    expect(result).toBe(true);
  });

  it('returns false for FRIENDS visibility when user is not a friend', async () => {
    const prisma = makePrisma();
    prisma.friendRequest.findFirst.mockResolvedValueOnce(null);

    const result = await canUserViewPost(prisma, makePost('FRIENDS'), OTHER_USER);
    expect(result).toBe(false);
  });

  it('returns true for EXCEPT when user is a friend and not in exclusion list', async () => {
    const prisma = makePrisma();
    prisma.friendRequest.findFirst.mockResolvedValueOnce({ id: 'fr-1' });

    const result = await canUserViewPost(prisma, makePost('EXCEPT', ['excluded-user']), OTHER_USER);
    expect(result).toBe(true);
  });

  it('returns false for EXCEPT when user is in the exclusion list', async () => {
    const prisma = makePrisma();
    prisma.friendRequest.findFirst.mockResolvedValueOnce({ id: 'fr-1' });

    const result = await canUserViewPost(prisma, makePost('EXCEPT', [OTHER_USER]), OTHER_USER);
    expect(result).toBe(false);
  });

  it('returns false for EXCEPT when user is not a friend', async () => {
    const prisma = makePrisma();
    prisma.friendRequest.findFirst.mockResolvedValueOnce(null);

    const result = await canUserViewPost(prisma, makePost('EXCEPT', []), OTHER_USER);
    expect(result).toBe(false);
  });

  it('returns false for unknown visibility value', async () => {
    const prisma = makePrisma();
    const result = await canUserViewPost(prisma, makePost('UNKNOWN_VISIBILITY'), OTHER_USER);
    expect(result).toBe(false);
  });
});
