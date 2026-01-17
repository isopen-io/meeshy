# Contacts Components

Modular, performant components for the contacts feature, refactored from a monolithic 1197-line file into a clean, maintainable architecture.

## Architecture

```
components/contacts/
├── ContactsList.tsx          # Main all-contacts view
├── ContactsSearch.tsx        # Search bar with invite button
├── ContactsStats.tsx         # Statistics grid (2x2)
├── ConversationDropdown.tsx  # Existing dropdown component
├── tabs/
│   ├── ConnectedContactsTab.tsx  # Connected friends view
│   ├── PendingRequestsTab.tsx    # Pending requests view
│   ├── RefusedRequestsTab.tsx    # Refused requests view
│   └── AffiliatesTab.tsx         # Affiliate relations view
├── index.ts                  # Barrel exports
└── README.md                 # This file
```

## Components

### ContactsList

Displays the main list of all users with ability to send friend requests and start conversations.

**Props:**
```typescript
interface ContactsListProps {
  users: User[];
  searchQuery: string;
  getUserDisplayName: (user: User) => string;
  formatLastSeen: (user: User) => string;
  getPendingRequestWithUser: (userId: string) => any | undefined;
  onSendRequest: (userId: string) => void;
  onCancelRequest: (requestId: string) => void;
  onStartConversation: (userId: string) => void;
  t: (key: string, params?: any) => string;
}
```

**Features:**
- ✅ Memoized with React.memo for performance
- ✅ Responsive design (mobile + desktop)
- ✅ Online status indicators
- ✅ Contextual actions dropdown
- ✅ Empty state handling

**Usage:**
```tsx
import { ContactsList } from '@/components/contacts';

<ContactsList
  users={displayedUsers}
  searchQuery={searchQuery}
  getUserDisplayName={getUserDisplayName}
  formatLastSeen={formatLastSeenWithT}
  getPendingRequestWithUser={getPendingRequestWithUser}
  onSendRequest={handleSendRequest}
  onCancelRequest={handleCancelRequest}
  onStartConversation={handleStartConversation}
  t={t}
/>
```

### ContactsSearch

Search input with invite button for finding users and inviting new contacts.

**Props:**
```typescript
interface ContactsSearchProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onInviteClick: () => void;
  t: (key: string) => string;
}
```

**Features:**
- ✅ Real-time search
- ✅ Debounced input (via parent)
- ✅ Responsive layout
- ✅ Accessible with ARIA labels

**Usage:**
```tsx
import { ContactsSearch } from '@/components/contacts';

<ContactsSearch
  searchQuery={searchQuery}
  onSearchChange={setSearchQuery}
  onInviteClick={() => setIsShareModalOpen(true)}
  t={t}
/>
```

### ContactsStats

Displays contact statistics in a 2x2 grid.

**Props:**
```typescript
interface ContactsStatsProps {
  stats: {
    total: number;
    connected: number;
    pending: number;
    affiliates: number;
  };
  t: (key: string) => string;
}
```

**Features:**
- ✅ Lightweight component
- ✅ Color-coded metrics
- ✅ Responsive grid

**Usage:**
```tsx
import { ContactsStats } from '@/components/contacts';

<ContactsStats stats={stats} t={t} />
```

### Tab Components

All tab components follow a consistent pattern:

#### ConnectedContactsTab
Shows accepted friend requests with conversation actions.

#### PendingRequestsTab
Shows pending friend requests with accept/reject actions.

#### RefusedRequestsTab
Shows rejected friend requests with option to resend.

#### AffiliatesTab
Shows users who joined via affiliate links.

**Common Features:**
- ✅ Lazy-loaded for optimal bundle size
- ✅ Memoized to prevent unnecessary re-renders
- ✅ Empty state handling
- ✅ Consistent UI patterns
- ✅ Suspense boundary support

**Usage:**
```tsx
import {
  ConnectedContactsTab,
  PendingRequestsTab,
  RefusedRequestsTab,
  AffiliatesTab
} from '@/components/contacts';

// In Suspense boundary
<Suspense fallback={<LoadingCard />}>
  {activeTab === 'connected' && (
    <ConnectedContactsTab
      friendRequests={filteredRequests.connected}
      currentUserId={user?.id}
      getUserDisplayName={getUserDisplayName}
      onStartConversation={handleStartConversation}
      t={t}
    />
  )}
</Suspense>
```

## Performance Optimizations

### 1. React.memo
All components are wrapped with `React.memo()` to prevent unnecessary re-renders:

```typescript
const ContactsList = React.memo<ContactsListProps>(({ ... }) => {
  // Component logic
});

ContactsList.displayName = 'ContactsList';
```

### 2. Lazy Loading
Components are lazy-loaded in the main page:

```typescript
const ContactsList = lazy(() => import('@/components/contacts/ContactsList'));
```

### 3. Suspense Boundaries
Each lazy-loaded component has its own Suspense boundary:

```tsx
<Suspense fallback={<LoadingCard />}>
  <ContactsList ... />
</Suspense>
```

### 4. Prop Stability
All callbacks are memoized with `useCallback` in the parent:

```typescript
const handleSendRequest = useCallback(async (userId: string) => {
  await sendFriendRequest(userId, loadFriendRequests);
}, [sendFriendRequest, loadFriendRequests]);
```

## Testing

All components are fully testable with React Testing Library:

```typescript
import { render, screen } from '@testing-library/react';
import ContactsList from '@/components/contacts/ContactsList';

describe('ContactsList', () => {
  it('renders contact cards', () => {
    render(<ContactsList users={mockUsers} ... />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });
});
```

## Accessibility

All components follow WCAG 2.1 AA standards:

- ✅ Semantic HTML
- ✅ ARIA labels for icon buttons
- ✅ Keyboard navigation support
- ✅ Focus management
- ✅ Screen reader friendly

## Dark Mode

All components support dark mode via Tailwind's `dark:` classes:

```tsx
<div className="bg-white dark:bg-gray-950">
  <h3 className="text-gray-900 dark:text-white">
    {getUserDisplayName(contact)}
  </h3>
</div>
```

## Internationalization

All text is i18n-ready via the `t` function prop:

```tsx
<h3>{t('messages.noContacts')}</h3>
<p>{t('messages.noContactsDescription')}</p>
```

## Future Enhancements

1. **Virtual Scrolling**: For lists with >100 items
2. **Optimistic Updates**: Instant UI feedback for actions
3. **Skeleton Loading**: Better loading states
4. **Infinite Scroll**: Load more contacts on scroll
5. **Bulk Actions**: Select multiple contacts

## Contributing

When adding new features:

1. Keep components focused (Single Responsibility)
2. Use TypeScript interfaces for props
3. Add React.memo for performance
4. Include empty state handling
5. Write unit tests
6. Update this README

## Related Files

- **Hooks**: `apps/web/hooks/use-contacts-*.ts`
- **Utils**: `apps/web/lib/contacts-utils.ts`
- **Page**: `apps/web/app/contacts/page.tsx`
- **Tests**: `apps/web/__tests__/hooks/use-contacts-*.test.ts`
