# Admin Dashboard + Editable Language Selector — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the original language editable when editing a message (webapp), and create a monitoring dashboard page for gateway health & analytics.

**Architecture:** Feature 1 transforms the read-only language badge in EditMessageView into a DropdownMenu, threading the selected language through the callback chain to the REST API (which already handles retranslation). Feature 2 adds a Live tab to the existing agent admin page and creates a new /admin/monitoring page consuming existing gateway endpoints.

**Tech Stack:** Next.js 15, shadcn/ui (DropdownMenu, Tabs, Card), Recharts, Tailwind CSS, Lucide icons

---

## Feature 1: Editable Language Selector in EditMessageView

### Task 1: Update EditMessageView — Add language dropdown

**Files:**
- Modify: `apps/web/components/common/bubble-message/EditMessageView.tsx`

**Context:** The language badge at line 322-337 is a read-only `<Badge>`. The `onSave` callback only passes `(messageId, content)`. The parent chain uses `selectedInputLanguage` from the composer state instead of the message's actual `originalLanguage` — this is incorrect.

**Step 1: Update onSave signature to include language**

In `EditMessageView.tsx`, update the `EditMessageViewProps` interface (line 17-29):

```typescript
interface EditMessageViewProps {
  message: Message & {
    originalLanguage: string;
    translations?: any[];
    originalContent: string;
  };
  isOwnMessage: boolean;
  onSave: (messageId: string, newContent: string, originalLanguage: string) => Promise<void> | void;
  onCancel: () => void;
  isSaving?: boolean;
  saveError?: string;
  conversationId?: string;
}
```

**Step 2: Add selectedLanguage state**

After `const [content, setContent]` (line 41), add:

```typescript
const [selectedLanguage, setSelectedLanguage] = useState(message.originalLanguage || 'fr');
```

Import `SUPPORTED_LANGUAGES` from `@meeshy/shared`:

```typescript
import { getLanguageInfo, SUPPORTED_LANGUAGES } from '@meeshy/shared/types';
```

**Step 3: Replace Badge with DropdownMenu**

Replace the desktop language badge (lines 322-337) with:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <button className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/10",
      isOwnMessage
        ? "border-blue-700 dark:border-blue-300 text-blue-900 dark:text-blue-100 bg-white/50 dark:bg-white/10"
        : "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-400"
    )}>
      <span>{selectedLanguageInfo.flag}</span>
      {selectedLanguageInfo.code.toUpperCase()}
      <ChevronDown className="h-3 w-3 opacity-50" />
    </button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto w-48">
    {SUPPORTED_LANGUAGES.filter(l => l.supportsTranslation).map(lang => (
      <DropdownMenuItem
        key={lang.code}
        onClick={() => setSelectedLanguage(lang.code)}
        className={cn(selectedLanguage === lang.code && "bg-accent")}
      >
        <span className="mr-2">{lang.flag}</span>
        <span className="flex-1 truncate">{lang.nativeName || lang.name}</span>
        <span className="text-xs text-muted-foreground ml-1">{lang.code.toUpperCase()}</span>
      </DropdownMenuItem>
    ))}
  </DropdownMenuContent>
</DropdownMenu>
```

Update the `selectedLanguageInfo` derivation to use `selectedLanguage` state:

```typescript
const selectedLanguageInfo = getLanguageInfo(selectedLanguage);
```

Add imports:

```typescript
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
```

**Step 4: Thread language through onSave**

In `handleSave` (around line 160), change:

```typescript
// Before
onSave(message.id, content.trim());

