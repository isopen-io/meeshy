# Admin Users Pagination Fix - Verification Test Plan

## Fixes Applied

### CRITICAL Bugs Fixed
1. **Bug #1-3**: Query parameters not being passed to API - Fixed in `admin.service.ts`
   - Changed `apiService.get('/admin/users', { params })` → `apiService.get('/admin/users', params)`
   - Applied to: `getUsers()`, `getAnonymousUsers()`, `getMessages()`, `getCommunities()`, `getTranslations()`, `getShareLinks()`

2. **Documentation Added**: Added comprehensive JSDoc to `apiService.get()` method to prevent future bugs

## Test Scenarios

### Test Suite 1: Basic Pagination Navigation

#### Test 1.1: Navigate to Next Page
**Steps:**
1. Open admin users page: http://localhost:3000/admin/users
2. Wait for initial data load (should see 20 users by default)
3. Note the first user's email in the list
4. Click "Suivant" (Next) button
5. Wait for data to reload

**Expected Results:**
- ✅ Different users should appear (users 21-40)
- ✅ First user's email should be different from step 3
- ✅ Page indicator should show "2 / X"
- ✅ "Précédent" button should be enabled
- ✅ Browser network tab should show: `GET /api/admin/users?page=2&limit=20`

**Failure Indicators:**
- ❌ Same users appear
- ❌ Network request missing `?page=2` parameter
- ❌ Page shows "2 / X" but data is identical

#### Test 1.2: Navigate Back to Previous Page
**Steps:**
1. From page 2 (after Test 1.1)
2. Click "Précédent" (Previous) button
3. Wait for data to reload

**Expected Results:**
- ✅ Original users from page 1 should reappear
- ✅ Page indicator should show "1 / X"
- ✅ "Précédent" button should be disabled
- ✅ Browser network tab should show: `GET /api/admin/users?page=1&limit=20`

#### Test 1.3: Jump Multiple Pages
**Steps:**
1. Starting from page 1
2. Click "Suivant" 3 times rapidly (pages 2, 3, 4)
3. Observe each page load

**Expected Results:**
- ✅ Each click should fetch different data
- ✅ Page indicator progresses: 1 → 2 → 3 → 4
- ✅ No duplicate users across pages
- ✅ Network tab shows 3 requests with `?page=2`, `?page=3`, `?page=4`

---

### Test Suite 2: Page Size Changes

#### Test 2.1: Change Page Size from 20 to 50
**Steps:**
1. On page 1 with 20 users visible
2. Note the 20th user's email
3. Change page size dropdown from "20 par page" to "50 par page"
4. Wait for data reload

**Expected Results:**
- ✅ Should now show 50 users (if database has that many)
- ✅ 20th user from before should still be visible
- ✅ New users (21-50) should appear below
- ✅ Page indicator should recalculate total pages
- ✅ Network request: `GET /api/admin/users?page=1&limit=50`

**Failure Indicators:**
- ❌ Still showing only 20 users
- ❌ Network request has `limit=20` instead of `limit=50`

#### Test 2.2: Change Page Size from 50 to 100
**Steps:**
1. With page size = 50 on page 1
2. Change to "100 par page"
3. Wait for reload

**Expected Results:**
- ✅ Should show 100 users
- ✅ Previous 50 users still visible + 50 new users
- ✅ Network request: `GET /api/admin/users?page=1&limit=100`

#### Test 2.3: Page Size Change Resets to Page 1
**Steps:**
1. Navigate to page 3 (with page size = 20)
2. Change page size to 50
3. Observe behavior

**Expected Results:**
- ✅ Should automatically reset to page 1
- ✅ Shows first 50 users (not users 101-150)
- ✅ Page indicator shows "1 / X"
- ✅ Network request: `GET /api/admin/users?page=1&limit=50`

---

### Test Suite 3: Search Filtering with Pagination

#### Test 3.1: Search on Page 1
**Steps:**
1. Start on page 1 with no filters
2. Type a common search term (e.g., "test" or "admin") in search box
3. Wait 800ms for debounce
4. Observe results

**Expected Results:**
- ✅ Should show filtered results
- ✅ Should reset to page 1
- ✅ Total pages should recalculate based on filtered count
- ✅ Network request: `GET /api/admin/users?page=1&limit=20&search=test`

