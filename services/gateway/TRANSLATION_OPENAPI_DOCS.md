# Translation Routes OpenAPI Documentation

## Summary

Comprehensive OpenAPI documentation has been added to all translation routes in `/services/gateway/src/routes/translation.ts`.

## Changes Made

### 1. Added Import
```typescript
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
```

### 2. Created OpenAPI Schemas

#### Request Schemas
- **translateRequestSchema**: Complete schema for translation request body including text, source_language, target_language, model_type, message_id, and conversation_id
- **detectLanguageRequestSchema**: Schema for language detection request with text field

#### Response Schemas
- **translationSuccessResponseSchema**: Comprehensive success response including:
  - `message_id`: ID of the translated message
  - `translated_text`: The translated text
  - `original_text`: Original text before translation
  - `source_language`: Detected or provided source language
  - `target_language`: Target language code
  - `model_used`: Translation model used (basic, medium, premium, fallback, none)
  - `confidence`: Translation confidence score (0-1)
  - `processing_time`: Processing time in seconds
  - `from_cache`: Whether translation was cached
  - `cache_key`: Optional cache key
  - `timestamp`: ISO 8601 timestamp

- **languagesResponseSchema**: Schema for supported languages list with code, name, and flag
- **detectLanguageResponseSchema**: Schema for language detection response
- **e2eeErrorResponseSchema**: Schema for E2EE translation errors

### 3. Documented Routes

#### POST /translate-blocking
- **Description**: Translate text synchronously with blocking behavior. Supports both new message translation and retranslation of existing messages. E2E encrypted messages cannot be translated.
- **Tags**: ['translation']
- **Summary**: Translate text (blocking)
- **Request Body**: translateRequestSchema
- **Responses**:
  - 200: Success with translation result
  - 400: Bad request (validation error or E2EE message)
  - 401: Unauthorized
  - 403: Forbidden (no access to message)
  - 404: Message not found
  - 500: Internal server error

#### GET /languages
- **Description**: Get the list of supported languages for translation with language codes, display names, and flag codes.
- **Tags**: ['translation']
- **Summary**: Get supported languages
- **Responses**:
  - 200: Success with languages list
  - 500: Internal server error

#### POST /detect-language
- **Description**: Detect the language of a given text using pattern-based analysis. Returns detected language code and confidence score.
- **Tags**: ['translation']
- **Summary**: Detect text language
- **Request Body**: detectLanguageRequestSchema
- **Responses**:
  - 200: Success with detected language
  - 400: Bad request (empty text)
  - 500: Internal server error

#### GET /test
- **Description**: Test the translation service by translating "Hello world" from English to French. Useful for health checks.
- **Tags**: ['translation']
- **Summary**: Test translation service
- **Responses**:
  - 200: Success with test result
  - 500: Test failed

## OpenAPI Features

### Input Validation
All request schemas include:
- Type definitions (string, number, boolean)
- Length constraints (minLength, maxLength)
- Required field markers
- Enum values for model_type
- Detailed descriptions
- Example values

### Response Documentation
All response schemas include:
- Complete object structures
- Property types and constraints
- Example values
- Descriptive field documentation
- Multiple status codes (200, 400, 401, 403, 404, 500)
- Error response schemas with consistent structure

### Security Considerations
- E2EE message handling is documented
- Authentication requirements (401)
- Authorization checks (403)
- Message access control

### Performance Metadata
Translation responses include:
- Processing time in seconds
- Cache hit indicator (from_cache)
- Cache key for debugging
- Model used for translation
- Confidence scores

## Benefits

1. **Auto-generated API Documentation**: Fastify can generate Swagger/OpenAPI docs automatically
2. **Request Validation**: Schema-based validation at the API level
3. **Type Safety**: Schemas provide runtime type checking
4. **Developer Experience**: Clear documentation for API consumers
5. **Testing**: Well-defined contracts for integration tests
6. **Client Generation**: Schemas can be used to generate type-safe API clients

## Usage

### Viewing the Documentation
If Fastify Swagger is configured, access the documentation at:
- `/documentation` - Interactive Swagger UI
- `/documentation/json` - OpenAPI JSON specification

### Example API Calls

#### Translate Text (Blocking)
```bash
curl -X POST http://localhost:3000/api/translation/translate-blocking \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "text": "Hello, how are you?",
    "source_language": "en",
    "target_language": "fr",
    "model_type": "medium",
    "conversation_id": "conv_123"
  }'
```

#### Get Supported Languages
```bash
curl http://localhost:3000/api/translation/languages
```

#### Detect Language
```bash
curl -X POST http://localhost:3000/api/translation/detect-language \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Bonjour le monde"
  }'
```

#### Test Translation Service
```bash
curl http://localhost:3000/api/translation/test
```

## Next Steps

1. **Configure Fastify Swagger**: Add `@fastify/swagger` and `@fastify/swagger-ui` plugins to server.ts
2. **Generate TypeScript Types**: Use openapi-typescript to generate client types from schemas
3. **Add Authentication Schemas**: Document authentication requirements more explicitly
4. **Rate Limiting Documentation**: Add rate limit information to schema metadata
5. **Async Translation Route**: Consider documenting POST /translate (non-blocking) if it exists

## File Location
`/Users/smpceo/Documents/v2_meeshy/services/gateway/src/routes/translation.ts`
