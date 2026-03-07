# Design: Admin Dashboard + Language Edit on Message

**Date**: 2026-03-07
**Status**: Approved

## Feature 1: Editable Language Selector in EditMessageView

### Problem
When editing a message, the original language is displayed as a read-only badge.
Users cannot correct a wrong language detection, which means retranslations use
the wrong source language.

### Solution
Transform the static `<Badge>` in `EditMessageView` into a clickable `<DropdownMenu>`
(Radix, already in project). User selects the correct language before saving.

### Flow
1. Badge becomes clickable → opens DropdownMenu with supported languages
2. User selects language → local `selectedLanguage` state updates, badge reflects change
3. On save → `PUT /conversations/:id/messages/:messageId` with `{ content, originalLanguage }`
4. Gateway deletes existing translations, triggers `_processRetranslationAsync`

### Backend
No changes needed. The REST endpoint already accepts `originalLanguage` in body
and handles retranslation.

### Files to modify
- `apps/web/components/common/bubble-message/EditMessageView.tsx` — Badge → DropdownMenu

---

## Feature 2: Admin Dashboard (Agent + Gateway Monitoring)

### Problem
No UI exists to configure the AI agent, monitor its state, or view gateway health
and analytics. Configuration requires direct DB/API calls.

### Solution
Two admin pages in the existing `/admin` section:

#### Page 1: `/admin/agent` — Agent Configuration & Control

| Tab | Content | Endpoint |
|-----|---------|----------|
| Configurations | List AgentConfigs, enable/disable, edit | `GET/PUT/DELETE /api/v1/admin/agent/configs` |
| LLM | Provider, model, temperature, maxTokens, budget | `GET/PUT /api/v1/admin/agent/llm` |
| Archetypes | Built-in archetype catalog | `GET /api/v1/admin/agent/archetypes` |
| Live | Real-time state for selected conversation | `GET /api/v1/admin/agent/configs/:id/live` |

#### Page 2: `/admin/monitoring` — Gateway Health & Analytics

| Tab | Content | Endpoint |
|-----|---------|----------|
| Real-time | Online users, messages/hour, Socket.IO connections | `/admin/analytics/realtime` + `/health/metrics` |
| Health | Circuit breakers, heap usage, DB/Redis latency | `/health/ready` + `/health/circuit-breakers` |
| Metrics | KPIs, volume timeline, language/user distribution (Recharts) | `/admin/analytics/*` |

### Access Control
- BIGBOSS + ADMIN roles only (existing middleware + AdminLayout guard)

### Design
- Consistent with existing admin pages (gradient headers, shadcn Cards, Tabs)
- Agent pages: indigo/violet gradient
- Monitoring pages: slate/cyan gradient
- Charts: Recharts (already used in analytics)

### Files to create
- `apps/web/app/admin/agent/page.tsx`
- `apps/web/app/admin/monitoring/page.tsx`
- `apps/web/services/agent-admin.service.ts` (API client for agent endpoints)
