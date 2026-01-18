# User Preferences API - `/me/preferences/*`

Unified RESTful API for managing all user preference types under a consistent `/me/preferences/*` structure.

## Architecture

### Directory Structure

```
src/routes/me/preferences/
├── README.md                    # This file
├── index.ts                     # Main entry point, aggregates all routes
├── types.ts                     # TypeScript types and DTOs
├── schemas.ts                   # JSON Schema definitions for OpenAPI
├── notifications/
│   └── index.ts                 # Notification preferences routes
├── encryption/
│   └── index.ts                 # Encryption preferences routes
├── theme/
│   └── index.ts                 # Theme preferences routes
├── languages/
│   └── index.ts                 # Language preferences routes
└── privacy/
    └── index.ts                 # Privacy preferences routes

src/services/preferences/
├── index.ts                     # Service exports
└── PreferencesService.ts        # Business logic layer
```

### Design Patterns

1. **Repository Pattern**: Separation between business logic (Service) and data access (Prisma)
2. **DTO Pattern**: Clear input/output types for API boundaries
3. **Service Layer**: Centralized business logic with validation
4. **Modular Routes**: Each preference type in its own module
5. **Consistent API**: All routes follow RESTful conventions

## API Endpoints

### Overview Endpoint

```
GET /me/preferences
```

Returns a list of all available preference endpoints.

### Notification Preferences

**Base Path**: `/me/preferences/notifications`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/me/preferences/notifications` | Get notification preferences (returns defaults if not set) |
| PUT | `/me/preferences/notifications` | Update notification preferences (supports partial updates) |
| PATCH | `/me/preferences/notifications` | Partial update (semantically clearer for partial updates) |
| DELETE | `/me/preferences/notifications` | Reset to default values |

**Request Body Example** (PUT/PATCH):
```json
{
  "pushEnabled": true,
  "emailEnabled": false,
  "soundEnabled": true,
  "newMessageEnabled": true,
  "dndEnabled": true,
  "dndStartTime": "22:00",
  "dndEndTime": "08:00"
}
```

**Response Example**:
```json
{
  "success": true,
  "data": {
    "id": "pref-123",
    "userId": "user-123",
    "pushEnabled": true,
    "emailEnabled": false,
    "soundEnabled": true,
    "newMessageEnabled": true,
    "missedCallEnabled": true,
    "systemEnabled": true,
    "conversationEnabled": true,
    "replyEnabled": true,
    "mentionEnabled": true,
    "reactionEnabled": true,
    "contactRequestEnabled": true,
    "memberJoinedEnabled": true,
    "dndEnabled": true,
    "dndStartTime": "22:00",
    "dndEndTime": "08:00",
    "isDefault": false,
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T12:30:00Z"
  }
}
```

### Encryption Preferences

**Base Path**: `/me/preferences/encryption`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/me/preferences/encryption` | Get encryption preferences and Signal key status |
| PUT | `/me/preferences/encryption` | Update encryption preference level |

**Request Body Example** (PUT):
```json
{
  "encryptionPreference": "always"
}
```

**Response Example**:
```json
{
  "success": true,
  "data": {
    "encryptionPreference": "always",
    "hasSignalKeys": true,
    "signalRegistrationId": 12345,
    "signalPreKeyBundleVersion": 1,
    "lastKeyRotation": "2024-01-10T08:00:00Z"
  }
}
```

**Encryption Levels**:
- `disabled`: No encryption
- `optional`: User can choose per conversation
- `always`: Enforce E2EE on all conversations

### Theme Preferences

**Base Path**: `/me/preferences/theme`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/me/preferences/theme` | Get theme and appearance preferences |
| PUT | `/me/preferences/theme` | Update theme preferences |
| PATCH | `/me/preferences/theme` | Partial update |
| DELETE | `/me/preferences/theme` | Reset to defaults |

**Request Body Example** (PUT/PATCH):
```json
{
  "theme": "dark",
  "fontFamily": "inter",
  "fontSize": "large",
  "compactMode": true
}
```

**Response Example**:
```json
{
  "success": true,
  "data": {
    "theme": "dark",
    "fontFamily": "inter",
    "fontSize": "large",
    "compactMode": true
  }
}
```

**Valid Values**:
- `theme`: `light`, `dark`, `system`
- `fontFamily`: `inter`, `nunito`, `poppins`, `open-sans`, `lato`, `comic-neue`, `lexend`, `roboto`, `geist-sans`
- `fontSize`: `small`, `medium`, `large`

### Language Preferences

**Base Path**: `/me/preferences/languages`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/me/preferences/languages` | Get language preferences |
| PUT | `/me/preferences/languages` | Update language preferences |
| PATCH | `/me/preferences/languages` | Partial update |

**Request Body Example** (PUT/PATCH):
```json
{
  "systemLanguage": "en",
  "regionalLanguage": "fr",
  "customDestinationLanguage": "es",
  "autoTranslate": true
}
```

**Response Example**:
```json
{
  "success": true,
  "data": {
    "systemLanguage": "en",
    "regionalLanguage": "fr",
    "customDestinationLanguage": "es",
    "autoTranslate": true
  }
}
```

### Privacy Preferences