// After
onSave(message.id, content.trim(), selectedLanguage);
```

**Step 5: Update hasChanges to detect language change**

Update the `hasChanges` logic to include language change:

```typescript
const originalContent = message.originalContent || message.content;
const hasContentChanges = content.trim() !== originalContent.trim();
const hasLanguageChanges = selectedLanguage !== (message.originalLanguage || 'fr');
const hasChanges = hasContentChanges || hasLanguageChanges;
```

Remove the `setHasChanges` state and use a computed value instead.

**Step 6: Apply same dropdown to mobile view**

The mobile view also has a language badge (around line 229). Apply the same DropdownMenu pattern there.

---

### Task 2: Update parent chain to thread language

**Files:**
- Modify: `apps/web/components/common/BubbleMessage.tsx` (line 177-186)
- Modify: `apps/web/hooks/use-stream-messages.ts` (line 60-74)
- Modify: `apps/web/components/common/bubble-stream-page.tsx` (line 585)

**Step 1: Update BubbleMessage handleSaveEdit**

In `BubbleMessage.tsx`, update `handleSaveEdit` (line 177-186):

```typescript
const handleSaveEdit = useCallback(async (messageId: string, newContent: string, originalLanguage: string) => {
  try {
    await onEditMessage?.(messageId, newContent, originalLanguage);
    exitMode();
  } catch (error) {
    toast.error(t('failedToUpdateMessage'));
    throw error;
  }
}, [onEditMessage, exitMode, t]);
```

Update the `onEditMessage` prop type in the component's interface to accept the third parameter:

```typescript
onEditMessage?: (messageId: string, newContent: string, originalLanguage: string) => Promise<void>;
```

**Step 2: Update useStreamMessages handleEditMessage**

In `use-stream-messages.ts`, update `handleEditMessage` (line 60-74):

```typescript
const handleEditMessage = useCallback(async (messageId: string, newContent: string, originalLanguage: string) => {
  try {
    await messageService.editMessage(conversationId, messageId, {
      content: newContent,
      originalLanguage,  // now comes from EditMessageView, not composer state
    });
    await refreshMessages();
    toast.success(tCommon('messages.messageModified'));
  } catch (error) {
    console.error('Edit message error:', error);
    toast.error(tCommon('messages.editError'));
    throw error;
  }
}, [conversationId, refreshMessages, tCommon]);
```

Note: `selectedInputLanguage` is removed from the dependency array since we no longer use it here.

**Step 3: Commit**

```bash
git add apps/web/components/common/bubble-message/EditMessageView.tsx \
  apps/web/components/common/BubbleMessage.tsx \
  apps/web/hooks/use-stream-messages.ts
git commit -m "feat(web): editable language selector in message edit view"
```

---

## Feature 2: Admin Dashboard Enhancements

### Task 3: Add Live State tab to Agent page

**Files:**
- Create: `apps/web/components/admin/agent/AgentLiveTab.tsx`
- Modify: `apps/web/app/admin/agent/page.tsx` (add 5th tab)
- Modify: `apps/web/services/agent-admin.service.ts` (add getLiveState method)

**Step 1: Add getLiveState to agent-admin service**

In `agent-admin.service.ts`, add:

```typescript
async getLiveState(conversationId: string): Promise<ApiResponse<AgentLiveState>> {
  try {
    const response = await apiService.get(`/admin/agent/configs/${conversationId}/live`);
    return response;
  } catch (error) {
    console.error('Error fetching agent live state:', error);
    throw error;
  }
}
```

**Step 2: Create AgentLiveTab component**

Create `apps/web/components/admin/agent/AgentLiveTab.tsx`:

- Conversation ID input (text field + Load button)
- Once loaded, display 4 cards:
  - **Activity** — activityScore gauge, controlled users list
  - **Tone Profiles** — table of user profiles with tone, confidence, locked status
  - **Summary** — LLM-generated conversation summary, topics, dominant tone
  - **Agent History** — last 10 agent messages with timestamps
- Use existing shadcn Card, Badge, Progress components
- Color scheme: indigo accents (consistent with agent page)

**Step 3: Add 5th tab to agent page**

In `apps/web/app/admin/agent/page.tsx`, add dynamic import:

```typescript
const AgentLiveTab = dynamic(() => import('@/components/admin/agent/AgentLiveTab'), {
  loading: () => <SectionLoader />,
});
```

Add tab trigger and content:

```tsx
<TabsTrigger value="live">Live</TabsTrigger>
// ...
<TabsContent value="live"><AgentLiveTab /></TabsContent>
```

**Step 4: Commit**

```bash
git add apps/web/components/admin/agent/AgentLiveTab.tsx \
  apps/web/app/admin/agent/page.tsx \
  apps/web/services/agent-admin.service.ts
git commit -m "feat(admin): add live state tab to agent page"
```

---

### Task 4: Create Monitoring page — Real-time tab

**Files:**
- Create: `apps/web/app/admin/monitoring/page.tsx`
- Create: `apps/web/services/monitoring.service.ts`
- Modify: `apps/web/components/admin/AdminLayout.tsx` (add nav item)

**Step 1: Create monitoring service**

Create `apps/web/services/monitoring.service.ts`:

```typescript
import { apiService } from './api.service';

