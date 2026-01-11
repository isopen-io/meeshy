# Admin Routes OpenAPI Documentation

## Overview

Comprehensive OpenAPI/Swagger documentation has been added to all admin routes in `/services/gateway/src/routes/admin.ts`.

## Implementation Summary

### Shared Schema Imports

Added imports from `@meeshy/shared/types/api-schemas.ts`:
- `adminAuditLogSchema` - Admin audit log entries
- `securityEventSchema` - Security event definitions
- `userSchema` - Complete user object schema
- `userMinimalSchema` - Minimal user data for references
- `errorResponseSchema` - Standard error response format

### Documented Routes

All routes now include complete OpenAPI schemas with:
- `description` - Detailed endpoint functionality
- `tags` - Tagged as 'admin' for organization
- `summary` - Short endpoint summary
- `security` - Bearer auth requirement
- `params/querystring/body` - Input validation schemas
- `response` - Response schemas for all status codes (200, 400, 401, 403, 404, 500)

#### Dashboard & Analytics

1. **GET /admin/dashboard**
   - Comprehensive admin dashboard statistics
   - User counts, activity metrics, translations, reports
   - Recent activity summaries (7 days)
   - User permissions based on role

2. **GET /admin/analytics**
   - Advanced analytics over time periods (24h, 7d, 30d, 90d)
   - User activity trends
   - Message and conversation metrics
   - Top active users by role

3. **GET /admin/ranking**
   - Flexible ranking system for multiple entity types
   - Entity types: users, conversations, messages, links
   - Multiple criteria per entity type
   - Configurable time periods (1d to 365d, or all-time)
   - Pagination with max 100 results

#### User Management

4. **GET /admin/users**
   - Paginated user list with filtering
   - Search by username, email, name
   - Filter by role and status
   - Includes counts for messages, conversations, communities

5. **GET /admin/users/:id**
   - Detailed user information
   - Security and verification status
   - Activity statistics
   - Uses `userSchema` from shared types

6. **PATCH /admin/users/:id/role**
   - Update user role with hierarchy validation
   - Validates admin can only modify lower-level roles
   - Input validation with Zod schema

7. **PATCH /admin/users/:id/status**
   - Activate/deactivate user accounts
   - Sets deactivation timestamp
   - Hierarchy-based permission checks

8. **GET /admin/anonymous-users**
   - List anonymous participants
   - Search and status filtering
   - Share link association details

#### Content Management

9. **GET /admin/messages**
   - Paginated message list
   - Search by content
   - Filter by type and time period (today, week, month)
   - Includes sender, conversation, attachments

10. **GET /admin/communities**
    - List communities with pagination
    - Search by name, identifier, description
    - Filter by privacy status
    - Member and conversation counts

11. **GET /admin/translations**
    - Message translation history
    - Filter by source/target language
    - Time period filtering
    - Translation model and confidence data

12. **GET /admin/share-links**
    - Conversation share links management
    - Search by linkId, identifier, name
    - Active/inactive filtering
    - Usage statistics and limits

## Permission Requirements

Each route enforces role-based permissions:

- **canAccessAdmin** - Base requirement for all admin routes
- **canManageUsers** - User management routes
- **canManageCommunities** - Community management routes
- **canManageConversations** - Share link management
- **canModerateContent** - Message management
- **canViewAnalytics** - Analytics and ranking routes
- **canManageTranslations** - Translation management
- **canViewAuditLogs** - Future audit log access

## Response Format

All endpoints follow consistent response structure:

### Success Response (200)
```json
{
  "success": true,
  "data": { /* endpoint-specific data */ },
  "pagination": { /* for list endpoints */
    "total": 100,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

### Error Responses (4xx, 5xx)
```json
{
  "success": false,
  "message": "Error description",
  "errors": [ /* validation errors if applicable */ ]
}
```

## Security Features

1. **Authentication Required**: All routes use `fastify.authenticate` middleware
2. **Admin Authorization**: `requireAdmin` middleware validates admin access
3. **Permission Checks**: Fine-grained permission validation per route
4. **Role Hierarchy**: Admins can only manage users with lower hierarchy levels
5. **Input Validation**: Zod schemas for request body validation
6. **Pagination Limits**: Maximum 100 items per page to prevent abuse

## OpenAPI/Swagger Benefits

1. **Auto-generated API Documentation**: Fastify Swagger plugin generates interactive docs
2. **Type Safety**: Schemas ensure response/request type consistency
3. **API Client Generation**: Can generate typed API clients from schemas
4. **Request Validation**: Automatic validation before handler execution
5. **Developer Experience**: Clear documentation for frontend developers

## Next Steps

To view the generated OpenAPI documentation:

1. Start the gateway service
2. Navigate to `http://localhost:3000/documentation` (or configured Swagger UI path)
3. All admin routes will be grouped under the "admin" tag
4. Interactive testing available through Swagger UI

## Additional Notes

- All schemas use JSON Schema format compatible with Fastify's validation
- Error responses use the shared `errorResponseSchema` for consistency
- The `userSchema` from shared types ensures consistency across services
- Pagination parameters are validated and capped to prevent abuse
- Time period filters use standardized values across all endpoints