#### Test 3.2: Pagination with Active Search Filter
**Steps:**
1. With search filter active showing results
2. Note the first filtered user
3. Click "Suivant" to go to page 2 of filtered results
4. Observe results

**Expected Results:**
- ✅ Should show page 2 of FILTERED results (not all users)
- ✅ Different filtered users should appear
- ✅ Network request: `GET /api/admin/users?page=2&limit=20&search=test`

#### Test 3.3: Clear Search Returns to Full List
**Steps:**
1. With search filter active on page 2
2. Clear search box
3. Wait 800ms for debounce

**Expected Results:**
- ✅ Should reset to page 1
- ✅ Should show all users (unfiltered)
- ✅ Network request: `GET /api/admin/users?page=1&limit=20`

---

### Test Suite 4: Role and Status Filters with Pagination

#### Test 4.1: Apply Role Filter
**Steps:**
1. Select "Administrateur" from role dropdown
2. Wait for reload

**Expected Results:**
- ✅ Should show only admin users
- ✅ Should reset to page 1
- ✅ Network request: `GET /api/admin/users?page=1&limit=20&role=ADMIN`

#### Test 4.2: Combine Multiple Filters
**Steps:**
1. Set role = "Administrateur"
2. Set status = "Actif"
3. Type search = "john"
4. Wait for all to apply

**Expected Results:**
- ✅ Should show only active admin users matching "john"
- ✅ Should be on page 1
- ✅ Network request: `GET /api/admin/users?page=1&limit=20&search=john&role=ADMIN&status=active`

#### Test 4.3: Paginate Filtered Results
**Steps:**
1. With role filter = "USER" (should have many results)
2. Navigate to page 2
3. Observe results

**Expected Results:**
- ✅ Should show page 2 of filtered users
- ✅ Network request: `GET /api/admin/users?page=2&limit=20&role=USER`

---

### Test Suite 5: Edge Cases

#### Test 5.1: Last Page Behavior
**Steps:**
1. Navigate to the last page of users
2. Verify "Suivant" button is disabled
3. Try to click it (should do nothing)

**Expected Results:**
- ✅ "Suivant" button disabled
- ✅ Page indicator shows "X / X" (same number)
- ✅ No additional API calls when clicking disabled button

#### Test 5.2: Empty Results
**Steps:**
1. Apply a search filter that returns zero results (e.g., "zzzznonexistent")
2. Wait for results

**Expected Results:**
- ✅ Should show "Aucun utilisateur trouvé" message
- ✅ Pagination controls should not appear
- ✅ Network request: `GET /api/admin/users?page=1&limit=20&search=zzzznonexistent`

#### Test 5.3: Rapid Page Changes (Race Condition Test)
**Steps:**
1. Click "Suivant" button 5 times very rapidly
2. Observe final result after all requests complete

**Expected Results:**
- ✅ Should land on page 6 (not an intermediate page)
- ✅ Multiple API calls may be visible in network tab
- ✅ Final displayed data should match page 6
- ✅ No React state inconsistencies or errors in console

#### Test 5.4: Page Size Larger Than Total Results
**Steps:**
1. Apply a filter that returns 10 results
2. Change page size to 100

**Expected Results:**
- ✅ Should show all 10 results
- ✅ Pagination should show "1 / 1"
- ✅ Both navigation buttons disabled
- ✅ Network request: `GET /api/admin/users?page=1&limit=100&...`

---

### Test Suite 6: Anonymous Users Pagination (Same Bugs Fixed)

#### Test 6.1: Basic Anonymous Users Pagination
**Steps:**
1. Navigate to: http://localhost:3000/admin/anonymous-users
2. Click "Suivant" to go to page 2
3. Verify different data appears

**Expected Results:**
- ✅ Different anonymous users on page 2
- ✅ Network request: `GET /api/admin/anonymous-users?page=2&limit=20`

#### Test 6.2: Anonymous Users Page Size Change
**Steps:**
1. On anonymous users page
2. Change page size from 20 to 50
3. Verify more users appear

