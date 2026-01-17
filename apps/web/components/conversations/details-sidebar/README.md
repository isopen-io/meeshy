# Conversation Details Sidebar - Refactored

This directory contains the refactored conversation details sidebar components, split from the monolithic `conversation-details-sidebar.tsx` (1576 lines) into focused, maintainable modules.

## Architecture

### Hooks (Business Logic)

Located in `/apps/web/hooks/`:

- **`use-conversation-details.ts`** - Manages conversation name, description, and image editing state
- **`use-participant-management.ts`** - Handles participant permissions and removal
- **`use-conversation-stats.ts`** - Calculates language statistics and active users

### Components (UI)

Located in `/apps/web/components/conversations/details-sidebar/`:

#### Eager-loaded (Critical Path)
- **`DetailsHeader.tsx`** - Avatar and conversation name header
- **`DescriptionSection.tsx`** - Description editing for group conversations

#### Lazy-loaded (Below the Fold)
- **`ActiveUsersSection.tsx`** - List of active users with status
- **`ShareLinksSection.tsx`** - Share links management
- **`TagsManager.tsx`** - User-specific tags with autocomplete
- **`CategorySelector.tsx`** - User-specific category selection
- **`CustomizationManager.tsx`** - Custom name and reaction emoji

## Performance Optimizations

### Code Splitting
```typescript
const ActiveUsersSection = lazy(() =>
  import('./details-sidebar/ActiveUsersSection').then(m => ({ default: m.ActiveUsersSection }))
);
```

### Bundle Size Reduction
- **Original**: 1576 lines in single file
- **Refactored**:
  - Main component: ~400 lines
  - Average component: 150-300 lines
  - Total: Better tree-shaking and code splitting

### Lazy Loading Strategy
1. **Eager**: Header, Description (above the fold)
2. **Lazy**: Tags, Categories, Users, Links (below the fold)
3. **Suspense boundaries** for smooth loading experience

## File Structure

```
apps/web/
├── hooks/
│   ├── use-conversation-details.ts       (~150 lines)
│   ├── use-participant-management.ts     (~60 lines)
│   └── use-conversation-stats.ts         (~80 lines)
├── components/conversations/
│   ├── details-sidebar/
│   │   ├── index.ts                      (exports)
│   │   ├── DetailsHeader.tsx            (~120 lines)
│   │   ├── DescriptionSection.tsx       (~100 lines)
│   │   ├── ActiveUsersSection.tsx       (~80 lines)
│   │   ├── ShareLinksSection.tsx        (~40 lines)
│   │   ├── TagsManager.tsx              (~200 lines)
│   │   ├── CategorySelector.tsx         (~300 lines)
│   │   └── CustomizationManager.tsx     (~200 lines)
│   ├── ConversationDetailsSidebarRefactored.tsx  (~400 lines)
│   └── conversation-details-sidebar.tsx  (ORIGINAL - can be deprecated)
```

## Usage

### Import the refactored version

```typescript
import { ConversationDetailsSidebar } from '@/components/conversations/ConversationDetailsSidebarRefactored';

<ConversationDetailsSidebar
  conversation={conversation}
  currentUser={currentUser}
  messages={messages}
  isOpen={isOpen}
  onClose={onClose}
  onConversationUpdated={onConversationUpdated}
/>
```

### Migration Path

1. **Phase 1**: Test refactored version alongside original
2. **Phase 2**: Update imports in consuming components
3. **Phase 3**: Remove original file after verification

## Design Principles

### Single Responsibility
Each component has one clear purpose:
- `DetailsHeader` - Display and edit header
- `TagsManager` - Manage tags only
- `CategorySelector` - Manage categories only

### Separation of Concerns
- **Hooks**: State management, data fetching, business logic
- **Components**: UI rendering, user interaction
- **Services**: API calls (existing architecture)

### Performance First
- Lazy loading for non-critical sections
- Memoization in hooks via `useCallback`
- Optimistic UI updates
- Proper error boundaries

## Testing Considerations

Each component can now be tested independently:

```typescript
// Example: Testing TagsManager
import { render, screen, fireEvent } from '@testing-library/react';
import { TagsManager } from './TagsManager';

describe('TagsManager', () => {
  it('should add a new tag', async () => {
    // Test implementation
  });
});
```

## Accessibility

All components maintain WCAG 2.1 AA compliance:
- Proper ARIA labels
- Keyboard navigation
- Focus management
- Screen reader support

## Mobile Responsiveness

Responsive design maintained across all breakpoints:
- Mobile: Stack vertically, full width
- Tablet: Optimized spacing
- Desktop: Original sidebar width (320px)

## Future Enhancements

### Potential Optimizations
1. Virtual scrolling for large participant lists
2. Incremental static regeneration for share links
3. Service worker caching for offline support
4. WebSocket real-time updates for active users

### Extensibility
New sections can be added as lazy-loaded components:
```typescript
const NewSection = lazy(() => import('./NewSection'));

<Suspense fallback={<Loader />}>
  <NewSection {...props} />
</Suspense>
```

## Troubleshooting

### Lazy loading not working
- Check Suspense boundaries are properly placed
- Verify dynamic import syntax

### Performance regression
- Use React DevTools Profiler
- Check for unnecessary re-renders
- Verify useCallback dependencies

## Contributing

When adding new features:
1. Create focused component (<300 lines)
2. Extract business logic to hooks
3. Add lazy loading if below the fold
4. Update this README
5. Add tests

## License

Proprietary - Meeshy Project
