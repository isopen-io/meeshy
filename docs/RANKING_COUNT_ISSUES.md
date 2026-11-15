# Admin Ranking - Remaining _count.select Issues

## Problem
Prisma does NOT support `where` clauses inside `_count.select`. This causes incorrect counts (often returning 1 or not filtering by date period).

## Fixed Criteria ✅
- [x] mentions_received (commit 31c437a5)
- [x] mentions_sent (commit 31c437a5)
- [x] conversations_joined (commit 31c437a5)

## Remaining Broken Criteria ⚠️

These 20 criteria still use the invalid `_count.select.{relation}.where` pattern:

### User Rankings
1. **reactions_given** - Line ~1525
2. **communities_created** - Line ~1542
3. **share_links_created** - Line ~1559
4. **friend_requests_sent** - Line ~1806
5. **friend_requests_received** - Line ~1827
6. **calls_initiated** - Line ~1848
7. **call_participations** - Line ~1869
8. **files_shared** - Line ~1890

### Message Rankings  
9. **reactions_received** - Line ~1576
10. **replies_received** - Line ~1593
11. **most_referrals_via_affiliate** - Line ~1911

### Conversation Rankings
12. **most_tracking_links_created** - Line ~2145
13. **message_count** - Line ~2162
14. **reaction_count** - Line ~2179
15. **call_count** - Line ~2196

### Message Detailed Rankings
16. **most_reactions** - Line ~2515
17. **most_replies** - Line ~2532
18. **most_mentions** - Line ~2549

## Solution Pattern

### BEFORE (Broken):
```typescript
_count: {
  select: {
    relationName: {
      where: period !== 'all' ? { createdAt: { gte: startDate } } : {}
    }
  }
}
```

### AFTER (Fixed):
```typescript
relationName: {
  where: period !== 'all' ? { createdAt: { gte: startDate } } : {},
  select: { id: true }
}
// Then in mapping:
count: user.relationName.length
```

## Next Steps
1. Apply the same fix pattern to all 20 remaining criteria
2. Test each criterion with different period filters
3. Verify counts are correct in production

## Testing
After fixing, test each criterion with:
- period=all (should count all)
- period=today (should count only today)
- period=week (should count last 7 days)
- period=month (should count last 30 days)
