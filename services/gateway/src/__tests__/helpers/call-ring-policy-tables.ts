import { jest } from '@jest/globals';

type UserIdFilter = { where: { userId: { in: ReadonlyArray<string> } } };

const privacyDocuments = (acceptCallsFromNonContacts: boolean) =>
  jest.fn(async ({ where }: UserIdFilter) =>
    where.userId.in.map((userId) => ({ userId, privacy: { acceptCallsFromNonContacts } }))
  );

export const openCallRingTables = () => ({
  userPreferences: { findMany: privacyDocuments(true) },
  userPreference: { findMany: jest.fn(async () => []) },
  friendRequest: { findMany: jest.fn(async () => []) },
});

export const closedCallRingTables = (friendsOfCaller: ReadonlyArray<{ senderId: string; receiverId: string }> = []) => ({
  userPreferences: { findMany: privacyDocuments(false) },
  userPreference: { findMany: jest.fn(async () => []) },
  friendRequest: { findMany: jest.fn(async () => friendsOfCaller) },
});
