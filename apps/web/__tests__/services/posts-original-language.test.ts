/**
 * F5 — `originalLanguage` enfin envoyé pour les créations à `storyEffects`
 * (composer story), corrigé par F7d (constat 20 — arbitrage 8, addendum
 * rév. 2) : `PostsFeedScreen.handleStoryPublish` envoyait déjà le champ,
 * mais avec la langue de LECTURE préférée du LECTEUR — un concept différent
 * de la langue du CONTENU publié. Le funnel le résout maintenant dans
 * `postsService.createPost`, une seule fois, depuis la locale d'INTERFACE
 * active de l'AUTEUR (`getCurrentInterfaceLocale`, le mécanisme de langue UI
 * existant du web — pas `resolveUserLanguage`). Elle ne part QUE pour une
 * story SANS texte : dès qu'un `content` est présent, le champ reste ABSENT
 * et la détection serveur (`detectLanguage`, sur le texte lui-même, plus
 * fiable) reste le repli — ne jamais envoyer une langue devinée fausse qui
 * la court-circuiterait.
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

  it('sends originalLanguage from the active UI locale when creating a text-less story with storyEffects', async () => {
    mockGetCurrentInterfaceLocale.mockReturnValue('es');
    const body = {
      type: 'STORY' as const,
      visibility: 'FRIENDS' as const,
      storyEffects: { backgroundColor: '#000000', textStyle: 'bold' },
    };

    await postsService.createPost(body);

    expect(mockApi.post).toHaveBeenCalledWith('/posts', expect.objectContaining({ originalLanguage: 'es' }));
  });

  // Constat 20 (F7d) — une story qui PORTE du texte doit laisser le champ
  // absent : le serveur détecte la langue depuis le contenu lui-même
  // (`detectLanguage`), plus fiable que la locale d'interface de l'auteur
  // (un francophone d'interface peut très bien écrire en anglais).
  it('does not send originalLanguage when the story carries text - server text detection is more reliable', async () => {
    mockGetCurrentInterfaceLocale.mockReturnValue('es');
    const body = {
      type: 'STORY' as const,
      visibility: 'FRIENDS' as const,
      content: 'Hello there',
      storyEffects: { backgroundColor: '#000000', textStyle: 'bold' },
    };

    await postsService.createPost(body);

    const [, sentBody] = mockApi.post.mock.calls[0];
    expect(sentBody).not.toHaveProperty('originalLanguage');
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
      content: 'Hello there',
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
