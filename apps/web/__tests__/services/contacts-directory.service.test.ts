jest.mock('@/services/api.service', () => ({
  apiService: { get: jest.fn() },
}));

import { contactsDirectoryService } from '@/services/contacts-directory.service';
import { apiService } from '@/services/api.service';

const mockApiGet = apiService.get as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('contactsDirectoryService.list', () => {
  it('interroge /directory/contacts avec filter=meeshy et la requête', async () => {
    mockApiGet.mockResolvedValue({
      success: true,
      data: {
        success: true,
        data: [
          { id: 'd1', displayName: 'Alice', isOnMeeshy: true, matchedUser: { id: 'u1', username: 'alice' } },
        ],
        pagination: { limit: 50, hasMore: false, nextCursor: null },
      },
    });

    const res = await contactsDirectoryService.list({ q: 'ali', filter: 'meeshy', limit: 50 });

    // `/directory/contacts` (#4163) : lecture par CURSEUR, avec delta
    // optionnel. La forme par décalage repayait un dénombrement complet à
    // chaque page, et le carnet entier repartait à chaque revalidation.
    expect(mockApiGet).toHaveBeenCalledWith('/directory/contacts', expect.objectContaining({ filter: 'meeshy', q: 'ali' }));
    expect(res.contacts[0].matchedUser?.id).toBe('u1');
    expect(res.hasMore).toBe(false);
  });

  it('reflète hasMore: true quand la page ne couvre pas tout le carnet', async () => {
    mockApiGet.mockResolvedValue({
      success: true,
      data: {
        success: true,
        data: [{ id: 'd1', displayName: 'Alice', isOnMeeshy: false }],
        pagination: { limit: 1, hasMore: true, nextCursor: 'c1' },
      },
    });

    const res = await contactsDirectoryService.list({ limit: 1 });

    expect(res.hasMore).toBe(true);
    // Le curseur remonte : sans lui, l'appelant ne saurait pas où reprendre.
    expect(res.nextCursor).toBe('c1');
  });

  it('rend une liste vide quand le carnet est vide (côté web, acceptable)', async () => {
    mockApiGet.mockResolvedValue({
      success: true,
      data: {
        success: true,
        data: [],
        pagination: { limit: 50, hasMore: false, nextCursor: null },
      },
    });

    const res = await contactsDirectoryService.list({});

    expect(res.contacts).toEqual([]);
    expect(res.hasMore).toBe(false);
  });

  it('propage une erreur réseau au lieu de la transformer en liste vide', async () => {
    mockApiGet.mockRejectedValue(new Error('network down'));

    await expect(contactsDirectoryService.list({})).rejects.toThrow('network down');
  });
});