**Base Path**: `/me/preferences/privacy`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/me/preferences/privacy` | Get privacy preferences |
| PUT | `/me/preferences/privacy` | Update privacy preferences |
| PATCH | `/me/preferences/privacy` | Partial update |
| DELETE | `/me/preferences/privacy` | Reset to defaults |

**Request Body Example** (PUT/PATCH):
```json
{
  "showOnlineStatus": true,
  "showLastSeen": true,
  "showReadReceipts": true,
  "showTypingIndicator": true,
  "allowContactRequests": true,
  "allowGroupInvites": true,
  "saveMediaToGallery": false,
  "allowAnalytics": true
}
```

**Response Example**:
```json
{
  "success": true,
  "data": {
    "showOnlineStatus": true,
    "showLastSeen": true,
    "showReadReceipts": true,
    "showTypingIndicator": true,
    "allowContactRequests": true,
    "allowGroupInvites": true,
    "saveMediaToGallery": false,
    "allowAnalytics": true
  }
}
```

## Common Response Formats

### Success Response

```json
{
  "success": true,
  "data": {
    // Preference data here
  }
}
```

### Error Response

```json
{
  "success": false,
  "message": "Error description"
}
```

### Common HTTP Status Codes

- `200 OK`: Request successful
- `400 Bad Request`: Invalid input (validation failed)
- `401 Unauthorized`: Authentication required or invalid token
- `403 Forbidden`: Anonymous users attempting to access restricted preferences
- `404 Not Found`: User not found
- `500 Internal Server Error`: Server error

## Authentication

All endpoints require authentication via JWT token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

Anonymous users (session-based) are **not allowed** to manage:
- Encryption preferences (require registered user account)

## Rate Limiting

Rate limits apply per user:
- **100 requests/minute** per authenticated user
- Configured via Fastify rate-limit middleware

## Validation

### Input Validation

All endpoints validate input using JSON Schema:
- Type checking (string, boolean, number)
- Enum validation (theme, font, encryption level)
- Pattern matching (DND times: HH:MM format)
- Required field checking

### Business Logic Validation

Additional validation in `PreferencesService`:
- DND times must be valid HH:MM format
- DND times required when enabling DND
- Encryption preference must be valid enum
- Theme/font must be from allowed list

## Default Values

When preferences are not set, the API returns defaults from:
- `NOTIFICATION_PREFERENCES_DEFAULTS`
- `PRIVACY_PREFERENCES_DEFAULTS`
- `USER_PREFERENCES_DEFAULTS`

See `/src/config/user-preferences-defaults.ts` for complete list.

## Database Schema

### NotificationPreference (Dedicated Table)

```prisma
model NotificationPreference {
  id                    String   @id @default(auto()) @map("_id") @db.ObjectId
  userId                String   @unique @db.ObjectId
  pushEnabled           Boolean
  emailEnabled          Boolean
  soundEnabled          Boolean
  newMessageEnabled     Boolean
  missedCallEnabled     Boolean
  systemEnabled         Boolean
  conversationEnabled   Boolean
  replyEnabled          Boolean
  mentionEnabled        Boolean
  reactionEnabled       Boolean
  contactRequestEnabled Boolean
  memberJoinedEnabled   Boolean
  dndEnabled            Boolean
  dndStartTime          String?
  dndEndTime            String?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}
```

### UserPreference (Key-Value Store)

For theme, privacy, and other flexible preferences:

```prisma
model UserPreference {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  userId    String   @db.ObjectId
  key       String
  value     String
  valueType String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, key], map: "userId_key")
}
```

### User & UserFeature

Encryption and language preferences stored directly on User model:
- `User.signalIdentityKeyPublic`
- `User.signalRegistrationId`
- `User.systemLanguage`
- `User.regionalLanguage`
- `UserFeature.encryptionPreference`

## Testing

### Unit Tests

Located in `/src/__tests__/unit/`:
- `services/PreferencesService.test.ts`: Service layer tests
- `routes/me/preferences/*.test.ts`: Route handler tests

Run tests:
```bash
npm test -- PreferencesService
```

### Integration Tests

Test complete request/response flow:
```bash
npm test -- routes/me/preferences
```

### Test Coverage

Aim for >80% coverage on:
- All service methods
- All route handlers
- Validation logic
- Error handling

## Migration from Old Routes

Old routes being migrated:
- `/user-preferences/notifications` → `/me/preferences/notifications`
- `/users/me/encryption-preferences` → `/me/preferences/encryption`
- `/privacy-preferences` → `/me/preferences/privacy`

### Migration Strategy

1. Keep old routes functional (deprecated)
2. Add deprecation warnings in old routes
3. Update client applications to use new endpoints
4. Remove old routes after migration period

## Examples

### Get all notification settings

```bash
curl -X GET \
  https://api.meeshy.com/me/preferences/notifications \
  -H 'Authorization: Bearer <token>'
```

### Enable Do Not Disturb

```bash
curl -X PATCH \
  https://api.meeshy.com/me/preferences/notifications \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "dndEnabled": true,
    "dndStartTime": "22:00",
    "dndEndTime": "08:00"
  }'
```

### Change theme to dark mode

```bash
curl -X PATCH \
  https://api.meeshy.com/me/preferences/theme \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"theme": "dark"}'
```

### Update privacy settings

```bash
curl -X PATCH \
  https://api.meeshy.com/me/preferences/privacy \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "showOnlineStatus": false,
    "showLastSeen": false
  }'
```

### Reset preferences to defaults

```bash
curl -X DELETE \
  https://api.meeshy.com/me/preferences/notifications \
  -H 'Authorization: Bearer <token>'
```

## OpenAPI Documentation

All endpoints are fully documented with OpenAPI schemas. Access the interactive documentation at:

```
https://api.meeshy.com/documentation
```

Filter by tags:
- `preferences`: All preference endpoints
- `notifications`: Notification-specific
- `encryption`: Encryption-specific
- `theme`: Theme-specific
- `languages`: Language-specific
- `privacy`: Privacy-specific
- `me`: User-scoped endpoints

## Support

For issues or questions:
- GitHub Issues: [meeshy/gateway](https://github.com/meeshy/gateway)
- Documentation: [docs.meeshy.com](https://docs.meeshy.com)
