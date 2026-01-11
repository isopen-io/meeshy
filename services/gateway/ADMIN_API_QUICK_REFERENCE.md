# Admin API Quick Reference

## Authentication
All endpoints require Bearer token authentication:
```
Authorization: Bearer <token>
```

## Base Path
All routes are prefixed with `/admin`

---

## Dashboard & Analytics

### GET /admin/dashboard
Get comprehensive admin statistics
- **Permission**: canAccessAdmin
- **Query**: None
- **Response**: Statistics, recent activity, user permissions

### GET /admin/analytics?period=7d
Get analytics over time period
- **Permission**: canViewAnalytics
- **Query**: `period` (24h | 7d | 30d | 90d)
- **Response**: User/message/conversation activity trends

### GET /admin/ranking
Get entity rankings by criteria
- **Permission**: canViewAnalytics
- **Query**:
  - `entityType` (users | conversations | messages | links)
  - `criterion` (varies by entity type)
  - `period` (1d | 7d | 30d | 60d | 90d | 180d | 365d | all)
  - `limit` (max 100)
- **Response**: Ranked list with counts

---

## User Management

### GET /admin/users
List users with pagination
- **Permission**: canManageUsers
- **Query**:
  - `offset`, `limit` (pagination)
  - `search` (username, email, name)
  - `role` (USER | MODERATOR | ADMIN | etc.)
  - `status` (active | inactive)
- **Response**: User list with counts

### GET /admin/users/:id
Get user details
- **Permission**: canManageUsers
- **Params**: `id` (user ID)
- **Response**: Complete user object

### PATCH /admin/users/:id/role
Update user role
- **Permission**: canManageUsers
- **Params**: `id` (user ID)
- **Body**: `{ "role": "ADMIN" }`
- **Response**: Updated user

### PATCH /admin/users/:id/status
Activate/deactivate user
- **Permission**: canManageUsers
- **Params**: `id` (user ID)
- **Body**: `{ "isActive": true }`
- **Response**: Updated user

### GET /admin/anonymous-users
List anonymous participants
- **Permission**: canManageUsers
- **Query**: `offset`, `limit`, `search`, `status`
- **Response**: Anonymous user list

---

## Content Management

### GET /admin/messages
List messages
- **Permission**: canModerateContent
- **Query**:
  - `offset`, `limit`
  - `search` (content search)
  - `type` (message type)
  - `period` (today | week | month)
- **Response**: Message list with attachments

### GET /admin/communities
List communities
- **Permission**: canManageCommunities
- **Query**:
  - `offset`, `limit`
  - `search` (name, identifier, description)
  - `isPrivate` (true | false)
- **Response**: Community list with counts

### GET /admin/translations
List translations
- **Permission**: canManageTranslations
- **Query**:
  - `offset`, `limit`
  - `sourceLanguage`, `targetLanguage`
  - `period` (today | week | month)
- **Response**: Translation list

### GET /admin/share-links
List share links
- **Permission**: canManageConversations
- **Query**:
  - `offset`, `limit`
  - `search` (linkId, identifier, name)
  - `isActive` (true | false)
- **Response**: Share link list

---

## Ranking Criteria by Entity Type

### Users
- `messages_sent` - Most messages sent
- `reactions_given` - Most reactions given
- `reactions_received` - Most reactions received on their messages
- `mentions_received` - Most mentioned by others
- `mentions_sent` - Mentions others most
- `replies_received` - Most replies to their messages
- `conversations_joined` - Most conversations
- `communities_created` - Created most communities
- `share_links_created` - Created most share links
- `friend_requests_sent` - Sent most friend requests
- `friend_requests_received` - Received most friend requests
- `calls_initiated` - Started most calls
- `call_participations` - Participated in most calls
- `files_shared` - Shared most files
- `reports_sent` - Filed most reports
- `reports_received` - Most reports against them
- `most_referrals_via_affiliate` - Most referrals via affiliate
- `most_referrals_via_sharelinks` - Most referrals via share links
- `most_contacts` - Most friend connections
- `most_tracking_links_created` - Created most tracking links
- `most_tracking_link_clicks` - Most clicks on their tracking links

### Conversations
- `message_count` - Most messages
- `member_count` - Most members
- `reaction_count` - Most reactions
- `recent_activity` - Most recent activity
- `files_shared` - Most files shared
- `call_count` - Most calls

### Messages
- `most_reactions` - Most reactions
- `most_replies` - Most replies
- `most_mentions` - Most mentions

### Links
- `tracking_links_most_visited` - Most total clicks
- `tracking_links_most_unique` - Most unique clicks
- `share_links_most_used` - Most uses
- `share_links_most_unique_sessions` - Most unique sessions

---

## Error Codes

- **400** - Invalid input data
- **401** - Authentication required
- **403** - Insufficient permissions
- **404** - Resource not found
- **500** - Internal server error

---

## Examples

### Get top message senders in last 30 days
```
GET /admin/ranking?entityType=users&criterion=messages_sent&period=30d&limit=10
```

### Search users by email
```
GET /admin/users?search=user@example.com
```

### Get analytics for last week
```
GET /admin/analytics?period=7d
```

### Update user to MODERATOR role
```
PATCH /admin/users/123456/role
Body: { "role": "MODERATOR" }
```

### Get most active conversations
```
GET /admin/ranking?entityType=conversations&criterion=message_count&period=all&limit=20
```
