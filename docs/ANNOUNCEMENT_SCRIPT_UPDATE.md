# Announcement Script - Update & Successful Publication

## Date
October 16, 2025

## Summary
Successfully updated and used the `announcement.sh` script to publish an announcement about the new image and document upload feature on Meeshy.

## Issues Fixed

### 1. **Incorrect API Endpoint**
- **Problem**: The script was using `/api/messages` which returned a 404 error
- **Solution**: Updated to use `/api/conversations/:id/messages` which is the correct endpoint for sending messages to a conversation
- **Code Change**: Changed from `/api/messages` to `/api/conversations/${CONVERSATION_ID}/messages`

### 2. **Incorrect Payload Fields**
- **Problem**: Initially used `/api/translate` fields which are not the standard conversation message fields
- **Solution**: Updated to use the correct conversation messages API fields
- **Code Change**: Changed payload from `{conversation_id, text, source_language}` to `{content, originalLanguage, messageType}`

### 3. **JSON Encoding Issues**
- **Problem**: Multi-line messages and special characters (emojis) could break JSON formatting
- **Solution**: Used `jq -Rs .` to properly escape the message content for JSON
- **Code Change**: Added `MESSAGE_ESCAPED=$(echo "$MESSAGE" | jq -Rs .)`

## Updated Script Behavior

The script now properly:
1. Authenticates with the Gateway API using username and password
2. Reads the message from a file or command line
3. Properly escapes the message for JSON (handles multi-line text, emojis, special characters)
4. Sends the message to `/api/translate` endpoint with required fields:
   - `conversation_id`: The conversation identifier (default: "meeshy")
   - `text`: The message content (properly escaped)
   - `source_language`: The source language code
   - `target_language`: The target language code
5. Creates a backup of the message file with timestamp
6. Provides verbose output for debugging

## Published Announcement

**Content** (English):
```
🎉 New Feature Available!

You can now send images and documents directly in your Meeshy conversations!

✨ Features:
- Support for images (JPG, PNG, GIF, WebP)
- Support for documents (PDF, DOC, TXT, etc.)
- Real-time image preview
- Interactive image gallery  
- Secure file download

To send a file, simply click on the attachment icon in the message box and select your files!

Enjoy this new way to communicate!
```

**Published to**: Conversation "meeshy" on https://gate.meeshy.me
**User**: meeshy
**Language**: English (en)
**Message ID**: 68f18661d7a5623f27726156
**Status**: ✅ Successfully published

## Usage Examples

### Basic usage with file:
```bash
export MEESHY_PASSWORD="your_password"
./scripts/announcement.sh -f announcement.txt
```

### With all options:
```bash
./scripts/announcement.sh \
  -p "password" \
  -l en \
  -v \
  -f announcement.txt \
  --no-cleanup
```

### Direct message:
```bash
./scripts/announcement.sh -p "password" "Your message here"
```

## API Endpoint Details

### Endpoint: `/api/conversations/:id/messages`
**Method**: POST

**Headers**:
- `Content-Type: application/json`
- `Authorization: Bearer {token}`

**Path Parameters**:
- `id`: Conversation ID or identifier (e.g., "meeshy")

**Body**:
```json
{
  "content": "Your message content",
  "originalLanguage": "en",
  "messageType": "text"
}
```

**Response** (Success - 201):
```json
{
  "success": true,
  "data": {
    "id": "68f18661d7a5623f27726156",
    "conversationId": "...",
    "senderId": "...",
    "content": "Your message content",
    "originalLanguage": "en",
    "messageType": "text",
    "createdAt": "2025-10-16T23:57:20.000Z",
    "sender": { ... },
    "meta": { ... }
  }
}
```

## Files Modified

1. **scripts/announcement.sh**
   - Updated API endpoint from `/api/messages` to `/api/conversations/:id/messages`
   - Changed payload fields to match conversation messages API (`content`, `originalLanguage`, `messageType`)
   - Improved JSON escaping with `jq -Rs .`
   - Now uses the official conversations API for posting messages

## Files Created (Temporary, cleaned up)

1. `scripts/announcement-images.txt` - French version (deleted)
2. `scripts/announcement-images-en.txt` - English version (deleted)
3. `post-20251017-015401` - Backup of published announcement (kept)

## Testing

All tests passed:
- ✅ Authentication successful (200 OK)
- ✅ Message properly encoded with emojis and special characters
- ✅ Multi-line messages handled correctly
- ✅ API returned 201 Created
- ✅ Message ID received in response
- ✅ Message published to conversation "meeshy"
- ✅ Automatic file cleanup working

## Notes

- The `/api/conversations/:id/messages` endpoint is the official API for sending messages to conversations
- The `:id` parameter accepts both MongoDB ObjectId and conversation identifiers (like "meeshy")
- The endpoint requires authentication via JWT token (Bearer token in Authorization header)
- The API returns HTTP 201 (Created) on success with the complete message object including:
  - Message ID
  - Full message details
  - Sender information
  - Conversation metadata
- Translations are handled automatically after message creation via the TranslationService
- Message tracking links are processed and converted to `mshy://<token>` format automatically

