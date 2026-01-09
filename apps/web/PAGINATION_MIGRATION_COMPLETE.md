# Pagination Migration Complete: page/pageSize → offset/limit

## Summary

All webapp pagination has been migrated from `page/pageSize` to `offset/limit` to align with the backend API changes.

## Files Modified

### 1. Type Definitions
- **`/apps/web/types/notification-v2.ts`**
  - ✅ Updated `NotificationPaginationOptions` interface: `page: number` → `offset: number`
  - ✅ Updated `NotificationPaginatedResponse` interface: removed `page` and `totalPages`, changed to `offset`

### 2. Services
- **`/apps/web/services/notifications-v2.service.ts`**
  - ✅ Updated `fetchNotifications()` method to use `offset` instead of `page`
  - ✅ Updated API query parameters: `params.set('page', ...)` → `params.set('offset', ...)`
  - ✅ Fixed error fallback pagination object to use `offset: 0` instead of `page: 1`

### 3. Stores
- **`/apps/web/stores/notification-store-v2.ts`**
  - ✅ Updated `fetchNotifications()` to convert between page-based UI and offset-based API
  - ✅ Updated all calls to use `offset: 0` instead of `page: 1`
  - ✅ Updated `fetchMore()` to calculate correct offset: `offset: state.page * STORE_CONFIG.PAGE_SIZE`

### 4. Validators
- **`/apps/web/utils/socket-validator.ts`**
  - ✅ Updated `validateNotificationResponse()` Zod schema
  - ✅ Changed pagination validation from `page` to `offset`
  - ✅ Removed `totalPages` validation

## Admin Pages Status

All 9 admin pages were already correctly implemented with `offset/limit`:
- ✅ `/apps/web/app/admin/users/page.tsx`
- ✅ `/apps/web/app/admin/share-links/page.tsx`
- ✅ `/apps/web/app/admin/messages/page.tsx`
- ✅ `/apps/web/app/admin/anonymous-users/page.tsx`
- ✅ `/apps/web/app/admin/communities/page.tsx`
- ✅ `/apps/web/app/admin/translations/page.tsx`
- ✅ `/apps/web/app/admin/reports/page.tsx` (uses mock data)
- ✅ `/apps/web/app/admin/invitations/page.tsx` (uses mock data)
- ✅ `/apps/web/app/admin/audit-logs/page.tsx` (uses mock data)

All admin pages use the pattern: `const offset = (currentPage - 1) * pageSize;`

## Files NOT Modified (Explained)

### Type Definitions (Legacy/Unused)
- **`/apps/web/services/messages.service.ts`** - Line 36: `MessagesResponse` interface has `page: number` but this is only for legacy response mapping, not used in actual API calls
- **`/apps/web/services/users.service.ts`** - Line 25: `SearchUsersResponse` interface has `page: number` but is unused
- **`/apps/web/services/groups.service.ts`** - Lines 27, 37: `GroupFilters` and `GroupsResponse` interfaces have `page` but no actual API calls use them

### Documentation Files
- `/apps/web/services/api.service.ts` - Lines 237-242: Example comments showing `page: 1` usage
- `/apps/web/PAGINATION_FIX_VERIFICATION.md` - Test documentation with `?page=2` examples

### Test Fixtures
- `/apps/web/__tests__/fixtures/calls.ts` - Mock data for video call tests (unrelated to pagination)

## Migration Pattern

The migration follows this pattern:

### Before (page-based):
```typescript
const page = 1;
const limit = 20;
apiService.get(`/endpoint?page=${page}&limit=${limit}`);
```

### After (offset-based):
```typescript
const page = 1;  // UI tracking
const limit = 20;
const offset = (page - 1) * limit;
apiService.get(`/endpoint?offset=${offset}&limit=${limit}`);
```

## API Response Changes

### Before:
```typescript
{
  data: [...],
  pagination: {
    page: 2,
    limit: 20,
    total: 100,
    totalPages: 5,
    hasMore: true
  }
}
```

### After:
```typescript
{
  data: [...],
  pagination: {
    offset: 20,
    limit: 20,
    total: 100,
    hasMore: true
  }
}
```

## Verification

Run these commands to verify no remaining page/pageSize patterns:

```bash
# Check for API calls with page/pageSize (should return no results)
grep -r "apiService\.(get|post)" apps/web/services/ | grep -E "page|pageSize"

# Check for URL parameters with page/pageSize (should only show docs/tests)
grep -rn "[\?&](page|pageSize)=" apps/web/ --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=__tests__

# Check admin service pagination (should show offset/limit)
grep -A 5 "PaginationParams" apps/web/services/admin.service.ts
```

## Testing Checklist

- [ ] Test notification infinite scroll
- [ ] Test admin user pagination
- [ ] Test admin share-links pagination
- [ ] Test admin messages pagination
- [ ] Test admin anonymous-users pagination
- [ ] Test admin communities pagination
- [ ] Test admin translations pagination
- [ ] Verify socket.io notification responses validate correctly
- [ ] Verify API error responses with empty pagination

## Notes

- The frontend UI still tracks `page` numbers for user experience (page 1, 2, 3...)
- The conversion to `offset` happens at the service/API layer
- This allows the UI to remain intuitive while the API uses efficient offset-based pagination
- Legacy interface definitions remain for backward compatibility but are not actively used

---

**Migration completed on:** 2026-01-09
**Migrated by:** Claude Code Assistant
