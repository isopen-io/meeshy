# OpenAPI Documentation for Attachments Routes

This document summarizes the OpenAPI/Swagger documentation added to `/services/gateway/src/routes/attachments.ts`.

## Overview

All attachment routes now have comprehensive OpenAPI documentation including:
- Detailed descriptions
- Request/response schemas
- Parameter validation
- Error responses
- Tags for organization

## Routes Documented

### 1. POST /attachments/upload
**Summary:** Upload file attachments

**Description:** Upload one or multiple files with support for both authenticated and anonymous users. Files are processed with metadata extraction (dimensions for images, duration for audio/video). Anonymous users must have file/image upload permissions on their share link.

**Content-Type:** `multipart/form-data`

**Request Body:**
- `file`: Binary file(s) to upload
- `metadata_0`, `metadata_1`, etc.: Optional JSON metadata for each file

**Responses:**
- 200: Files uploaded successfully (returns array of `messageAttachmentSchema`)
- 400: No files provided
- 401: Authentication required
- 403: Anonymous users without upload permissions
- 500: Internal server error

---

### 2. POST /attachments/upload-text
**Summary:** Create text file attachment

**Description:** Create a text file attachment from provided content. Useful for BubbleStream and text-based messaging. The content is stored as a .txt file and treated as a standard attachment.

**Request Body:**
```json
{
  "content": "string (required)",
  "messageId": "string (optional)"
}
```

**Responses:**
- 200: Text attachment created successfully (returns `messageAttachmentSchema`)
- 401: Authentication required
- 500: Internal server error

---

### 3. GET /attachments/:attachmentId
**Summary:** Get attachment file

**Description:** Stream the original file by attachment ID. Returns the file with appropriate content-type headers for inline display. Supports cross-origin requests with CORS headers. Files are cached for 1 year (immutable).

**Parameters:**
- `attachmentId` (path, required): Unique attachment identifier

**Responses:**
- 200: File stream (binary)
- 404: Attachment not found
- 500: Internal server error

---

### 4. GET /attachments/:attachmentId/thumbnail
**Summary:** Get attachment thumbnail

**Description:** Stream the thumbnail image for an attachment. Only available for image attachments. Thumbnails are JPEG format, optimized for fast loading in lists and previews. Supports CORS and aggressive caching.

**Parameters:**
- `attachmentId` (path, required): Unique attachment identifier

**Responses:**
- 200: Thumbnail stream (image/jpeg)
- 404: Thumbnail not found (attachment may not be an image)
- 500: Internal server error

---

### 5. GET /attachments/file/*
**Summary:** Get file by path

**Description:** Stream a file by its file path. Supports Range requests for audio/video seeking. Determines MIME type from file extension. Allows iframe embedding for PDFs and other documents. CORS-enabled for cross-origin access.

**Parameters:**
- `*` (path): Relative file path from uploads directory

**Responses:**
- 200: File stream (binary)
- 206: Partial content (Range request for media files)
- 404: File not found
- 500: Internal server error

---

### 6. DELETE /attachments/:attachmentId
**Summary:** Delete attachment

**Description:** Delete an attachment and its associated files (original and thumbnail). Authorization rules: attachment owner can delete their own files, admins/moderators can delete any attachment, anonymous users can only delete their own attachments. This permanently removes the file from storage.

**Parameters:**
- `attachmentId` (path, required): Unique attachment identifier

**Responses:**
- 200: Attachment deleted successfully
- 401: Authentication required
- 403: Insufficient permissions
- 404: Attachment not found
- 500: Internal server error

---

### 7. GET /conversations/:conversationId/attachments
**Summary:** List conversation attachments

**Description:** Get all attachments from a conversation with optional filtering by type. Supports pagination. Authenticated users must be members of the conversation. Anonymous users must have view history permission on their share link.

**Parameters:**
- `conversationId` (path, required): Conversation unique identifier

**Query Parameters:**
- `type` (optional): Filter by attachment type (image, document, audio, video, text)
- `limit` (optional, default: 50, max: 100): Maximum number of attachments
- `offset` (optional, default: 0): Pagination offset

**Responses:**
- 200: Attachments retrieved successfully (returns array of `messageAttachmentMinimalSchema`)
- 401: Authentication required
- 403: Access denied to conversation
- 500: Internal server error

---

### 8. POST /attachments/:attachmentId/translate
**Summary:** Translate attachment

**Description:** Translate an attachment to one or more target languages. Currently supports audio files with speech-to-text, translation, and text-to-speech (with optional voice cloning). Image, video, and document translation are planned but not yet implemented. Translation can be async with webhook notification.

**Parameters:**
- `attachmentId` (path, required): Unique attachment identifier

**Request Body:**
```json
{
  "targetLanguages": ["en", "es", "fr"],  // required, array of ISO 639-1 codes
  "sourceLanguage": "fr",                 // optional, auto-detected if omitted
  "generateVoiceClone": false,            // optional, default: false
  "async": false,                         // optional, default: false
  "webhookUrl": "https://...",            // optional, for async notifications
  "priority": 5                           // optional, 1-10, default: 5
}
```

**Responses:**
- 200: Translation completed or queued successfully
- 400: Invalid parameters
- 401: Authentication required
- 403: Access denied - user does not own attachment
- 404: Attachment not found
- 501: Attachment type not supported for translation
- 503: Translation service not available
- 500: Internal server error

---

## Schemas Used

All routes use shared schemas from `@meeshy/shared/types/api-schemas`:

- **messageAttachmentSchema**: Full attachment object with all fields
- **messageAttachmentMinimalSchema**: Minimal attachment data for lists
- **errorResponseSchema**: Standard error response format

## Tags

All routes are tagged with:
- `attachments`: Primary tag for all attachment operations
- `conversations`: Additional tag for conversation-scoped endpoints
- `translation`: Additional tag for translation endpoints

## Authentication

Routes use two authentication middlewares:
- `authOptional`: Supports both authenticated and anonymous users
- `authRequired`: Requires authenticated users only

## Features

1. **Multipart/Form-Data Support**: File upload endpoints properly documented with binary format
2. **Range Requests**: Media file endpoints support partial content for seeking
3. **CORS Headers**: All file serving endpoints include cross-origin headers
4. **Caching**: Static files cached with 1-year max-age
5. **Error Handling**: Comprehensive error responses with appropriate status codes
6. **Pagination**: List endpoints support offset/limit pagination
7. **Filtering**: Type-based filtering for attachment lists
8. **Authorization**: Fine-grained permission checks documented

## TypeScript Notes

The TypeScript compiler may show warnings about `description` and other OpenAPI fields not being recognized in `FastifySchema`. This is expected and harmless - these fields are valid OpenAPI properties that will be correctly processed by Fastify's Swagger plugin at runtime.

This is consistent with how other routes in the project (e.g., `admin.ts`) handle OpenAPI documentation.

## Next Steps

To view the generated OpenAPI documentation:

1. Start the gateway service
2. Navigate to `/documentation` endpoint (if Swagger UI is enabled)
3. All attachment routes will be organized under the "attachments" tag

## Implementation Date

- **Author**: Claude (AI Assistant)
- **Date**: 2026-01-11
- **File**: `/services/gateway/src/routes/attachments.ts`