**Expected Results:**
- ✅ 50 anonymous users displayed
- ✅ Network request: `GET /api/admin/anonymous-users?page=1&limit=50`

---

### Test Suite 7: Browser DevTools Verification

#### Test 7.1: Network Request Inspection
**Steps:**
1. Open Chrome DevTools → Network tab
2. Filter for "admin/users"
3. Perform pagination actions
4. Inspect each request

**Verify:**
- ✅ Request URL includes correct query parameters
- ✅ No `?params=[object%20Object]` in URL
- ✅ Parameters are properly encoded: `?page=2&limit=20`
- ✅ Status code: 200 OK
- ✅ Response contains different `users[]` arrays

#### Test 7.2: Console Log Verification
**Steps:**
1. Open Chrome DevTools → Console tab
2. Perform pagination actions
3. Look for logs prefixed with `[Admin Users]`

**Verify:**
- ✅ "Appel API avec params" shows correct page/limit
- ✅ "Réponse API complète" shows different user data per page
- ✅ "Nombre d'utilisateurs" matches displayed count
- ✅ No error messages or warnings

#### Test 7.3: React DevTools State Inspection
**Steps:**
1. Install React DevTools browser extension
2. Select the AdminUsersPage component
3. Inspect state while paginating

**Verify:**
- ✅ `currentPage` state updates correctly
- ✅ `pageSize` state updates correctly
- ✅ `users` array changes when page changes
- ✅ `totalPages` recalculates correctly
- ✅ `loading` state toggles appropriately

---

## Regression Testing

### Verify These Still Work After Fixes

#### RT-1: Initial Page Load
- ✅ Page loads with first 20 users
- ✅ No errors in console
- ✅ Stats cards show correct counts

#### RT-2: Dashboard Stats Don't Break
- ✅ Total users count is accurate
- ✅ Active users percentage is correct
- ✅ Stats update independently of user list

#### RT-3: User Detail Navigation
- ✅ Clicking "Voir" button opens user detail page
- ✅ Works from any paginated page

#### RT-4: Filter Button
- ✅ "Filtrer" button still works
- ✅ Triggers re-fetch with current filters

---

## Performance Testing

### PT-1: Response Time Benchmarks
**Measure:**
- Page 1 load: Should be < 500ms
- Page navigation: Should be < 300ms
- Page size change: Should be < 500ms

**How to Test:**
Check Network tab → Timing for API request durations

### PT-2: No Duplicate Requests
**Verify:**
- Each pagination action triggers exactly ONE API call
- No rapid-fire duplicate requests
- Proper debouncing on search (800ms)

---

## Test Execution Checklist

Run tests in this order:

- [ ] Test Suite 1: Basic Pagination Navigation (1.1, 1.2, 1.3)
- [ ] Test Suite 2: Page Size Changes (2.1, 2.2, 2.3)
- [ ] Test Suite 3: Search Filtering (3.1, 3.2, 3.3)
- [ ] Test Suite 4: Role/Status Filters (4.1, 4.2, 4.3)
- [ ] Test Suite 5: Edge Cases (5.1, 5.2, 5.3, 5.4)
- [ ] Test Suite 6: Anonymous Users (6.1, 6.2)
- [ ] Test Suite 7: DevTools Verification (7.1, 7.2, 7.3)
- [ ] Regression Testing (RT-1 through RT-4)
- [ ] Performance Testing (PT-1, PT-2)

---

## Known Issues (Not Related to This Fix)

These are architectural issues identified during review but not blocking:

1. **Dashboard stats refetched unnecessarily** - See Issue #5 in review document
2. **Excessive console logging** - See Issue #9 in review document
3. **No rate limiting on admin endpoints** - See Issue #7 in review document

---

## Success Criteria

All tests above must pass with ✅. Any ❌ indicates the fix is incomplete.

**Critical Must-Haves:**
1. Page navigation (1→2→3) shows DIFFERENT data each time
2. Page size changes (20→50→100) shows MORE data each time
3. Network requests include correct `?page=X&limit=Y` parameters
4. No `params=[object Object]` in any URL
5. Filtered pagination works correctly

**Report Any Issues:**
- Screenshot of failing test
- Browser console errors
- Network tab request/response
- Steps to reproduce
