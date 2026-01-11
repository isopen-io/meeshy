# Translation API - OpenAPI Schema Quick Reference

## Endpoints Overview

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/translate-blocking` | Synchronous translation (waits for result) | Yes |
| GET | `/languages` | Get supported languages | No |
| POST | `/detect-language` | Detect language of text | No |
| GET | `/test` | Health check for translation service | No |

---

## POST /translate-blocking

### Description
Translate text synchronously with blocking behavior. Supports both new message translation and retranslation of existing messages.

### Request Body

```json
{
  "text": "Hello, how are you?",           // Optional if message_id provided
  "source_language": "en",                // Optional (auto-detect)
  "target_language": "fr",                // Required
  "model_type": "medium",                 // Optional: basic|medium|premium
  "message_id": "msg_123abc",             // Optional (for retranslation)
  "conversation_id": "conv_456def"        // Required if message_id not provided
}
```

### Success Response (200)

```json
{
  "success": true,
  "data": {
    "message_id": "msg_123abc",
    "translated_text": "Bonjour, comment allez-vous?",
    "original_text": "Hello, how are you?",
    "source_language": "en",
    "target_language": "fr",
    "model_used": "medium",
    "confidence": 0.95,
    "processing_time": 0.234,
    "from_cache": false,
    "cache_key": "trans_en_fr_abc123",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### Error Responses

#### 400 - Bad Request (Validation Error)
```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Either 'text' or 'message_id' must be provided"
}
```

#### 400 - E2EE Message
```json
{
  "success": false,
  "error": "E2EE_NOT_TRANSLATABLE",
  "message": "End-to-end encrypted messages cannot be translated by the server"
}
```

#### 401 - Unauthorized
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Invalid or missing authentication token"
}
```

#### 403 - Forbidden
```json
{
  "success": false,
  "error": "Access denied to this message"
}
```

#### 404 - Not Found
```json
{
  "success": false,
  "error": "Message not found"
}
```

#### 500 - Internal Server Error
```json
{
  "success": false,
  "error": "TRANSLATION_ERROR",
  "message": "Translation service failed"
}
```

---

## GET /languages

### Description
Get the list of supported languages for translation.

### Success Response (200)

```json
{
  "success": true,
  "data": {
    "languages": [
      { "code": "fr", "name": "Francais", "flag": "FR" },
      { "code": "en", "name": "English", "flag": "US" },
      { "code": "es", "name": "Espanol", "flag": "ES" },
      { "code": "de", "name": "Deutsch", "flag": "DE" },
      { "code": "pt", "name": "Portugues", "flag": "PT" },
      { "code": "zh", "name": "Chinese", "flag": "CN" },
      { "code": "ja", "name": "Japanese", "flag": "JP" },
      { "code": "ar", "name": "Arabic", "flag": "SA" }
    ]
  }
}
```

---

## POST /detect-language

### Description
Detect the language of a given text using pattern-based analysis.

### Request Body

```json
{
  "text": "Bonjour le monde"
}
```

### Success Response (200)

```json
{
  "success": true,
  "data": {
    "language": "fr",
    "confidence": 0.7,
    "text": "Bonjour le monde"
  }
}
```

### Error Responses

#### 400 - Empty Text
```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Text is required"
}
```

#### 500 - Detection Failed
```json
{
  "success": false,
  "error": "DETECTION_ERROR",
  "message": "Language detection failed"
}
```

---

## GET /test

### Description
Health check endpoint that tests the translation service by translating "Hello world" from English to French.

### Success Response (200)

```json
{
  "success": true,
  "data": {
    "message": "Translation service is working",
    "message_id": "msg_test123",
    "test_result": {
      "translated_text": "Bonjour le monde",
      "source_language": "en",
      "target_language": "fr",
      "model": "basic",
      "confidence": 0.95
    }
  }
}
```

### Error Response (500)

```json
{
  "success": false,
  "error": "TEST_FAILED",
  "message": "Translation service test failed - no result available"
}
```

---

## Model Types

| Model Type | Description | Text Length Threshold |
|------------|-------------|----------------------|
| `basic` | Fast, lightweight translation | < 20 characters |
| `medium` | Balanced quality and speed | 20-100 characters |
| `premium` | Highest quality translation | > 100 characters |
| `fallback` | Emergency fallback (low quality) | Used on timeout |
| `none` | No translation needed | source = target language |

### Auto-Prediction
When `model_type` is set to `"basic"` or omitted, the system automatically predicts the best model based on text length.

---

## Supported Languages (ISO 639-1)

| Code | Language | Flag Code |
|------|----------|-----------|
| `fr` | Français | FR |
| `en` | English | US |
| `es` | Español | ES |
| `de` | Deutsch | DE |
| `pt` | Português | PT |
| `zh` | Chinese | CN |
| `ja` | Japanese | JP |
| `ar` | Arabic | SA |

---

## Special Features

### E2E Encryption Support
- E2E encrypted messages (`encryptionMode: 'e2ee'`) cannot be translated server-side
- Attempting to translate E2EE messages returns HTTP 400 with error code `E2EE_NOT_TRANSLATABLE`

### Translation Caching
- Translations are cached to improve performance
- Cache hits are indicated by `from_cache: true` in the response
- Cache key is provided for debugging purposes

### Same-Language Optimization
- If source language equals target language, translation is skipped
- Returns original text with `model_used: "none"`
- Confidence score is set to 1.0
- Processing time is minimal (0ms)

### Retranslation Support
- Existing messages can be retranslated by providing `message_id`
- Access control is enforced (user must be a conversation member)
- Original message text is used if `text` field is not provided

---

## Example cURL Commands

### Translate New Message
```bash
curl -X POST http://localhost:3000/api/translation/translate-blocking \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "text": "Hello, how are you?",
    "target_language": "fr",
    "conversation_id": "conv_123"
  }'
