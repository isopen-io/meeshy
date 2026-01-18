# User Routes Module

Refactored modular structure for user-related routes in the Gateway service.

## Structure

```
src/routes/users/
├── index.ts          # Main entry point (62 lines)
├── types.ts          # TypeScript types & interfaces (86 lines)
├── profile.ts        # User profile management (747 lines)
├── preferences.ts    # User preferences & stats (655 lines)
└── devices.ts        # Social & device management (638 lines)
```

**Total**: 2,188 lines (previously 2,049 lines in single file)

## Module Responsibilities

### `types.ts`
Type definitions and interfaces shared across user routes:
- `AuthenticatedRequest` - Extended request with auth context
- `PaginationParams` - Pagination validation result
- `UserMinimal` - Minimal user data for responses
- Request/response types for all endpoints

### `profile.ts`
User profile management endpoints:
- `GET /users/me/test` - Authentication test endpoint
- `PATCH /users/me` - Update user profile (name, email, phone, bio, languages)
- `PATCH /users/me/avatar` - Update user avatar
- `PATCH /users/me/password` - Change password
- `GET /u/:username` - Get public profile by username
- `GET /users/:id` - Get public profile by ID or username

### `preferences.ts`
User preferences, stats, and search:
- `GET /users/me/dashboard-stats` - Dashboard statistics with conversations & communities
- `GET /users/:userId/stats` - User activity statistics
- `GET /users/search` - Search users by name/username/email

### `devices.ts`
Social features and device management:
- `GET /users/friend-requests` - Get all friend requests
- `POST /users/friend-requests` - Send friend request
- `PATCH /users/friend-requests/:id` - Accept/reject/cancel friend request
- `GET /users/:userId/affiliate-token` - Get active affiliate token
- Stub routes for admin operations (GET/PUT/DELETE /users/:id)

## Key Features

### Strong Typing
All request/response types are strictly typed using Zod schemas and TypeScript interfaces.

### Validation
- Pagination validation with configurable limits
- Email/phone uniqueness checks
- MongoDB ObjectId vs username auto-detection
- Case-insensitive searches

### Security
- Authentication required for most endpoints
- Public profiles exclude sensitive data (email, phone, password)
- Password verification for password changes
- Bcrypt cost factor of 12

### Performance
- Parallel database queries using `Promise.all`
- Optimized select queries (only fetch needed fields)
- Pagination support on all list endpoints
- Limited member/message results in dashboard stats

### Normalization
- Email normalization (lowercase, trim)
- Phone number normalization (E.164 format)
- Display name normalization
- Name capitalization

## Usage

```typescript
import { userRoutes } from './routes/users';

// Register routes in Fastify instance
await server.register(userRoutes, { prefix: '/api/v1' });
```

## Dependencies

### External Packages
- `fastify` - Web framework
- `zod` - Schema validation
- `bcryptjs` - Password hashing
- `@meeshy/shared` - Shared types and validation schemas

### Internal Modules
- `../../utils/logger` - Error logging
- `../../utils/normalize` - Data normalization utilities
- `../../utils/pagination` - Pagination helpers

## Migration Notes

The original `src/routes/users.ts` (2,049 lines) has been split into focused modules while preserving:
- All endpoint logic and business rules
- HTTP status codes and error messages
- OpenAPI/Swagger schema definitions
- Validation rules and constraints
- Authentication requirements
- Database query optimizations

The refactoring maintains 100% backward compatibility - no API changes required.

## Future Improvements

1. **Admin Routes**: Implement stub routes (GET/PUT/DELETE /users/:id)
2. **Rate Limiting**: Add per-endpoint rate limiting
3. **Caching**: Cache frequently accessed user profiles
4. **WebSocket Events**: Emit events for profile updates
5. **Audit Logging**: Track profile/password changes
