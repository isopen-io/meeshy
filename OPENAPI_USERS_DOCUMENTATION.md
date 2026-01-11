# OpenAPI Documentation Added to Users Routes

## Summary

Comprehensive OpenAPI/Swagger documentation has been added to all routes in `/services/gateway/src/routes/users.ts`.

## Implementation Details

### Imports Added

```typescript
import {
  userSchema,
  userMinimalSchema,
  userStatsSchema,
  updateUserRequestSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
```

### Routes Documented

#### User Profile Management

1. **GET /users/check-username/:username**
   - Check username availability
   - Validates across registered users and anonymous participants
   - Returns normalized username

2. **GET /users/me/test**
   - Test authentication endpoint
   - Returns user ID and timestamp
   - Requires authentication

3. **GET /users/me/dashboard-stats**
   - Get comprehensive dashboard statistics
   - Returns conversations, communities, messages, activity stats
   - Includes recent conversations and communities
   - Requires authentication

4. **GET /users/:userId/stats**
   - Get user statistics by ID or username
   - Returns message counts, conversation stats
   - Supports both MongoDB ID and username lookup
   - Requires authentication

5. **PATCH /users/me**
   - Update authenticated user profile
   - Accepts personal info, language settings, translation preferences
   - Validates email/phone uniqueness
   - Uses `updateUserRequestSchema` from shared schemas
   - Requires authentication

6. **PATCH /users/me/avatar**
   - Update user avatar
   - Accepts avatar image URL
   - Requires authentication

7. **PATCH /users/me/password**
   - Change user password
   - Requires current password verification
   - Enforces minimum 8 character length
   - Requires authentication

8. **GET /users/search**
   - Search users by name, username, email, displayName
   - Paginated results (max 100 per page)
   - Minimum 2 character query
   - Case-insensitive search
   - Requires authentication

#### Public Profile Routes

9. **GET /users**
   - Get all users (stub - to be implemented)
   - Documented for future implementation

10. **GET /u/:username**
    - Get public profile by username
    - Case-insensitive username matching
    - Returns public fields only (excludes sensitive data)

11. **GET /users/:id**
    - Get public profile by MongoDB ID or username
    - Auto-detects ID format (24 hex chars = MongoDB ID)
    - Returns public fields with language settings
    - Masks email/phone for security

12. **PUT /users/:id**
    - Update user by ID (stub - to be implemented)
    - Admin-only endpoint (future)

13. **DELETE /users/:id**
    - Delete user by ID (stub - to be implemented)
    - Admin-only endpoint (future)

#### Friend Request Routes

14. **GET /users/friend-requests**
    - Get all friend requests for authenticated user
    - Returns sent and received requests
    - Paginated results
    - Includes full user details
    - Tags: `['users', 'friends']`
    - Requires authentication

15. **POST /users/friend-requests**
    - Send friend request to another user
    - Validates user existence
    - Prevents duplicate requests
    - Prevents self-friending
    - Tags: `['users', 'friends']`
    - Requires authentication

16. **PATCH /users/friend-requests/:id**
    - Respond to friend request
    - Actions: accept, reject (receiver), cancel (sender)
    - Only pending requests can be modified
    - Tags: `['users', 'friends']`
    - Requires authentication

#### Affiliate Routes

17. **GET /users/:userId/affiliate-token**
    - Get active affiliate token for a user
    - Returns most recent non-expired token
    - Used for /join link affiliation
    - Tags: `['users', 'affiliate']`

## Schema Structure

Each route includes:

- **description**: Detailed explanation of endpoint functionality
- **tags**: Categorization for Swagger UI (`['users']`, `['users', 'friends']`, etc.)
- **summary**: Short one-line description
- **params**: Path parameter validation (where applicable)
- **querystring**: Query parameter validation (search, pagination)
- **body**: Request body schema (POST/PATCH/PUT)
- **response**: Response schemas for all status codes:
  - `200`: Success response with data structure
  - `400`: Validation errors
  - `401`: Authentication required
  - `403`: Forbidden (permission denied)
  - `404`: Resource not found
  - `500`: Internal server error

## Response Schema Patterns

### Success Response
```typescript
{
  success: true,
  data: { /* endpoint-specific data */ }
}
```

### Success Response with Pagination
```typescript
{
  success: true,
  data: [ /* array of items */ ],
  pagination: {
    total: number,
    offset: number,
    limit: number,
    returned: number
  }
}
```

### Error Response (using errorResponseSchema)
```typescript
{
  success: false,
  error: string,
  code?: string  // optional error code
}
```

### Validation Error Response
```typescript
{
  success: false,
  error: string,
  details: array  // Zod validation errors
}
```

## Shared Schemas Used

- **userSchema**: Full user object with all fields
- **userMinimalSchema**: Minimal user data (id, username, displayName, avatar, isOnline)
- **userStatsSchema**: User statistics structure (imported but can be used for future enhancements)
- **updateUserRequestSchema**: User profile update request body
- **errorResponseSchema**: Standard error response format

## Benefits

1. **Auto-generated Swagger UI**: All routes will appear in Swagger documentation
2. **Type Safety**: Request/response validation at runtime
3. **Client Generation**: Can generate TypeScript/JavaScript clients automatically
4. **API Contracts**: Clear contracts between frontend and backend
5. **Single Source of Truth**: Schemas defined in `@meeshy/shared/types/api-schemas.ts`
6. **Developer Experience**: Better IDE autocomplete and documentation

## Next Steps

To enable Swagger UI, ensure the gateway server has `@fastify/swagger` and `@fastify/swagger-ui` configured:

```typescript
// In server.ts
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

await fastify.register(swagger, {
  openapi: {
    info: {
      title: 'Meeshy Gateway API',
      version: '1.0.0'
    },
    tags: [
      { name: 'users', description: 'User management endpoints' },
      { name: 'friends', description: 'Friend request endpoints' },
      { name: 'affiliate', description: 'Affiliate token endpoints' }
    ]
  }
});

await fastify.register(swaggerUi, {
  routePrefix: '/docs'
});
```

Access Swagger UI at: `http://localhost:3001/docs`

## File Modified

- `/services/gateway/src/routes/users.ts`

## Lines Added

Approximately 650+ lines of OpenAPI schema definitions added across 17 route handlers.
