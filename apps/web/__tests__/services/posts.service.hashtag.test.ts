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

const mockApi = apiService as jest.Mocked<typeof apiService>;

describe('postsService.getPostsByHashtag', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('calls GET /posts/hashtag/:tag with cursor and limit', async () => {
    const innerResponse = { success: true, data: [], meta: { pagination: { total: 0, offset: 0, limit: 20, hasMore: false }, nextCursor: null } };
    mockApi.get.mockResolvedValue({ success: true, data: innerResponse });

    const result = await postsService.getPostsByHashtag('paris', { cursor: '20', limit: 20 });

    expect(mockApi.get).toHaveBeenCalledWith('/posts/hashtag/paris?cursor=20&limit=20');
    expect(result).toEqual(innerResponse);
  });

  it('omits query string entirely when no filters given', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: { success: true, data: [] } });

    await postsService.getPostsByHashtag('paris');

    expect(mockApi.get).toHaveBeenCalledWith('/posts/hashtag/paris');
  });
});

describe('postsService.getTrendingHashtags', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('calls GET /hashtags/trending with the given limit', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: { success: true, data: [{ tag: 'paris', usageCount: 42 }] } });

    const result = await postsService.getTrendingHashtags(10);

    expect(mockApi.get).toHaveBeenCalledWith('/hashtags/trending?limit=10');
    expect(result).toEqual([{ tag: 'paris', usageCount: 42 }]);
  });

  it('defaults to limit 20', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: { success: true, data: [] } });
    await postsService.getTrendingHashtags();
    expect(mockApi.get).toHaveBeenCalledWith('/hashtags/trending?limit=20');
  });
});