export const monitoringService = {
  async getRealtime() {
    return apiService.get('/admin/analytics/realtime');
  },
  async getHealth() {
    return apiService.get('/health/ready');
  },
  async getMetrics() {
    return apiService.get('/health/metrics');
  },
  async getCircuitBreakers() {
    return apiService.get('/health/circuit-breakers');
  },
  async getKpis(period: '7d' | '30d' | '90d' = '7d') {
    return apiService.get('/admin/analytics/kpis', { period });
  },
  async getVolumeTimeline() {
    return apiService.get('/admin/analytics/volume-timeline');
  },
  async getLanguageDistribution() {
    return apiService.get('/admin/analytics/language-distribution');
  },
  async getUserDistribution() {
    return apiService.get('/admin/analytics/user-distribution');
  },
  async getHourlyActivity() {
    return apiService.get('/admin/analytics/hourly-activity');
  },
  async getMessageTypes(period: '24h' | '7d' | '30d' = '7d') {
    return apiService.get('/admin/analytics/message-types', { period });
  },
};
```

**Step 2: Create monitoring page with 3 tabs**

Create `apps/web/app/admin/monitoring/page.tsx` with:

```
<AdminLayout currentPage="/admin/monitoring">
  <Tabs defaultValue="realtime">
    <TabsList>
      <TabsTrigger value="realtime">Temps réel</TabsTrigger>
      <TabsTrigger value="health">Santé</TabsTrigger>
      <TabsTrigger value="metrics">Métriques</TabsTrigger>
    </TabsList>
    ...
  </Tabs>
</AdminLayout>
```

**Real-time tab content:**
- Gradient header: `from-cyan-600 to-slate-600`
- Auto-refresh toggle (30s interval via `setInterval`)
- 4 stat cards: Users en ligne, Messages/heure, Conversations actives, Connexions Socket.IO
- Hourly activity sparkline chart (Recharts AreaChart)

**Health tab content:**
- DB Latency card with color-coded status (green <100ms, yellow <500ms, red >500ms)
- Redis ping status
- Heap usage progress bar with percentage
- Circuit breakers table: service name, state badge (closed=green, open=red, half-open=yellow), failure count, last failure time

**Metrics tab content:**
- KPI period selector (7d/30d/90d)
- KPI cards: engagement rate, growth rate, messages/user, active user rate
- Volume timeline (Recharts LineChart — messages + unique authors over 7 days)
- Language distribution (Recharts PieChart / DonutChart)
- User distribution (Recharts BarChart — very active/active/occasional/inactive)
- Message types breakdown (Recharts BarChart with percentages)

**Step 3: Add monitoring to AdminLayout navigation**

In `AdminLayout.tsx`, add to `navigationItems` array (after the Agent IA entry):

```typescript
{ icon: Activity, label: 'Monitoring', href: '/admin/monitoring', permission: 'canAccessAdmin' },
```

Add to page title mapping:

```typescript
{currentPage === '/admin/monitoring' && 'Monitoring'}
```

Import `Activity` from `lucide-react`.

**Step 4: Commit**

```bash
git add apps/web/app/admin/monitoring/page.tsx \
  apps/web/services/monitoring.service.ts \
  apps/web/components/admin/AdminLayout.tsx
git commit -m "feat(admin): add monitoring page with realtime, health, and metrics tabs"
```

---

### Task 5: Final polish and visual refinement

**Files:**
- All files from Tasks 1-4

**Step 1: Review all components with frontend-design skill**

Apply the frontend-design aesthetic guidelines:
- Ensure monitoring charts use distinctive color palettes (not generic)
- Add subtle animations for stat cards (number counting up on load)
- Health status indicators should pulse when critical
- Language dropdown should have smooth open/close transition

**Step 2: Responsive verification**

Test all components at mobile breakpoints:
- EditMessageView dropdown should work on mobile (already has mobile view)
- Monitoring page should stack cards vertically on mobile
- Agent Live tab should collapse to single-column

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: polish admin dashboard and language selector UI"
```

---

## Summary

| Task | Feature | Scope |
|------|---------|-------|
| 1 | Language dropdown in EditMessageView | Frontend only (backend ready) |
| 2 | Thread language through parent chain | Fix callback signatures |
| 3 | Agent Live State tab | New component + service method |
| 4 | Monitoring page (3 tabs) | New page + service + nav item |
| 5 | Visual polish | Animations, responsive, design quality |

**Dependencies:** Task 1 → Task 2 (sequential). Tasks 3, 4 are independent of each other and of 1-2.
