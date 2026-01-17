# Migration Guide: Conversation Details Sidebar

## Overview

This guide helps you migrate from the original `conversation-details-sidebar.tsx` to the refactored modular version.

## Breaking Changes

**None.** The refactored component maintains the exact same API and behavior.

## Step-by-Step Migration

### 1. Update Imports

#### Before
```typescript
import { ConversationDetailsSidebar } from '@/components/conversations/conversation-details-sidebar';
```

#### After
```typescript
import { ConversationDetailsSidebar } from '@/components/conversations/ConversationDetailsSidebarRefactored';
```

### 2. No Props Changes Required

The component interface remains identical:

```typescript
interface ConversationDetailsSidebarProps {
  conversation: Conversation;
  currentUser: User;
  messages: Message[];
  isOpen: boolean;
  onClose: () => void;
  onConversationUpdated?: (updatedConversation: Partial<Conversation>) => void;
}
```

### 3. Test Thoroughly

Run your existing tests - they should pass without modifications:

```bash
# Unit tests
npm test -- conversation-details

# E2E tests
npm run test:e2e -- --grep "conversation details"
```

## Files to Update

### Required Updates

1. **`apps/web/components/conversations/ConversationLayout.tsx`**
   ```typescript
   - import { ConversationDetailsSidebar } from './conversation-details-sidebar';
   + import { ConversationDetailsSidebar } from './ConversationDetailsSidebarRefactored';
   ```

2. **`apps/web/components/conversations/ConversationView.tsx`**
   ```typescript
   - import { ConversationDetailsSidebar } from './conversation-details-sidebar';
   + import { ConversationDetailsSidebar } from './ConversationDetailsSidebarRefactored';
   ```

### Optional Updates (if used elsewhere)

Search for imports:
```bash
grep -r "conversation-details-sidebar" apps/web/
```

## Rollback Plan

If issues arise, rollback is simple:

1. Revert imports back to original:
   ```typescript
   import { ConversationDetailsSidebar } from './conversation-details-sidebar';
   ```

2. The original file remains unchanged as a safety net

## Verification Checklist

After migration, verify:

- [ ] Sidebar opens/closes correctly
- [ ] Conversation name editing works
- [ ] Description editing works (group conversations)
- [ ] Tags can be added/removed
- [ ] Categories can be created/selected
- [ ] Custom name and reaction can be set
- [ ] Language statistics display correctly
- [ ] Active users list populates
- [ ] Share links section works (group conversations)
- [ ] Image upload works (for authorized users)
- [ ] Copy conversation ID works
- [ ] Performance is equivalent or better
- [ ] No console errors
- [ ] Mobile view renders correctly

## Performance Expectations

You should observe:

### Initial Load
- **Faster** - Critical components load first
- **Smoother** - Lazy sections load progressively

### Bundle Size
- **Smaller** - Better code splitting
- **More chunks** - 7 lazy-loaded components

### Runtime
- **Same or better** - Optimized re-renders
- **Memory efficient** - Components unmount when not visible

## Common Issues

### Issue: "Module not found" error

**Solution**: Ensure all new files exist:
```bash
ls -la apps/web/components/conversations/details-sidebar/
ls -la apps/web/hooks/use-conversation-*.ts
```

### Issue: Suspense boundary warnings

**Solution**: Ensure React version supports Suspense (18+):
```bash
npm list react
```

### Issue: Lazy loading not working

**Solution**: Check webpack/vite configuration supports dynamic imports:
```javascript
// next.config.js or vite.config.js should support code splitting
```

### Issue: Tests failing

**Solution**: Mock lazy imports in tests:
```typescript
jest.mock('./details-sidebar/ActiveUsersSection', () => ({
  ActiveUsersSection: () => <div>Mocked ActiveUsers</div>
}));
```

## Gradual Migration Strategy

For large codebases, migrate incrementally:

### Week 1: Parallel Testing
- Keep both versions
- Add feature flag
- Test refactored version in staging

```typescript
const useRefactoredSidebar = useFeatureFlag('refactored-sidebar');

return useRefactoredSidebar
  ? <ConversationDetailsSidebarRefactored {...props} />
  : <ConversationDetailsSidebar {...props} />;
```

### Week 2: Canary Release
- Enable for 10% of users
- Monitor metrics
- Gather feedback

### Week 3: Full Rollout
- Enable for all users
- Monitor for 48 hours
- Deprecate old version

### Week 4: Cleanup
- Remove original file
- Remove feature flag
- Update documentation

## Metrics to Monitor

Track these metrics during migration:

### Performance
- Initial load time
- Time to interactive
- Bundle size
- Lighthouse score

### Functionality
- Error rate
- User interactions
- API call patterns
- Console warnings

### User Experience
- User complaints
- Support tickets
- Session recordings
- User feedback

## Support

If you encounter issues:

1. Check this guide
2. Review README.md
3. Check component source code
4. Create GitHub issue with:
   - Error message
   - Steps to reproduce
   - Browser/environment details
   - Screenshots if applicable

## Success Criteria

Migration is successful when:

- [ ] All tests pass
- [ ] No new console errors
- [ ] Performance is maintained or improved
- [ ] User experience is identical
- [ ] Code is more maintainable
- [ ] Bundle size is reduced
- [ ] Team is familiar with new structure

## Next Steps

After successful migration:

1. Update team documentation
2. Share performance improvements
3. Consider similar refactorings for other large components
4. Update style guide with new patterns

## Timeline Estimate

- **Small project** (< 5 files): 1-2 hours
- **Medium project** (5-20 files): 1 day
- **Large project** (20+ files): 2-3 days + testing

## Questions?

Contact the frontend team or create a discussion in the project repository.
