/**
 * W8 — le SEUL site qui appelle `useRepostMutation().mutate(...)` avec un
 * `targetType`.
 *
 * Avant ce lot, huit endroits (`PostsFeedScreen` ×3 gestes, `ReelsFeedScreen`
 * ×2, `app/feeds/post/[postId]/page.tsx` ×1 partagé, `app/reel/[postId]/page.tsx`
 * ×2, `app/story/[postId]/page.tsx` ×1) construisaient chacun la charge
 * `{ isQuote, targetType, content? }` à la main. Le commentaire de
 * `RepostRequest.targetType` (`services/posts.service.ts`) documentait cette
 * dispersion : « ce sont les tests par site d'appel qui tiennent la loi ».
 * Après ce lot il n'y a plus qu'UN site — celui-ci — et c'est cette suite qui
 * tient la loi, pas huit copies de la même assertion.
 *
 * `targetId` n'est PAS un paramètre implicite ici : l'appelant le fournit,
 * qu'il vienne de `repostTargetId()` (surfaces de carte) ou de `story.id`
 * (viewer de story, qui en est délibérément exclu — voir
 * `packages/shared/utils/repost-target.ts`). Ce hook ne résout aucune cible,
 * il ne fait qu'UNE chose : poser `{ isQuote, targetType, content? }` sur
 * `useRepostMutation()`.
 */
import { renderHook, act } from '@testing-library/react';

const mockRepostMutate = jest.fn();
jest.mock('@/hooks/queries/use-post-mutations', () => ({
  useRepostMutation: () => ({ mutate: mockRepostMutate, isPending: false }),
}));

import { useComposerRepost } from '@/hooks/composer/useComposerRepost';

describe('useComposerRepost — le site UNIQUE de la charge repost', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pose isQuote et targetType, sans content, pour un repost sec', () => {
    const { result } = renderHook(() => useComposerRepost());
    act(() => {
      result.current.repost({ targetId: 'root-1', targetType: 'REEL', isQuote: false });
    });

    expect(mockRepostMutate).toHaveBeenCalledWith(
      { postId: 'root-1', data: { isQuote: false, targetType: 'REEL' } },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it('porte le content pour une citation, avec le MÊME targetType que le repost sec', () => {
    const { result } = renderHook(() => useComposerRepost());
    act(() => {
      result.current.repost({ targetId: 'root-1', targetType: 'POST', isQuote: true, content: 'mon commentaire' });
    });

    expect(mockRepostMutate).toHaveBeenCalledWith(
      { postId: 'root-1', data: { content: 'mon commentaire', isQuote: true, targetType: 'POST' } },
      expect.anything(),
    );
  });

  it('ne pose jamais `content` sur un repost sec, même si un appelant en fournit un vide', () => {
    const { result } = renderHook(() => useComposerRepost());
    act(() => {
      result.current.repost({ targetId: 'root-1', targetType: 'STORY', isQuote: false });
    });

    const [, data] = mockRepostMutate.mock.calls[0] as [unknown, { data: Record<string, unknown> }];
    void data;
    const call = mockRepostMutate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect('content' in call.data).toBe(false);
  });

  it('relaie onSuccess/onError à `useRepostMutation`', () => {
    const { result } = renderHook(() => useComposerRepost());
    const onSuccess = jest.fn();
    const onError = jest.fn();
    act(() => {
      result.current.repost({ targetId: 'root-1', targetType: 'POST', isQuote: false }, { onSuccess, onError });
    });

    const opts = mockRepostMutate.mock.calls[0][1] as { onSuccess: () => void; onError: () => void };
    opts.onSuccess();
    opts.onError();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
