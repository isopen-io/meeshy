/**
 * UserPreferencesService — le compteur `version` doit survivre à la
 * transformation REST.
 *
 * `version` est l'arbitre entre un snapshot local et une diffusion socket
 * (`incoming.version <= local -> drop`). Si l'hydratation REST le perd, le
 * store repart de 0 à chaque rafraîchissement : une diffusion tamponnée par
 * une reconnexion, plus ANCIENNE que ce que le REST vient de rendre, passe
 * alors le portillon et rembobine l'état.
 */

import type { UserConversationPreferences } from '@meeshy/shared/types/user-preferences';

const get = jest.fn();
const put = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: (...args: unknown[]) => get(...args),
    put: (...args: unknown[]) => put(...args),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { UserPreferencesService } from '@/services/user-preferences.service';

const backendRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'pref-1',
  userId: 'user-1',
  conversationId: 'conv-1',
  isPinned: true,
  isMuted: false,
  isArchived: false,
  tags: ['work'],
  categoryId: null,
  orderInCategory: null,
  customName: null,
  reaction: null,
  version: 7,
  createdAt: '2026-08-14T10:00:00.000Z',
  updatedAt: '2026-08-14T10:00:00.000Z',
  ...overrides,
});

describe('UserPreferencesService — version', () => {
  beforeEach(() => {
    get.mockReset();
    put.mockReset();
  });

  it('carries version through getAllPreferences', async () => {
    get.mockResolvedValue({ data: { success: true, data: [backendRow()] } });

    const prefs: UserConversationPreferences[] = await new UserPreferencesService().getAllPreferences();

    expect(prefs).toHaveLength(1);
    expect(prefs[0].version).toBe(7);
  });

  it('carries version through getPreferences', async () => {
    get.mockResolvedValue({ data: { success: true, data: backendRow({ version: 2 }) } });

    const prefs = await new UserPreferencesService().getPreferences('conv-1');

    expect(prefs?.version).toBe(2);
  });

  it('leaves version undefined when the server omits it', async () => {
    // Un serveur antérieur à l'ajout du champ au sérialiseur : l'absence doit
    // rester une absence, pas devenir un 0 inventé qui ferait tomber la
    // première diffusion reçue.
    const { version: _omitted, ...withoutVersion } = backendRow();
    get.mockResolvedValue({ data: { success: true, data: [withoutVersion] } });

    const prefs = await new UserPreferencesService().getAllPreferences();

    expect(prefs[0].version).toBeUndefined();
  });
});
