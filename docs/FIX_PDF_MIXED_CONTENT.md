# Fix: PDF and Attachment Display - Mixed Content Issue

## Problem Summary

PDFs and other attachments were not displaying properly in the browser, showing the error:
```
localhost didn't send any data
ERR_EMPTY_RESPONSE
```

Despite the HTTP request returning `200 OK` with proper headers and content.

## Root Cause Analysis

### The Issue

The backend `AttachmentService` was generating **absolute URLs** with hardcoded protocol and host:

```typescript
// OLD CODE (line 248 in AttachmentService.ts)
getAttachmentUrl(filePath: string): string {
  return `${this.publicUrl}/api/attachments/file/${encodeURIComponent(filePath)}`;
}

// this.publicUrl was set to 'http://localhost:3000' in development
```

This caused multiple problems:

### 1. Mixed Content Blocking

**Scenario:**
- Frontend running on: `https://192.168.1.39:3100/`
- Backend URLs generated as: `http://localhost:3000/api/attachments/file/...`

**Problem:**
- Modern browsers block **mixed content** (HTTPS page loading HTTP resources)
- PDF iframes trying to load HTTP content from HTTPS page are blocked
- Result: Empty response, no data loaded

### 2. Cross-Origin Issues

**Scenario:**
- Frontend on: `192.168.1.39`
- Backend URL pointing to: `localhost`

**Problem:**
- Different hosts = cross-origin request
- Even with CORS headers, iframes have restrictions on cross-origin content
- Browser may refuse to display the iframe content

### 3. Proxy Bypass

**Scenario:**
- Next.js has a rewrite rule: `/api/*` → backend URL
- Absolute URLs like `http://localhost:3000/api/...` bypass this rewrite
- Relative URLs like `/api/...` use the rewrite

**Problem:**
- Absolute URLs go directly to backend, bypassing Next.js proxy
- This breaks in environments where frontend and backend are on different hosts/ports

## The Solution

### Changed to Relative URLs

```typescript
// NEW CODE (line 249-253 in AttachmentService.ts)
getAttachmentUrl(filePath: string): string {
  // Utiliser une URL relative au lieu d'une URL absolue
  // Cela permet au navigateur d'utiliser automatiquement le même protocole (HTTP/HTTPS)
  // et le même host que la page courante
  return `/api/attachments/file/${encodeURIComponent(filePath)}`;
}
```

### Why This Works

1. **Same Protocol**: Relative URLs automatically use the same protocol as the page
   - Page is HTTPS → URL becomes `https://...`
   - Page is HTTP → URL becomes `http://...`
   - No mixed content issues!

2. **Same Host/Port**: Relative URLs use the current page's host and port
   - Frontend at `192.168.1.39:3100` → URLs resolve to `https://192.168.1.39:3100/api/...`
   - Next.js rewrite then forwards to backend
   - No cross-origin issues!

3. **Proxy Friendly**: Works with Next.js rewrites
   - Next.js config (frontend/next.config.ts lines 54-61):
   ```typescript
   async rewrites() {
     return [
       {
         source: '/api/:path*',
         destination: `${process.env.NEXT_PUBLIC_BACKEND_URL || 'https://gate.meeshy.me'}/:path*`
       }
     ];
   }
   ```
   - Requests to `/api/attachments/file/...` are automatically forwarded to backend

4. **Environment Agnostic**: Works in all environments
   - ✅ Local development (localhost)
   - ✅ HTTPS development (192.168.1.39)
   - ✅ Production (meeshy.me)
   - ✅ Docker containers
   - ✅ Reverse proxies

## Impact

### What's Fixed

✅ **PDFs display correctly** in iframes across all environments
✅ **Images** load properly without mixed content warnings
✅ **Videos** play without protocol mismatches
✅ **Audio files** stream correctly
✅ **All attachments** download with correct URLs

### Affected Components

The fix automatically improves all attachment types since they all use `getAttachmentUrl()`:

- `PDFViewer.tsx` - PDF iframe display
- `VideoPlayer.tsx` - Video source URLs
- `SimpleAudioPlayer.tsx` - Audio source URLs
- `ImageLightbox.tsx` - Image source URLs
- `TextViewer.tsx` - Text file downloads
- `MarkdownViewer.tsx` - Markdown file downloads
- `PPTXViewer.tsx` - PowerPoint file URLs

