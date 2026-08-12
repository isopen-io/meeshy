# Hashtags Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render mentions/links/hashtags as styled, clickable text in post and reel captions on web (currently plain, unstyled `<p>` everywhere), and add a hashtag results page.

**Architecture:** New `PostContentText` component (regex-segment parser + React render, lighter than the full `MarkdownMessage` used for conversation messages) wired into the 3 real caption-rendering sites found during spec validation (`PostCard.tsx`, `PostDetail.tsx`, `ReelPlayer.tsx`), reusing `TranslationToggle`'s existing `showContent={false}` escape hatch (already used by `StoryViewer.tsx`) rather than modifying it. New `postsService.getPostsByHashtag`/`getTrendingHashtags` + `/hashtag/[tag]` route mirroring the existing `/u/[id]` page.

**Tech Stack:** Next.js 15 App Router, React, TypeScript, Jest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-03-post-hashtags-and-rich-content-design.md`

## Global Constraints

- `PostContentText` handles mentions + URLs + hashtags only — no bold/italic/lists (spec §5, deliberately lighter than `MarkdownMessage.tsx`).
- Hashtag/mention regex mirrors the gateway's `HashtagService`/`mention-parser.ts` character classes exactly (spec Risques — 3-way SSOT duplication, documented not eliminated).
- `TranslationToggle.tsx` is NOT modified — `showContent={false}` already exists and is already used by `StoryViewer.tsx:984` for exactly this purpose.
- Reuses `apps/web/lib/utils/link-parser.ts`'s URL-detection regex approach (not its full `parseMessageLinks` function, which is message/tracking-link-specific) for the URL segment of `PostContentText`.

---

### Task 1: `postsService.getPostsByHashtag` + `getTrendingHashtags`

**Files:**
- Modify: `apps/web/services/posts.service.ts`
- Test: `apps/web/__tests__/services/posts.service.hashtag.test.ts` (new)

**Interfaces:**
- Consumes: gateway `GET /posts/hashtag/:tag`, `GET /hashtags/trending` (gateway plan Task 6)
- Produces: `postsService.getPostsByHashtag(tag: string, filters?: {cursor?: string; limit?: number}): Promise<CursorPaginatedResponse<Post>>`, `postsService.getTrendingHashtags(limit?: number): Promise<{tag: string; usageCount: number}[]>`

- [ ] **Step 1: Write the failing tests**

Read `apps/web/__tests__/services/posts.service.test.ts` first (the existing test file for this exact service) to copy its real `apiService` mock setup — the sketch below uses the same shape already established there (`jest.mock('@/services/api.service')` or equivalent; do not invent a different mocking approach for the same module).

```typescript
// apps/web/__tests__/services/posts.service.hashtag.test.ts
import { postsService } from '@/services/posts.service';
import { apiService } from '@/services/api.service';

jest.mock('@/services/api.service');

describe('postsService.getPostsByHashtag', () => {
  it('calls GET /posts/hashtag/:tag with cursor and limit', async () => {
    (apiService.get as jest.Mock).mockResolvedValue({
      data: { success: true, data: [], meta: { pagination: { total: 0, offset: 0, limit: 20, hasMore: false }, nextCursor: null } },
    });

    await postsService.getPostsByHashtag('paris', { cursor: '20', limit: 20 });

    expect(apiService.get).toHaveBeenCalledWith('/posts/hashtag/paris?cursor=20&limit=20');
  });

  it('omits query string entirely when no filters given', async () => {
    (apiService.get as jest.Mock).mockResolvedValue({
      data: { success: true, data: [], meta: { pagination: { total: 0, offset: 0, limit: 20, hasMore: false }, nextCursor: null } },
    });

    await postsService.getPostsByHashtag('paris');

    expect(apiService.get).toHaveBeenCalledWith('/posts/hashtag/paris');
  });
});

