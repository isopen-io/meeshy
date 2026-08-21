/**
 * F5 — `originalLanguage` enfin envoyé pour les créations à `storyEffects`
 * (composer story) : le champ existait déjà sur `CreatePostRequest`, mais
 * aucun appelant ne le renseignait. Le funnel le résout maintenant dans
 * `postsService.createPost`, une seule fois, depuis la locale d'INTERFACE
 * active (`getCurrentInterfaceLocale`, le mécanisme de langue UI existant
 * du web — pas `resolveUserLanguage`, qui résout la langue de LECTURE
 * préférée, un concept différent). Sans `storyEffects`, ou sans langue
 * connue, le champ reste ABSENT : la détection serveur (`detectLanguage`)
 * reste le repli — ne jamais envoyer une langue devinée fausse qui la
 * court-circuiterait.
 */

import { postsService } from '@/services/posts.service';
import { apiService } from '@/services/api.service';

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: (endpoint: string) => `http://localhost:3000/api/v1${endpoint}`,
}));

const mockGetCurrentInterfaceLocale = jest.fn();
jest.mock('@/stores/language-store', () => ({
  getCurrentInterfaceLocale: () => mockGetCurrentInterfaceLocale(),
}));

const mockApi = apiService as jest.Mocked<typeof apiService>;

describe('postsService.createPost — originalLanguage (F5)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockApi.post.mockResolvedValue({ success: true, data: { id: 'story-1' } });
  });

  it('sends originalLanguage from the active UI locale when creating with storyEffects', async () => {
    mockGetCurrentInterfaceLocale.mockReturnValue('es');
    const body = {
      type: 'STORY' as const,
      visibility: 'FRIENDS' as const,
      storyEffects: { backgroundColor: '#000000', textStyle: 'bold' },
    };

    await postsService.createPost(body);

    expect(mockApi.post).toHaveBeenCalledWith('/posts', expect.objectContaining({ originalLanguage: 'es' }));
  });

  it('does not send originalLanguage when the active locale is unknown - never a guessed language', async () => {
    mockGetCurrentInterfaceLocale.mockReturnValue('');
    const body = {
      type: 'STORY' as const,
      visibility: 'FRIENDS' as const,
      storyEffects: { backgroundColor: '#000000', textStyle: 'bold' },
    };

    await postsService.createPost(body);

    const [, sentBody] = mockApi.post.mock.calls[0];
    expect(sentBody).not.toHaveProperty('originalLanguage');
  });

  it('leaves an explicitly-set originalLanguage untouched - e.g. audio transcription language wins over the UI locale', async () => {
    mockGetCurrentInterfaceLocale.mockReturnValue('es');
    const body = {
      type: 'STORY' as const,
      visibility: 'FRIENDS' as const,
      storyEffects: { backgroundColor: '#000000', textStyle: 'bold' },
      originalLanguage: 'ja',
    };

    await postsService.createPost(body);

    expect(mockApi.post).toHaveBeenCalledWith('/posts', expect.objectContaining({ originalLanguage: 'ja' }));
  });

  it('does not send originalLanguage for creates without storyEffects - server detection stays the fallback', async () => {
    mockGetCurrentInterfaceLocale.mockReturnValue('es');
    const body = { type: 'POST' as const, visibility: 'PUBLIC' as const, content: 'hello' };

    await postsService.createPost(body);

    const [, sentBody] = mockApi.post.mock.calls[0];
    expect(sentBody).not.toHaveProperty('originalLanguage');
  });
});