### Database

✅ **No migration needed** - URLs are generated dynamically
✅ **Existing data works** - fileUrl and thumbnailUrl are regenerated on read

## Testing Checklist

### Manual Testing

- [x] Open frontend on `https://localhost` or `https://<IP>`
- [x] Upload a PDF file
- [x] Verify PDF displays in message bubble
- [x] Click "Open in fullscreen" - verify lightbox works
- [x] Download PDF - verify download works
- [x] Test images, videos, audio files
- [x] Test on mobile devices

### Environment Testing

- [x] HTTP localhost (`http://localhost:3100`)
- [x] HTTPS localhost (`https://localhost:3100`)
- [x] HTTPS LAN IP (`https://192.168.1.39:3100`)
- [x] Production environment

### Browser Testing

- [x] Chrome/Edge (Chromium)
- [x] Firefox
- [x] Safari
- [x] Mobile browsers (iOS Safari, Chrome Android)

## Technical Details

### Before (Absolute URLs)

```
Database: filePath = "2025/11/690c6dea6a74117c99321974/file.pdf"
Backend generates: fileUrl = "http://localhost:3000/api/attachments/file/2025%2F11%2F690c6dea6a74117c99321974%2Ffile.pdf"
Frontend receives: attachment.fileUrl = "http://localhost:3000/api/..."
PDF iframe src: "http://localhost:3000/api/..." ❌ BLOCKED (mixed content)
```

### After (Relative URLs)

```
Database: filePath = "2025/11/690c6dea6a74117c99321974/file.pdf"
Backend generates: fileUrl = "/api/attachments/file/2025%2F11%2F690c6dea6a74117c99321974%2Ffile.pdf"
Frontend receives: attachment.fileUrl = "/api/..."
PDF iframe src: "/api/..." → Resolves to "https://192.168.1.39:3100/api/..." ✅ WORKS
Next.js rewrite: → Forwards to backend → File served successfully
```

## Related Files

### Modified
- `gateway/src/services/AttachmentService.ts` (line 249-253)

### Dependent Components (Automatically Fixed)
- `frontend/components/pdf/PDFViewer.tsx`
- `frontend/components/video/VideoPlayer.tsx`
- `frontend/components/audio/SimpleAudioPlayer.tsx`
- `frontend/components/attachments/MessageAttachments.tsx`
- All attachment viewer components

### Configuration
- `frontend/next.config.ts` (rewrites configuration)

## Security Considerations

✅ **More secure**: Relative URLs respect the page's security context
✅ **HTTPS enforced**: If page is HTTPS, all resources use HTTPS
✅ **No protocol downgrade**: Cannot accidentally downgrade from HTTPS to HTTP
✅ **Proxy respect**: Goes through Next.js middleware and security layers

## Performance Considerations

✅ **No change**: Same number of HTTP requests
✅ **Better caching**: Same-origin requests cache better
✅ **CDN friendly**: Works with CDN edge caching
✅ **Compression**: Goes through Next.js compression middleware

## Migration Notes

### For Developers

No action required - URLs are generated dynamically. Just pull the latest code.

### For DevOps

No environment variable changes needed. The fix works automatically in all environments.

### For Users

No impact - PDFs and attachments will "just work" after deployment.

## Rollback Plan

If issues arise, revert the change to `AttachmentService.ts`:

```bash
git revert <commit-hash>
```

And set `PUBLIC_URL` environment variable to match frontend URL as a temporary workaround.

## Lessons Learned

1. **Avoid hardcoded URLs**: Use relative URLs whenever possible
2. **Consider mixed content**: Always test HTTPS environments
3. **Respect proxies**: Don't bypass Next.js rewrites with absolute URLs
4. **Test cross-environment**: Test with different protocols and hosts
5. **Document environment assumptions**: Make protocols and hosts configurable

## References

- [MDN: Mixed Content](https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content)
- [Next.js Rewrites](https://nextjs.org/docs/api-reference/next.config.js/rewrites)
- [HTTP Headers: Content-Disposition](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Disposition)
- [Chrome: Mixed Content Blocking](https://developers.google.com/web/fundamentals/security/prevent-mixed-content/what-is-mixed-content)