describe('postsService.getTrendingHashtags', () => {
  it('calls GET /hashtags/trending with the given limit', async () => {
    (apiService.get as jest.Mock).mockResolvedValue({
      data: { success: true, data: [{ tag: 'paris', usageCount: 42 }] },
    });

    const result = await postsService.getTrendingHashtags(10);

    expect(apiService.get).toHaveBeenCalledWith('/hashtags/trending?limit=10');
    expect(result).toEqual([{ tag: 'paris', usageCount: 42 }]);
  });

  it('defaults to limit 20', async () => {
    (apiService.get as jest.Mock).mockResolvedValue({ data: { success: true, data: [] } });
    await postsService.getTrendingHashtags();
    expect(apiService.get).toHaveBeenCalledWith('/hashtags/trending?limit=20');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx jest __tests__/services/posts.service.hashtag.test.ts`
Expected: FAIL — `postsService.getPostsByHashtag is not a function`

- [ ] **Step 3: Implement**

Add to `apps/web/services/posts.service.ts`, inside the `postsService` object (near `getFeed`, `:146`):

```typescript
  async getPostsByHashtag(tag: string, filters: { cursor?: string; limit?: number } = {}): Promise<CursorPaginatedResponse<Post>> {
    const params = new URLSearchParams();
    if (filters.cursor) params.set('cursor', filters.cursor);
    if (filters.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    const response = await apiService.get<CursorPaginatedResponse<Post>>(`/posts/hashtag/${tag}${qs ? `?${qs}` : ''}`);
    return unwrap(response);
  },

  async getTrendingHashtags(limit: number = 20): Promise<{ tag: string; usageCount: number }[]> {
    const response = await apiService.get<{ success: boolean; data: { tag: string; usageCount: number }[] }>(`/hashtags/trending?limit=${limit}`);
    return unwrap(response);
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx jest __tests__/services/posts.service.hashtag.test.ts`
Expected: PASS — 4/4

- [ ] **Step 5: Commit**

```bash
git add apps/web/services/posts.service.ts apps/web/__tests__/services/posts.service.hashtag.test.ts
git commit -m "feat(web/hashtags): postsService.getPostsByHashtag + getTrendingHashtags"
```

---

### Task 2: `PostContentText` component

**Files:**
- Create: `apps/web/components/v2/PostContentText.tsx`
- Test: `apps/web/__tests__/components/v2/PostContentText.test.tsx`

**Interfaces:**
- Consumes: nothing (pure component)
- Produces: `<PostContentText content={string} className?={string} />` — renders `content` with `@mention`/`#hashtag`/URL segments as colored `<Link>`/`<a>` elements, everything else as plain text, preserving line breaks.

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/__tests__/components/v2/PostContentText.test.tsx
import { render, screen } from '@testing-library/react';
import { PostContentText } from '@/components/v2/PostContentText';

describe('PostContentText', () => {
  it('renders a hashtag as a link to /hashtag/:tag', () => {
    render(<PostContentText content="Belle journée #paris aujourd'hui" />);
    const link = screen.getByRole('link', { name: '#paris' });
    expect(link).toHaveAttribute('href', '/hashtag/paris');
  });

  it('renders a mention as a link to /u/:username', () => {
    render(<PostContentText content="Salut @alice !" />);
    const link = screen.getByRole('link', { name: '@alice' });
    expect(link).toHaveAttribute('href', '/u/alice');
  });

  it('renders a bare URL as a clickable external link', () => {
    render(<PostContentText content="Voir https://example.com/page" />);
    const link = screen.getByRole('link', { name: 'https://example.com/page' });
    expect(link).toHaveAttribute('href', 'https://example.com/page');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('leaves plain text as plain text — no link for a hash inside a word', () => {
    render(<PostContentText content="C#paris n'est pas un hashtag" />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('does not treat a URL fragment as a hashtag', () => {
    render(<PostContentText content="Voir https://exemple.com/#section" />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent('https://exemple.com/#section');
  });

  it('renders mixed content with mention, hashtag, and URL together, in order', () => {
    render(<PostContentText content="@alice a partagé #paris via https://example.com" />);
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['@alice', '#paris', 'https://example.com']);
  });

  it('preserves line breaks', () => {
    const { container } = render(<PostContentText content={"Ligne 1\nLigne 2"} />);
    expect(container.textContent).toContain('Ligne 1');
    expect(container.textContent).toContain('Ligne 2');
    expect(container.querySelector('.whitespace-pre-wrap')).not.toBeNull();
  });

  it('renders plain content with no special segments as-is', () => {
    render(<PostContentText content="Rien de spécial ici" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Rien de spécial ici')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx jest __tests__/components/v2/PostContentText.test.tsx`
Expected: FAIL — `Cannot find module '@/components/v2/PostContentText'`

- [ ] **Step 3: Implement**

```tsx
// apps/web/components/v2/PostContentText.tsx
'use client';

import Link from 'next/link';
import { Fragment } from 'react';

/**
 * Rendu riche d'une caption de post/reel : mentions, hashtags, URLs colorés
 * et cliquables. Délibérément plus léger qu'un rendu markdown complet
 * (`MarkdownMessage.tsx`, réservé aux messages de conversation) — pas de
 * gras/italique/listes, juste ce que porte une caption de post.
 *
 * Design : docs/superpowers/specs/2026-08-03-post-hashtags-and-rich-content-design.md §5
 */

type Segment =
  | { type: 'text'; content: string }
  | { type: 'mention'; content: string; username: string }
  | { type: 'hashtag'; content: string; tag: string }
  | { type: 'url'; content: string };

// Même classe de caractères que le service gateway (HashtagService.ts) et
// MessageTextRenderer.swift — SSOT dupliquée consciemment (3 plateformes).
const MENTION_REGEX = /(?<![\p{L}\p{N}_])@([\p{L}\p{N}_-]{1,30})/gu;
const HASHTAG_REGEX = /(?<![\p{L}\p{N}_/])#([\p{L}\p{N}_]{1,50})/gu;
const URL_REGEX = /(?<![@\w])https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+/g;

function parseSegments(content: string): Segment[] {
  type RawMatch = { start: number; end: number; segment: Segment };
  const matches: RawMatch[] = [];

  for (const m of content.matchAll(MENTION_REGEX)) {
    matches.push({ start: m.index!, end: m.index! + m[0].length, segment: { type: 'mention', content: m[0], username: m[1] } });
  }
  for (const m of content.matchAll(HASHTAG_REGEX)) {
    matches.push({ start: m.index!, end: m.index! + m[0].length, segment: { type: 'hashtag', content: m[0], tag: m[1].toLowerCase() } });
  }
  for (const m of content.matchAll(URL_REGEX)) {
    matches.push({ start: m.index!, end: m.index! + m[0].length, segment: { type: 'url', content: m[0] } });
  }

  // Trie par position ; en cas de chevauchement (ne devrait pas arriver, les
  // 3 classes de caractères sont disjointes — # et @ ne peuvent pas faire
  // partie d'une URL matchée par URL_REGEX puisqu'elle s'arrête avant tout
  // espace, mais un hashtag PEUT apparaître après une URL dans le même
  // texte), le premier par position d'ouverture gagne.
  matches.sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start < cursor) continue; // chevauchement — ignoré, déjà couvert
    if (m.start > cursor) {
      segments.push({ type: 'text', content: content.slice(cursor, m.start) });
    }
    segments.push(m.segment);
    cursor = m.end;
  }
  if (cursor < content.length) {
    segments.push({ type: 'text', content: content.slice(cursor) });
  }
  return segments;
}

export function PostContentText({ content, className }: { content: string; className?: string }) {
  const segments = parseSegments(content);
  return (
    <p className={`whitespace-pre-wrap ${className ?? ''}`}>
      {segments.map((segment, i) => {
        switch (segment.type) {
          case 'mention':
            return (
              <Link key={i} href={`/u/${segment.username}`} className="text-[var(--gp-terracotta)] font-semibold hover:underline">
                {segment.content}
              </Link>
            );
          case 'hashtag':
            return (
              <Link key={i} href={`/hashtag/${segment.tag}`} className="text-[var(--gp-terracotta)] font-semibold hover:underline">
                {segment.content}
              </Link>
            );
          case 'url':
            return (
              <a key={i} href={segment.content} target="_blank" rel="noopener noreferrer" className="text-[var(--gp-terracotta)] underline">
                {segment.content}
              </a>
            );
          default:
            return <Fragment key={i}>{segment.content}</Fragment>;
        }
      })}
    </p>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx jest __tests__/components/v2/PostContentText.test.tsx`
Expected: PASS — 8/8

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/v2/PostContentText.tsx apps/web/__tests__/components/v2/PostContentText.test.tsx
git commit -m "feat(web/hashtags): composant PostContentText (mentions+liens+hashtags)"
```

---

### Task 3: Wire into `PostCard.tsx` and `PostDetail.tsx`

**Files:**
- Modify: `apps/web/components/v2/PostCard.tsx:216-233`
- Modify: `apps/web/components/v2/PostDetail.tsx:179-198`
- Test: `apps/web/__tests__/components/v2/PostCard.test.tsx`, `apps/web/__tests__/components/v2/PostDetail.test.tsx` (extend existing files if present — read them first to match the existing render-helper/fixture pattern)

**Interfaces:**
- Consumes: `PostContentText` (Task 2)
- Produces: nothing new (behavioral change only)

- [ ] **Step 1: Write the failing tests**

Add to whichever existing test file already covers `PostCard`'s content rendering (read it first — `apps/web/__tests__/components/v2/PostCard.test.tsx` per the file layout established by `PostContentText.test.tsx` above; if it doesn't exist yet, create it following the same `render`/`screen` pattern as Task 2):

```tsx
it('renders hashtags in the caption as clickable links', () => {
  render(<PostCard {...basePostCardProps} content="Regarde #paris" />);
  expect(screen.getByRole('link', { name: '#paris' })).toHaveAttribute('href', '/hashtag/paris');
});
```

And equivalently for `PostDetail.tsx`:

```tsx
it('renders hashtags in the caption as clickable links', () => {
  render(<PostDetail {...basePostDetailProps} post={{ ...basePost, content: 'Regarde #paris' }} />);
  expect(screen.getByRole('link', { name: '#paris' })).toHaveAttribute('href', '/hashtag/paris');
});
```

(`basePostCardProps`/`basePostDetailProps`/`basePost` — use whatever fixture factories the existing test files for these two components already define; both components have pre-existing tests per the repo's coverage conventions, so these factories already exist. Do not redefine them.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx jest components/v2/PostCard components/v2/PostDetail`
Expected: FAIL — no link rendered, `content` still shown as plain text

- [ ] **Step 3: Implement**

In `PostCard.tsx`, add the import:
```typescript
import { PostContentText } from './PostContentText';
```

Replace the block at `:216-233`:
```tsx
        {/* Content with TranslationToggle */}
        <div className="cursor-pointer" {...clickableProps}>
          {hasTranslations ? (
            <div className="mb-3">
              <TranslationToggle
                originalContent={content}
                originalLanguage={lang}
                originalLanguageName={getLanguageName(lang)}
                translations={translations}
                userLanguage={userLanguage}
                variant="block"
                showContent={false}
              />
              <PostContentText content={content} className="text-[var(--gp-text-primary)]" />
            </div>
          ) : (
            <div className="mb-3">
              <PostContentText content={content} className="text-[var(--gp-text-primary)]" />
              {onTranslate && lang !== userLanguage && (
                <button
                  onClick={(e) => { e.stopPropagation(); onTranslate(); }}
                  className="mt-1 text-xs text-[var(--gp-terracotta)] hover:underline"
```
(keep everything after the `<button` line unchanged — only the two `<p>`/missing-`showContent` lines and the new import change).

In `PostDetail.tsx`, add the import:
```typescript
import { PostContentText } from './PostContentText';
```

Replace the block at `:179-198`:
```tsx
          {/* Content */}
          {post.content && (
            <div className="mb-4">
              {translationItems.length > 0 ? (
                <>
                  <TranslationToggle
                    originalContent={post.content}
                    originalLanguage={post.originalLanguage ?? 'unknown'}
                    originalLanguageName={post.originalLanguage ? getLanguageName(post.originalLanguage) : undefined}
                    translations={translationItems}
                    userLanguage={userLanguage}
                    variant="block"
                    showContent={false}
                  />
                  <PostContentText content={post.content} className="text-[var(--gp-text-primary)]" />
                </>
              ) : (
                <>
                  <PostContentText content={post.content} className="text-[var(--gp-text-primary)]" />
                  {onTranslate && post.originalLanguage && post.originalLanguage !== userLanguage && (
                    <button
                      onClick={onTranslate}
                      className="mt-2 text-xs text-[var(--gp-terracotta)] hover:underline"
                    >
                      Translate post
                    </button>
```
(keep everything after unchanged; `PostContentText` already applies `whitespace-pre-wrap` internally so dropping it from the wrapping `<p>` — now removed entirely — loses nothing).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx jest components/v2/PostCard components/v2/PostDetail`
Expected: PASS, including all pre-existing tests in both files (no regression)

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/v2/PostCard.tsx apps/web/components/v2/PostDetail.tsx apps/web/__tests__/components/v2/PostCard.test.tsx apps/web/__tests__/components/v2/PostDetail.test.tsx
git commit -m "feat(web/hashtags): PostCard + PostDetail rendent la caption via PostContentText"
```

---

### Task 4: Wire into `ReelPlayer.tsx`

**Files:**
- Modify: `apps/web/components/feed/ReelPlayer.tsx:328`
- Test: `apps/web/__tests__/components/feed/ReelPlayer.test.tsx` (extend if it exists, create following Task 3's pattern if not)

**Interfaces:**
- Consumes: `PostContentText` (Task 2)
- Produces: nothing new

- [ ] **Step 1: Write the failing test**

```tsx
it('renders the reel caption hashtags as clickable links', () => {
  render(<ReelPlayer {...baseReelPlayerProps} reel={{ ...baseReel, content: 'Vue de #paris' }} />);
  expect(screen.getByRole('link', { name: '#paris' })).toHaveAttribute('href', '/hashtag/paris');
});
```

(`baseReelPlayerProps`/`baseReel` — reuse the existing fixture factory from this component's current test file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx jest components/feed/ReelPlayer`
Expected: FAIL

- [ ] **Step 3: Implement**

Add the import:
```typescript
import { PostContentText } from '@/components/v2/PostContentText';
```

Replace `ReelPlayer.tsx:328`:
```tsx
{caption && <p className="mt-3 line-clamp-3 text-sm text-white/90 leading-relaxed drop-shadow-sm">{caption}</p>}
```
with:
```tsx
{caption && <PostContentText content={caption} className="mt-3 line-clamp-3 text-sm text-white/90 leading-relaxed drop-shadow-sm" />}
```

(`PostContentText` renders its own `<p>` internally — this replaces the element, not wraps it. `line-clamp-3` on a `<p>` containing `<Link>`/`<a>` children still clamps correctly, same CSS behavior as clamping any inline-content paragraph.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx jest components/feed/ReelPlayer`
Expected: PASS, no regression on existing tests in the file

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/feed/ReelPlayer.tsx apps/web/__tests__/components/feed/ReelPlayer.test.tsx
git commit -m "feat(web/hashtags): ReelPlayer rend la caption via PostContentText"
```

---

### Task 5: `/hashtag/[tag]` results page

**Files:**
- Create: `apps/web/app/hashtag/[tag]/page.tsx`
- Test: `apps/web/__tests__/app/hashtag/page.test.tsx` (new)

**Interfaces:**
- Consumes: `postsService.getPostsByHashtag` (Task 1), `PostCard` (existing, reused for each result)
- Produces: page at `/hashtag/:tag`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/__tests__/app/hashtag/page.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import HashtagPage from '@/app/hashtag/[tag]/page';
import { postsService } from '@/services/posts.service';

jest.mock('@/services/posts.service');
jest.mock('next/navigation', () => ({ useParams: () => ({ tag: 'paris' }) }));

describe('HashtagPage', () => {
  it('loads and renders posts tagged with the hashtag', async () => {
    (postsService.getPostsByHashtag as jest.Mock).mockResolvedValue({
      success: true,
      data: [{ id: 'p1', content: '#paris', author: { username: 'alice' } }],
      meta: { pagination: { total: 1, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    });

    render(<HashtagPage />);

    await waitFor(() => expect(postsService.getPostsByHashtag).toHaveBeenCalledWith('paris', {}));
    expect(await screen.findByText('#paris', { exact: false })).toBeInTheDocument();
  });

  it('shows an empty state when the hashtag has no posts', async () => {
    (postsService.getPostsByHashtag as jest.Mock).mockResolvedValue({
      success: true, data: [], meta: { pagination: { total: 0, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    });

    render(<HashtagPage />);

    expect(await screen.findByText(/aucun post/i)).toBeInTheDocument();
  });

  it('shows the hashtag as the page title', async () => {
    (postsService.getPostsByHashtag as jest.Mock).mockResolvedValue({
      success: true, data: [], meta: { pagination: { total: 0, offset: 0, limit: 20, hasMore: false }, nextCursor: null },
    });

    render(<HashtagPage />);

    expect(await screen.findByRole('heading', { name: '#paris' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx jest app/hashtag`
Expected: FAIL — `Cannot find module '@/app/hashtag/[tag]/page'`

- [ ] **Step 3: Implement**

`PostCardProps` (`PostCard.tsx:14-42`) requires `author: {name, avatar?}`, `lang`, `content`, `time`, `likes`, `comments` — everything else (`onLike`, `onComment`, etc.) is optional. `PostsFeedScreen.tsx:672-694` builds these from a raw `Post` via a **local, unexported** `formatRelativeTime(date, t)` helper (`:45`, not shared anywhere) — this page defines its own copy rather than reaching into another component's private function, matching how that duplication already exists at this one other call site (not introduced by this task).

```tsx
// apps/web/app/hashtag/[tag]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PostCard } from '@/components/v2';
import { postsService, type Post } from '@/services/posts.service';
import { useI18n, type TFunc } from '@/hooks/useI18n';

// Miroir local de PostsFeedScreen.tsx:45 (non exportée là-bas — duplication
// déjà existante à ce seul autre site, pas introduite par cette page).
function formatRelativeTime(date: string | Date, t: TFunc): string {
  const then = new Date(date).getTime();
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return t('time.now', "à l'instant");
  if (diffSec < 3600) return t('time.minutesAgo', `il y a ${Math.floor(diffSec / 60)} min`);
  if (diffSec < 86400) return t('time.hoursAgo', `il y a ${Math.floor(diffSec / 3600)} h`);
  return t('time.daysAgo', `il y a ${Math.floor(diffSec / 86400)} j`);
}

export default function HashtagPage() {
  const { tag } = useParams<{ tag: string }>();
  const { t } = useI18n();
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    postsService.getPostsByHashtag(tag, {})
      .then((response) => { if (!cancelled) setPosts(response.data); })
      .catch(() => { if (!cancelled) setPosts([]); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [tag]);

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto py-6 px-4">
        <h1 className="text-xl font-semibold mb-4">#{tag}</h1>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <span className="animate-pulse text-[var(--gp-text-secondary)]">{t('common.loading', 'Chargement...')}</span>
          </div>
        ) : posts.length === 0 ? (
          <p className="text-[var(--gp-text-secondary)] text-center py-12">
            {t('hashtag.results.empty', `Aucun post avec #${tag}`)}
          </p>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                author={{ name: post.author?.displayName ?? post.author?.username ?? t('unknownAuthor', 'Unknown'), avatar: post.author?.avatar ?? undefined }}
                lang={post.originalLanguage ?? 'unknown'}
                content={post.content ?? ''}
                time={formatRelativeTime(post.createdAt, t)}
                likes={post.likeCount}
                comments={post.commentCount}
                media={post.media}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
```

(`useI18n`'s exported `TFunc` type name — verify against `apps/web/hooks/useI18n.ts`'s real export before finalizing the import; every other symbol in this file is verified against real source read during this plan's authoring.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx jest app/hashtag`
Expected: PASS — 3/3

- [ ] **Step 5: Full verification**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errors

Run: `cd apps/web && npx jest`
Expected: no regression across the full suite

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/hashtag apps/web/__tests__/app/hashtag
git commit -m "feat(web/hashtags): page de résultats /hashtag/[tag]"
```

---

## Self-Review Notes

- **Spec coverage:** §5 fully covered — `PostContentText` (Task 2), all 4 identified sites wired (Tasks 3-4: `PostCard.tsx`, `PostDetail.tsx`, `ReelPlayer.tsx`; `TranslationToggle.tsx` itself untouched, per spec's finding that `showContent={false}` already solves it). §3 client consumption (Task 1). §6 navigation via `PostContentText`'s `Link`/`a` hrefs + Task 5's page.
- **Type consistency:** `PostContentText`'s `Segment` union used consistently in `parseSegments`/render switch (Task 2). `postsService.getPostsByHashtag` signature (`tag, filters`) matches its Task 5 call site (`postsService.getPostsByHashtag(tag, {})`).
- **Verified against real source during self-review:** Task 5's `PostCard` call was initially written as a naive `{...post}` spread — checked against the real `PostCardProps` interface (`PostCard.tsx:14-42`) and the actual call site (`PostsFeedScreen.tsx:665-694`), which showed `PostCard` needs explicit prop mapping (`author` reshaped, `content`/`time`/`likes`/`comments` required), not a spread. Corrected in place, including a local copy of `formatRelativeTime` since the existing one is unexported/private to `PostsFeedScreen.tsx`.
- **Flagged for verification during execution, not guessed:** Task 3/4's exact existing test-fixture factory names (component tests pre-exist per repo convention; read them, don't invent parallel ones). Task 5's `TFunc` type export name from `useI18n.ts`.