```

### Retranslate Existing Message
```bash
curl -X POST http://localhost:3000/api/translation/translate-blocking \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "message_id": "msg_456",
    "target_language": "es"
  }'
```

### Get Supported Languages
```bash
curl http://localhost:3000/api/translation/languages
```

### Detect Language
```bash
curl -X POST http://localhost:3000/api/translation/detect-language \
  -H "Content-Type: application/json" \
  -d '{"text": "Bonjour le monde"}'
```

### Test Service
```bash
curl http://localhost:3000/api/translation/test
```

---

## Response Field Reference

### Translation Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `message_id` | string | Unique identifier for the translated message |
| `translated_text` | string | The text after translation |
| `original_text` | string | The text before translation |
| `source_language` | string | ISO 639-1 code of source language |
| `target_language` | string | ISO 639-1 code of target language |
| `model_used` | string | Model type used (basic/medium/premium/fallback/none) |
| `confidence` | number | Translation confidence (0.0 - 1.0) |
| `processing_time` | number | Processing time in seconds |
| `from_cache` | boolean | Whether result was cached |
| `cache_key` | string | Cache key (optional, for debugging) |
| `timestamp` | string | ISO 8601 timestamp of response |

---

## Best Practices

1. **Error Handling**: Always check the `success` field before processing `data`
2. **Model Selection**: Let the system auto-predict model type for optimal performance
3. **Language Detection**: Use `source_language: "auto"` or omit it for automatic detection
4. **Caching**: Monitor `from_cache` field to understand cache hit rates
5. **Confidence Scores**: Use confidence scores to determine if manual review is needed (< 0.5)
6. **E2EE Messages**: Handle E2EE errors gracefully and inform users that translation is unavailable
7. **Retranslation**: Prefer using `message_id` for retranslation to maintain consistency

---

## Validation Rules

### Text Field
- Type: string
- Min length: 1 character
- Max length: 1000 characters
- Required: Only if `message_id` is not provided

### Language Codes
- Type: string
- Format: ISO 639-1 (2-5 characters)
- `source_language`: Optional (auto-detect if omitted)
- `target_language`: Required

### Model Type
- Type: string
- Values: `basic`, `medium`, `premium`
- Optional (auto-predicted if omitted)

### IDs
- `message_id`: Valid message UUID
- `conversation_id`: Valid conversation UUID
- Required: Either `text` + `conversation_id` OR `message_id`

---

## Performance Characteristics

- **Typical Response Time**: 200-500ms (non-cached)
- **Cached Response Time**: < 50ms
- **Timeout**: 10 seconds maximum wait time
- **Fallback**: Returns tagged text if timeout occurs
- **Concurrent Requests**: Supported via async processing

---

## Security Considerations

1. **Authentication**: JWT token required for `/translate-blocking`
2. **Authorization**: Message access verified for retranslation
3. **E2EE Protection**: Encrypted messages cannot be translated server-side
4. **Input Validation**: All inputs validated with Zod schemas
5. **Rate Limiting**: Should be implemented at gateway/proxy level
6. **Sensitive Data**: Translation content is not logged or stored beyond cache TTL
