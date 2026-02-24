# Message Detail Sheet & Reactions Design

**Date**: 2026-02-22
**Status**: Approved

## Overview

Refactor the iOS `MessageOverlayMenu` into a simplified overlay + a new `MessageDetailSheet` component. The sheet consolidates all message-related actions (reactions, report, delete, forward, language, info) into navigable tabs within a modern glassmorphism sheet. The (+) button opens the sheet on the "React" tab. Long deep press opens the sheet on the "Language" tab.

## Architecture

### Two-Level Interaction Model

**Level 1: Simplified Overlay (long press)**
- 5 most-used emojis (via `EmojiUsageTracker`) + (+) button
- Message preview (center)
- Quick action buttons row: Reply, Copy, Pin (horizontal capsules)
- (+) button dismisses overlay, opens `MessageDetailSheet` on `.react` tab

**Level 2: MessageDetailSheet (sheet presentation)**
- Opened via: (+) button, long deep press, tap on reaction pills, any action button in app
- `initialTab` parameter allows opening on any specific tab
- Modern glassmorphism design with `.ultraThinMaterial`

### Tab Order

| # | Tab | ID | Icon | Condition |
|---|-----|----|------|-----------|
| 1 | Langue | `.language` | `globe` | Always |
| 2 | Vues | `.views` | `eye.fill` | Always |
| 3 | Reactions | `.reactions` | `heart.circle` | Always |
| 4 | Reagir | `.react` | `face.smiling` | Always |
| 5 | Signaler | `.report` | `exclamationmark.triangle` | Always |
| 6 | Supprimer | `.delete` | `trash` | isMe OR admin/moderator role |
| 7 | Transferer | `.forward` | `arrowshape.turn.up.forward` | Always |
| 8 | Sentiment | `.sentiment` | `brain.head.profile` | If message has text |
| 9 | Transcription | `.transcription` | `waveform` | If message has audio/video |
| 10 | Meta | `.meta` | `info.circle` | Always |

### Opening Flows

| Trigger | Opens | Initial Tab |
|---------|-------|-------------|
| Long press on message | Simplified overlay | N/A |
| Long deep press on message | Sheet directly | `.language` |
| (+) button in emoji bar | Sheet | `.react` |
| Tap on reaction pills on bubble | Sheet | `.reactions` |
| Info button in overlay | Sheet | `.views` |
| Any explicit tab request in app | Sheet | Specified tab |

## Tab Details

### Tab "Reactions" (NEW)

Sub-tabs for filtering reactions:
- **"Toutes" (All)**: Chronological list of all users with their emoji and timestamp
- **Per-emoji sub-tabs**: Filter by reaction type, shows `emoji + count` as label

Each row shows: user avatar + username + emoji (in "All" tab) + relative date.

Backend enrichment required: `GET /api/reactions/:messageId` must return user details (username, avatar).

**Response shape (enriched):**
```typescript
{
  reactions: [
    {
      emoji: string,
      count: number,
      users: [
        { userId: string, username: string, avatar?: string, createdAt: string }
      ]
    }
  ]
}
```

### Tab "Reagir" (React)

- Top row: 5 most recently used emojis (large, tappable)
- Below: Full emoji picker (embedded `EmojiPickerView`, not as sheet)
- On emoji tap: calls `onReact(emoji)`, dismisses sheet

### Tab "Signaler" (Report)

Migrated from `ReportMessageSheet` content. Same form: report type selection + optional details + submit button. No NavigationStack wrapper.

### Tab "Supprimer" (Delete)

Confirmation view:
- Animated trash icon
- "Supprimer ce message ?" text
- Two buttons: Cancel (dismiss) / Delete (red, confirms)
- Visible if `message.isMe` OR user has admin/moderator role in conversation

### Tab "Transferer" (Forward)

Migrated from `ForwardPickerSheet` content. Search bar + conversation list + send button per conversation. No NavigationStack wrapper.

### Existing Tabs (migrated from overlay)

- **Langue**: Language detection + translation grid (currently `languageTabContent`)
- **Vues**: Delivery status with sender info (currently `viewsTabContent`)
- **Sentiment**: NLP analysis gauge (currently `sentimentTabContent`)
- **Transcription**: Audio/video transcription (currently `transcriptionTabContent`)
- **Meta**: Technical info (currently `metaTabContent`)

## Sheet Header Design

Fixed header above tabs:
```
┌─────────────────────────────────────┐
│  ─── (drag handle)                   │
│                                      │
│  👤 @username · 14 fev 22:30        │
│  "Message preview text trunca..."    │
└─────────────────────────────────────┘
```

- User avatar (miniature) + sender name + relative date
- Message content preview (1-2 lines, truncated)
- Glassmorphism background

## Backend Changes

### Enriched Reactions Endpoint

**File**: `services/gateway/src/routes/reactions.ts` (or `ReactionService.ts`)

`GET /api/reactions/:messageId` response change:
- Current: `{ emoji: string, count: number }[]`
- New: `{ emoji: string, count: number, users: { userId: string, username: string, avatar?: string, createdAt: string }[] }[]`

Implementation: Join reaction records with user collection to fetch username and avatar.

## SDK Changes

### New Models

**File**: `packages/MeeshySDK/Sources/MeeshySDK/Models/`

```swift
struct ReactionDetail: Codable, Identifiable {
    let userId: String
    let username: String
    let avatar: String?
    let createdAt: Date
    var id: String { userId }
}

struct ReactionGroup: Codable, Identifiable {
    let emoji: String
    let count: Int
    let users: [ReactionDetail]
    var id: String { emoji }
}
```

### Bug Fix: includesMe

**File**: `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift`

In `APIMessage.toMessage()`: use `currentUserReactions` to set `userId` on matching reactions so `includesMe` works correctly after REST load.

## Files to Create/Modify

### New Files
- `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift` - Main sheet component with all tabs

### Modified Files
- `apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift` - Simplify to 5 emojis + preview + quick actions
- `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift` - Tap on reaction pills opens sheet on `.reactions`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` - Wire up sheet presentation with `initialTab`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` - Add `fetchReactionDetails()` method
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift` - Fix `includesMe` bug
- `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift` - Add `ReactionDetail`, `ReactionGroup`
- `services/gateway/src/routes/reactions.ts` - Enrich GET endpoint
- `services/gateway/src/services/ReactionService.ts` - Add user lookup in aggregation
