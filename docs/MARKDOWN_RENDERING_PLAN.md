# Markdown Rendering Integration Plan

## 📋 Executive Summary

Plan to integrate lightweight Markdown rendering in Meeshy to enhance message formatting capabilities. This will allow users to format messages with **bold**, *italic*, `code`, lists, links, and more using standard Markdown syntax.

---

## 🎯 Objectives

1. **Improve UX**: Allow users to format messages without a complex editor
2. **Maintain Performance**: Keep bundle size minimal (<50KB added)
3. **Security First**: Prevent XSS and code injection attacks
4. **Backward Compatible**: Existing plain text messages work as-is
5. **Mobile Friendly**: Render properly on all devices

---

## 🔧 Technical Stack Recommendation

### Chosen Library: **react-markdown**

**Why react-markdown?**
- ✅ Security: XSS protection built-in (doesn't use `dangerouslySetInnerHTML`)
- ✅ Size: ~30KB gzipped (acceptable for the features)
- ✅ Popular: 11k+ GitHub stars, well-maintained
- ✅ Extensible: Plugin system for features
- ✅ React Native: Works with React components out-of-box

**Alternative considered:**
- `marked` (15KB) - Lighter but requires manual sanitization
- `markdown-to-jsx` (10KB) - Very light but fewer features
- `micromark` (25KB) - Fast but lower-level API

### Dependencies

```json
{
  "react-markdown": "^9.0.1",
  "remark-gfm": "^4.0.0",        // GitHub Flavored Markdown
  "remark-breaks": "^4.0.0",     // Line breaks support
  "rehype-sanitize": "^6.0.0"    // Extra sanitization
}
```

**Total bundle impact**: ~35-40KB gzipped

---

## 📐 Architecture Design

### Component Structure

```
components/
├── messages/
│   ├── MessageContent.tsx          // NEW: Markdown renderer wrapper
│   ├── MessageContentPlain.tsx     // NEW: Fallback plain text
│   └── message-content.module.css  // NEW: Markdown styles
├── common/
│   └── BubbleMessage.tsx           // UPDATED: Use MessageContent
└── conversations/
    └── ConversationMessages.tsx    // UPDATED: Use MessageContent
```

### New Component: `MessageContent.tsx`

```typescript
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSanitize from 'rehype-sanitize';

interface MessageContentProps {
  content: string;
  enableMarkdown?: boolean; // Feature flag
  className?: string;
}

export function MessageContent({
  content,
  enableMarkdown = true,
  className
}: MessageContentProps) {
  // Fallback to plain text if Markdown disabled
  if (!enableMarkdown) {
    return <MessageContentPlain content={content} className={className} />;
  }

  return (
    <ReactMarkdown
      className={`message-content ${className}`}
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[rehypeSanitize]}
      components={{
        // Custom component overrides for better styling
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            {children}
          </a>
        ),
        code: ({ inline, children }) => (
          inline
            ? <code className="bg-gray-100 px-1 rounded">{children}</code>
            : <pre className="bg-gray-900 text-white p-2 rounded overflow-x-auto">
                <code>{children}</code>
              </pre>
        ),
        // Add more custom components as needed
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
```

---

## 🎨 Supported Markdown Features

### Phase 1 - Basic Formatting (MVP)
- **Bold**: `**text**` or `__text__`
- *Italic*: `*text*` or `_text_`
- `Inline code`: `` `code` ``
- [Links](url): `[text](url)`
- Line breaks: Double space + newline OR single newline with remark-breaks

### Phase 2 - Enhanced Formatting
- Lists (bullet and numbered)
- Code blocks with syntax highlighting
- Blockquotes: `> quote`
- Horizontal rules: `---`
- Strikethrough: `~~text~~` (GFM)

### Phase 3 - Advanced (Optional)
- Tables (GFM)
- Task lists: `- [ ] Todo`
- Emoji shortcodes: `:smile:`
- Math equations (KaTeX)
- Mentions: `@username`

---

## 🔗 Meeshy Tracked Links Integration

### Overview

Meeshy has a tracking link system that allows creating shortened, trackable URLs. These links must be automatically detected and rendered as clickable links in messages, regardless of whether Markdown is enabled or not.

### Link Formats to Detect

1. **Full URLs**:
   - `https://meeshy.me/l/[token]`
   - `https://meeshy.me/links/tracked/[token]`

2. **Relative paths**:
   - `/l/[token]`
   - `/links/tracked/[token]`

3. **Plain text** (no Markdown):
   - `meeshy.me/l/[token]`
   - Just the token: `[token]` (optional, if in specific context)

### Implementation Strategy

#### 1. URL Parser Utility

```typescript
// utils/link-parser.ts

export interface ParsedLink {
  type: 'tracked' | 'external' | 'internal';
  original: string;
  href: string;
  token?: string; // For tracked links
  display: string;
}

/**
 * Detect and parse Meeshy tracked links
 */
export function parseMeeshyLinks(text: string): ParsedLink[] {
  const links: ParsedLink[] = [];

  // Regex patterns for different link formats
  const patterns = [
    // Full URLs
    /https?:\/\/(?:www\.)?meeshy\.me\/l\/([a-zA-Z0-9_-]+)/g,
    /https?:\/\/(?:www\.)?meeshy\.me\/links\/tracked\/([a-zA-Z0-9_-]+)/g,

    // Relative paths
    /(?:^|\s)\/l\/([a-zA-Z0-9_-]+)/g,
    /(?:^|\s)\/links\/tracked\/([a-zA-Z0-9_-]+)/g,

    // Domain with path
    /(?:^|\s)meeshy\.me\/l\/([a-zA-Z0-9_-]+)/g,
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const token = match[1];
      const original = match[0];

      links.push({
        type: 'tracked',
        original: original.trim(),
        href: `/l/${token}`,
        token,
        display: `meeshy.me/l/${token}`
      });
    }
  });

  return links;
}

/**
 * Replace plain text links with clickable HTML
 */
export function linkify(text: string): string {
  const links = parseMeeshyLinks(text);

  let result = text;
  links.forEach(link => {
    const linkHtml = `<a href="${link.href}" class="meeshy-tracked-link" data-token="${link.token}" target="_blank" rel="noopener noreferrer">${link.display}</a>`;
    result = result.replace(link.original, linkHtml);
  });

  return result;
}
```

#### 2. Enhanced MessageContent Component

```typescript
// components/messages/MessageContent.tsx

import ReactMarkdown from 'react-markdown';
import { parseMeeshyLinks, type ParsedLink } from '@/utils/link-parser';
import { TrackingLinkPreview } from './TrackingLinkPreview';

interface MessageContentProps {
  content: string;
  enableMarkdown?: boolean;
  autoLinkify?: boolean; // Auto-detect tracked links
  showLinkPreviews?: boolean; // Show rich previews
  className?: string;
}

export function MessageContent({
  content,
  enableMarkdown = true,
  autoLinkify = true,
  showLinkPreviews = true,
  className
}: MessageContentProps) {
  // Pre-process content to detect tracked links
  const trackedLinks = autoLinkify ? parseMeeshyLinks(content) : [];

  // If not using Markdown, apply linkification manually
  if (!enableMarkdown) {
    return (
      <div className={className}>
        <div
          dangerouslySetInnerHTML={{ __html: linkify(content) }}
          className="whitespace-pre-wrap"
        />
        {showLinkPreviews && trackedLinks.length > 0 && (
          <div className="mt-2 space-y-2">
            {trackedLinks.map(link => (
              <TrackingLinkPreview
                key={link.token}
                token={link.token!}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // With Markdown: customize link rendering
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ href, children }) => {
            // Check if it's a tracked link
            const trackedLink = trackedLinks.find(l =>
              href?.includes(l.token!)
            );

            if (trackedLink) {
              return (
                <a
                  href={trackedLink.href}
                  className="meeshy-tracked-link text-blue-600 hover:underline font-medium"
                  data-token={trackedLink.token}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Tracked link: ${trackedLink.token}`}
                >
                  {children}
                </a>
              );
            }

            // Regular external link
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                {children}
              </a>
            );
          },
          // ... other components
        }}
      >
        {content}
      </ReactMarkdown>

      {/* Show rich previews below message */}
      {showLinkPreviews && trackedLinks.length > 0 && (
        <div className="mt-2 space-y-2">
          {trackedLinks.map(link => (
            <TrackingLinkPreview
              key={link.token}
              token={link.token!}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

#### 3. Rich Link Preview Component

```typescript
// components/messages/TrackingLinkPreview.tsx

interface TrackingLinkPreviewProps {
  token: string;
}

export function TrackingLinkPreview({ token }: TrackingLinkPreviewProps) {
  const { data, isLoading } = useTrackingLink(token);

  if (isLoading || !data) return null;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
      <div className="flex items-start gap-3">
        {/* Icon or favicon */}
        <div className="flex-shrink-0">
          <LinkIcon className="h-5 w-5 text-gray-500" />
        </div>

        {/* Link details */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">
            {data.title || data.originalUrl}
          </div>
          <div className="text-xs text-gray-500 truncate">
            {data.originalUrl}
          </div>

          {/* Stats (optional) */}
          {data.clickCount > 0 && (
            <div className="text-xs text-gray-400 mt-1">
              {data.clickCount} clicks
            </div>
          )}
        </div>

        {/* Click button */}
        <a
          href={`/l/${token}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 text-blue-600 hover:text-blue-700"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
```

### Auto-Detection Examples

#### Example 1: Plain Text with Tracked Link

**Input**:
```
Check out this resource: https://meeshy.me/l/abc123
```

**Rendered Output**:
```
Check out this resource: [meeshy.me/l/abc123]
                          ↑ clickable link
```

#### Example 2: Markdown with Multiple Links

**Input**:
```markdown
Resources:
- [Official Docs](https://meeshy.me/l/docs)
- Direct link: /l/tutorial
- Another link: meeshy.me/l/guide
```

**Rendered Output**:
- All three links are clickable
- Each shows a rich preview card below
- Tracking is enabled for analytics

#### Example 3: Mixed Content

**Input**:
```markdown
**Important**: Visit https://meeshy.me/l/important for details.

Also check /l/backup as a backup option.
```

**Rendered Output**:
- Bold text rendered properly
- Both tracked links clickable
- Two preview cards shown below

### Link Click Tracking

```typescript
// hooks/use-link-click-tracking.ts

export function useLinkClickTracking() {
  useEffect(() => {
    // Track clicks on Meeshy tracked links
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      if (target.tagName === 'A' && target.classList.contains('meeshy-tracked-link')) {
        const token = target.dataset.token;

        // Analytics event
        trackEvent('tracked_link_clicked', {
          token,
          source: 'message',
          timestamp: Date.now()
        });
      }
    };

    document.addEventListener('click', handleLinkClick);
    return () => document.removeEventListener('click', handleLinkClick);
  }, []);
}
```

### CSS Styling

```css
/* components/messages/message-content.module.css */

.meeshy-tracked-link {
  @apply text-blue-600 dark:text-blue-400;
  @apply hover:underline;
  @apply font-medium;
  @apply cursor-pointer;
  @apply transition-colors;
  position: relative;
}

.meeshy-tracked-link::before {
  content: '🔗';
  margin-right: 4px;
  font-size: 0.875em;
  opacity: 0.6;
}

.meeshy-tracked-link:hover::before {
  opacity: 1;
}

/* Link preview cards */
.tracking-link-preview {
  @apply border border-gray-200 dark:border-gray-700;
  @apply rounded-lg p-3;
  @apply bg-gray-50 dark:bg-gray-900;
  @apply hover:bg-gray-100 dark:hover:bg-gray-800;
  @apply transition-colors duration-200;
  @apply cursor-pointer;
}
```

### Backend Support (Optional Enhancement)

```typescript
// gateway/src/routes/tracking-links.ts

/**
 * Get tracking link metadata for preview
 */
fastify.get('/api/links/:token/metadata', async (request, reply) => {
  const { token } = request.params;

  const link = await prisma.trackingLink.findUnique({
    where: { token },
    select: {
      id: true,
      token: true,
      originalUrl: true,
      title: true,
      description: true,
      clickCount: true,
      createdAt: true
    }
  });

  if (!link) {
    return reply.status(404).send({ error: 'Link not found' });
  }

  return reply.send({
    success: true,
    data: link
  });
});
```

### Testing Strategy

```typescript
// __tests__/link-parser.test.ts

describe('parseMeeshyLinks', () => {
  it('detects full URL tracked links', () => {
    const text = 'Check https://meeshy.me/l/abc123';
    const links = parseMeeshyLinks(text);

    expect(links).toHaveLength(1);
    expect(links[0].type).toBe('tracked');
    expect(links[0].token).toBe('abc123');
  });

  it('detects relative path tracked links', () => {
    const text = 'Go to /l/xyz789';
    const links = parseMeeshyLinks(text);

    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('/l/xyz789');
  });

  it('handles multiple tracked links', () => {
    const text = 'Links: /l/link1 and https://meeshy.me/l/link2';
    const links = parseMeeshyLinks(text);

    expect(links).toHaveLength(2);
  });

  it('ignores non-tracked links', () => {
    const text = 'Visit https://google.com';
    const links = parseMeeshyLinks(text);

    expect(links).toHaveLength(0);
  });
});
```

### Performance Considerations

1. **Regex Optimization**: Pre-compile regex patterns
2. **Caching**: Cache parsed links per message ID
3. **Lazy Loading**: Load link previews only when scrolled into view
4. **Debouncing**: Batch multiple link metadata requests

### User Experience

1. **Visual Feedback**: Different icon/color for tracked links
2. **Hover Preview**: Show link destination on hover
3. **Copy Link**: Right-click context menu to copy original URL
4. **Analytics**: Show click count to message author only

---

## 🔒 Security Considerations

### XSS Prevention

1. **react-markdown** doesn't use `dangerouslySetInnerHTML`
2. **rehype-sanitize** removes dangerous HTML/scripts
3. **No arbitrary HTML**: Only Markdown syntax allowed
4. **Link protection**: All links use `rel="noopener noreferrer"`
5. **Content-Security-Policy**: Update CSP headers if needed

### URL Validation

```typescript
// Validate URLs before rendering
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:'];

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}
```

### Rate Limiting

- Backend: Limit message size (already exists: 2000 chars for users, 4000 for mods)
- Frontend: Detect extremely nested Markdown to prevent render bombs

---

## 📊 Performance Optimization

### Code Splitting

```typescript
// Lazy load Markdown renderer for better initial load
const MessageContent = dynamic(
  () => import('@/components/messages/MessageContent'),
  { loading: () => <MessageContentPlain content={content} /> }
);
```

### Caching

```typescript
// Cache parsed Markdown AST for repeated renders
const markdownCache = new Map<string, VNode>();

function getCachedMarkdown(content: string) {
  if (markdownCache.has(content)) {
    return markdownCache.get(content);
  }

  const parsed = parseMarkdown(content);
  markdownCache.set(content, parsed);
  return parsed;
}
```

### Virtualization

- Already implemented with `useConversationMessages` pagination
- Markdown rendering only happens for visible messages

---

## 🎛️ Feature Flags

### Environment Variables

```bash
# .env.local
NEXT_PUBLIC_ENABLE_MARKDOWN=true
NEXT_PUBLIC_MARKDOWN_MAX_LENGTH=10000
NEXT_PUBLIC_ENABLE_CODE_HIGHLIGHTING=false
```

### User Preferences

```typescript
interface UserPreferences {
  // Existing preferences...
  renderMarkdown: boolean; // Default: true
  markdownPreviewMode: 'auto' | 'manual'; // Auto-render or show raw
}
```

### Admin Controls

```typescript
// Admin can enable/disable features per conversation type
interface ConversationSettings {
  allowMarkdown: boolean;
  allowCodeBlocks: boolean;
  allowExternalLinks: boolean;
}
```

---

## 🗺️ Implementation Roadmap

### Phase 1: Foundation (1-2 days)
- [ ] Install dependencies: `react-markdown`, `remark-gfm`, `rehype-sanitize`
- [ ] Create `MessageContent.tsx` component
- [ ] Create `MessageContentPlain.tsx` fallback
- [ ] Add basic CSS styles for Markdown elements
- [ ] Write unit tests for XSS prevention
- [ ] Update `BubbleMessage` to use `MessageContent`

### Phase 2: Integration (1 day)
- [ ] Replace plain text rendering in all message components
- [ ] Add feature flag checks
- [ ] Test on mobile devices
- [ ] Update documentation (user guide)
- [ ] Add Markdown syntax help modal (optional)

### Phase 3: Styling (1 day)
- [ ] Create dark mode styles for Markdown
- [ ] Ensure consistent spacing with message bubbles
- [ ] Test with long messages and edge cases
- [ ] Add loading states for lazy-loaded components

### Phase 4: Testing & Optimization (1-2 days)
- [ ] Write E2E tests (Playwright)
- [ ] Performance testing (bundle size, render time)
- [ ] Security audit (XSS attempts)
- [ ] Accessibility testing (screen readers)
- [ ] Cross-browser testing

### Phase 5: Rollout (1 day)
- [ ] Enable feature flag for beta users
- [ ] Monitor performance metrics
- [ ] Gather user feedback
- [ ] Full rollout if no issues

**Total Estimated Time**: 5-7 days

---

## 🧪 Testing Strategy

### Unit Tests

```typescript
// MessageContent.test.tsx
describe('MessageContent', () => {
  it('renders bold text correctly', () => {
    render(<MessageContent content="**bold**" />);
    expect(screen.getByText('bold')).toHaveStyle({ fontWeight: 'bold' });
  });

  it('sanitizes XSS attempts', () => {
    render(<MessageContent content="<script>alert('xss')</script>" />);
    expect(screen.queryByText('alert')).not.toBeInTheDocument();
  });

  it('prevents javascript: URLs', () => {
    render(<MessageContent content="[Click](javascript:alert('xss'))" />);
    const link = screen.queryByRole('link');
    expect(link).toBeNull();
  });
});
```

### E2E Tests

```typescript
// markdown-rendering.spec.ts
test('user can format message with markdown', async ({ page }) => {
  await page.goto('/conversations/test');

  // Type message with Markdown
  await page.fill('[data-testid="message-input"]', '**Hello** world!');
  await page.click('[data-testid="send-button"]');

  // Verify rendered output
  const message = page.locator('.message-content').last();
  await expect(message.locator('strong')).toHaveText('Hello');
});
```

---

## 📱 Mobile Considerations

### Touch Interactions

- Links should be easy to tap (minimum 44x44px touch target)
- Code blocks should be scrollable horizontally
- Lists should have adequate spacing

### Performance

- Lazy load Markdown renderer on scroll
- Limit nested Markdown depth (max 5 levels)
- Disable animations for complex Markdown on low-end devices

---

## 🌍 Internationalization (i18n)

### Localized Help Text

```json
// locales/en/markdown.json
{
  "help": {
    "title": "Message Formatting",
    "bold": "**Bold text**",
    "italic": "*Italic text*",
    "code": "`Code`",
    "link": "[Link text](url)"
  }
}
```

### RTL Support

- Ensure Markdown rendering respects RTL languages (Arabic, Hebrew)
- Test bullet points and indentation in RTL mode

---

## 💾 Database Considerations

### No Schema Changes Required

- Messages stored as plain text (Markdown source)
- Rendering happens client-side
- Translation system works on plain text (pre-Markdown)

### Migration

- Existing messages: No migration needed (render as plain text)
- New messages: Stored with Markdown syntax

---

## 🔍 Monitoring & Analytics

### Metrics to Track

1. **Performance**:
   - Markdown render time (p50, p95, p99)
   - Bundle size impact
   - Initial page load time

2. **Usage**:
   - % of messages using Markdown
   - Most used Markdown features
   - User preference opt-out rate

3. **Errors**:
   - XSS attempts blocked
   - Invalid Markdown syntax
   - Rendering errors

### Logging

```typescript
// Log Markdown rendering errors
try {
  renderMarkdown(content);
} catch (error) {
  logger.error('Markdown render error', {
    messageId,
    contentLength: content.length,
    error: error.message
  });
  // Fallback to plain text
}
```

---

## 🎓 User Education

### In-App Help

- Add "?" icon next to message composer
- Show Markdown syntax cheatsheet modal
- Live preview mode (optional)

### Documentation

- Update user guide with Markdown examples
- Create video tutorial (optional)
- Add FAQ section

---

## 🚀 Future Enhancements

### Phase 4+ (Future)

1. **Syntax Highlighting**: Add `highlight.js` for code blocks
2. **Emoji Support**: Integrate `:emoji:` shortcodes
3. **Mentions**: Auto-complete `@username`
4. **Custom Components**: Embed polls, videos, etc.
5. **LaTeX Math**: Render equations with KaTeX
6. **Mermaid Diagrams**: Render flowcharts and diagrams
7. **WYSIWYG Editor**: Rich text editor with toolbar (like Notion)

---

## 📚 References

- [react-markdown Documentation](https://github.com/remarkjs/react-markdown)
- [CommonMark Spec](https://commonmark.org/)
- [GitHub Flavored Markdown](https://github.github.com/gfm/)
- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)

---

## ✅ Success Criteria

- ✅ Bundle size increase < 50KB
- ✅ Zero XSS vulnerabilities
- ✅ <100ms average render time for typical messages
- ✅ 95%+ user satisfaction (survey)
- ✅ Works on all supported browsers
- ✅ Fully accessible (WCAG 2.1 AA)

---

**Document Version**: 1.0
**Last Updated**: 2025-10-31
**Author**: Development Team
**Status**: 📋 Planning Phase
