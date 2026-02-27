# Meeshy iOS Mega Feature Set — Design Document

> **Date**: 2026-02-25
> **Scope**: 5 parallel implementation plans covering ~25 features
> **Method**: Parallel git worktrees with specialized agents, full SWE lifecycle per plan
> **Prerequisite**: Each agent audits codebase coherence before starting implementation

---

## Design Decisions Summary

| Feature | Decision | Rationale |
|---------|----------|-----------|
| /join/:id flow | Rich preview (avatar, banner, stats, members) + 2 CTAs | Match backend response, premium UX |
| Communities | Full (CRUD + roles + invitations + feed + stories integration) | Schema + types already complete |
| Stories editor | Instagram-like (stickers, fonts, drawing, carousel, video, POST<>STORY switch) | Flagship feature, reuse existing editors |
| Location sharing | Interactive map in bubble + live location sharing | Full MapKit integration |
| Transcription | Local Apple Speech sent with message + server Whisper refinement | Instant feedback, no segments |
| Voice cloning | Wizard multi-step + profile management, global consent (no per-conversation) | Complete backend API exists |
| Stats | Full page with timeline, badges, export (GDPR) | Leverage admin endpoints + new user-facing |
| Notifications | Full list view (18 types) with contextual rendering | Backend complete, iOS missing |
| Affiliates | Create tokens, share links, view stats on iOS | Backend + web complete |

---

## Plan 1: Deep Links + Join Flow + Conversation Management

### Scope
- Universal links (apple-app-site-association)
- /join/:id with rich preview screen
- Anonymous join flow with dynamic form
- Authenticated join with account preview
- Leave conversation
- Add participant to conversation
- Create/manage share links
- Friend invitation + accept/reject
- Notification deep link routing

### Architecture

**New files — MeeshySDK:**
- `Services/ShareLinkService.swift` — CRUD share links, join, validate
- `Services/FriendService.swift` — send/accept/reject/list friend requests
- `Models/ShareLinkModels.swift` — ShareLink, AnonymousForm, JoinResponse, LinkPermissions
- `Models/FriendModels.swift` — FriendRequest, FriendRequestStatus

**New files — MeeshyUI:**
- `JoinFlow/JoinLinkPreviewView.swift` — rich preview (banner, avatar, title, description, members, stats)
- `JoinFlow/AnonymousJoinFormView.swift` — dynamic form respecting link constraints
- `JoinFlow/JoinFlowViewModel.swift` — state machine: loading > preview > form|join > chat

**Modified files — iOS App:**
- `Navigation/DeepLinkRouter.swift` — add joinLink(id:), notification(id:), community(id:) cases
- `MeeshyApp.swift` — handle universal links via onOpenURL, route all deep link types
- `Views/ConversationListView.swift` — "+" menu: new conversation, new community, join via link
- `Components/ConversationInfoSheet.swift` — add leave, create link, add participant actions

**Backend:**
- `apps/web/public/.well-known/apple-app-site-association` — universal links config
- Verify/fix all link endpoints work correctly with iOS client

### Join Flow State Machine
```
URL received
    |
    v
[Loading] -- fetch GET /anonymous/link/:id
    |
    v
[Preview Screen]
  - Banner image (if available)
  - Avatar + conversation title
  - Description
  - Member count + online count
  - Creator name
  - Link permissions summary
  |
  +-- User authenticated?
  |     YES: Show "Rejoindre en tant que @username" button
  |           + "Rejoindre en anonyme" secondary button
  |     NO:  Show "Se connecter / S'inscrire" button
  |           + "Rejoindre en anonyme" button
  |
  v
[Authenticated Join] --> POST /links/:id/join --> navigate to conversation
[Anonymous Join] --> [Dynamic Form] --> POST /anonymous/join/:id --> navigate to chat
```

### Dynamic Form Fields (based on link.require* flags)
- requireNickname: true → firstName + lastName + auto-generated username
- requireEmail: true → email field
- requireBirthday: true → date picker
- language selector always present
- All validations client-side + server-side

---

## Plan 2: Communities

### Scope
- Restore + enhance backend community routes
- SDK models + service
- iOS views: list, detail, create, settings, members, invite
- Empty state with CTA
- Community preferences (pin, mute, archive)
- Feed communautaire (posts visibility: COMMUNITY)
- Invitation links for communities
- Integration in "+" menu and "See all" from search

### Architecture

**Backend:**
- Restore `services/gateway/src/routes/communities.ts.backup` → `communities.ts`
- Verify/complete CRUD: create, get, list, update, delete, join, leave
- Add: invite member, manage roles, list members, remove member
- Add: community invitation link (reuse share link pattern)
- Verify community-preferences.ts routes active and complete

**New files — MeeshySDK:**
- `Services/CommunityService.swift` — CRUD, join, leave, invite, members, roles
- `Models/CommunityModels.swift` — Community, CommunityMember, CommunityRole, CommunityPermissions, CommunityPreferences

**New files — MeeshyUI:**
- `Community/CommunityListView.swift` — list with search, empty state
- `Community/CommunityDetailView.swift` — header (banner, avatar, name), conversations, members, posts
- `Community/CommunityCreateView.swift` — name, description, avatar, banner, privacy toggle
- `Community/CommunitySettingsView.swift` — edit info, manage roles, danger zone (delete)
- `Community/CommunityMembersView.swift` — list, invite, remove, role management
- `Community/CommunityInviteView.swift` — generate/share invitation link

**Modified files — iOS App:**
- `Views/ConversationListView.swift` — "+" menu includes "Nouvelle communaute"
- `ViewModels/GlobalSearchViewModel.swift` — "See all" routes to CommunityListView
- `Views/FeedView.swift` — filter by community (visibility: COMMUNITY)

### Permission Matrix (from shared types)
| Permission | ADMIN | MODERATOR | MEMBER |
|-----------|-------|-----------|--------|
| Invite Members | Yes | Yes | No |
| Remove Members | Yes | Yes | No |
| Edit Community | Yes | No | No |
| Delete Community | Yes | No | No |
| Moderate Content | Yes | Yes | No |
| Manage Roles | Yes | No | No |
| Create Conversations | Yes | Yes | Yes |
| Edit Conversations | Yes | Yes | No |

---

## Plan 3: Stories Premium + Post Composer

### Scope
- Story composer with full editor (stickers, fonts, drawing, filters, music)
- Multi-slide carousel stories
- POST <> STORY type switching in unified composer
- In-app video recording for stories
- Drawing/annotation overlay (PencilKit)
- Reuse existing ImageEditorView, AudioPlayerView
- Verify backend story endpoints work correctly
- Socket.IO real-time story events

### Architecture

**New files — MeeshyUI:**
- `Story/StoryComposerView.swift` — main composer with media picker + camera
- `Story/StoryCanvasView.swift` — layered canvas (background, media, text, stickers, drawing)
- `Story/StoryTextEditorView.swift` — text input with font style, color, position, size
- `Story/FontStylePicker.swift` — bold, neon, typewriter, handwriting preview + selection
- `Story/StickerPickerView.swift` — emoji grid, drag to canvas, pinch/rotate gestures
- `Story/DrawingOverlayView.swift` — PencilKit canvas overlay for annotation
- `Story/StoryFilterPicker.swift` — vintage, bw, warm, cool, dramatic (reuse image editor filters)
- `Story/StoryMusicPicker.swift` — audio selection + trim for background music
- `Story/StorySlideManager.swift` — multi-slide management (add, remove, reorder)
- `Story/UnifiedPostComposer.swift` — POST|STORY|STATUS toggle, shared media pipeline

**New files — MeeshySDK:**
- `Models/StoryComposerModels.swift` — StorySlide, StoryCanvas, StickerItem, TextLayer, DrawingLayer
- Extend `Services/PostService.swift` — createStory with storyEffects, multi-media

**Modified files — iOS App:**
- `Views/FeedView.swift` — FAB or header button routes to UnifiedPostComposer
- `Views/StoryTrayView.swift` — "+" button routes to StoryComposerView
- `ViewModels/StoryViewModel.swift` — create/publish story with effects
- `ViewModels/FeedViewModel.swift` — handle new story creation callback

### StoryEffects JSON Structure (matches backend)
```json
{
  "background": "#hex | gradient:from,to | image_url",
  "textStyle": "bold | neon | typewriter | handwriting",
  "textColor": "#hex",
  "textPosition": { "x": 0.0-1.0, "y": 0.0-1.0 },
  "textSize": 24,
  "textAlign": "center | left | right",
  "textBg": "#hex | null",
  "audioUrl": "url",
  "audioDuration": 5000,
  "linkUrl": "url",
  "linkPreview": { "title": "", "description": "", "image": "", "domain": "" },
  "filter": "vintage | bw | warm | cool | dramatic | null",
  "stickers": [{ "emoji": "star", "x": 0.5, "y": 0.3, "scale": 1.2, "rotation": 15 }]
}
```

---

## Plan 4: Location + Transcription + Voice Cloning

### Scope
- Location message type: static + live sharing
- Interactive map in message bubbles
- Fullscreen map with directions
- Local transcription via Apple Speech Framework
- Transcription sent with audio/video message payload
- Discreet transcription display under bubbles
- Server Whisper refinement (replaces local if better)
- Voice cloning wizard (consent, registration, management)
- Voice profile CRUD

### Architecture — Location

**Backend:**
- Add message type `location` support in message creation
- New Socket.IO events: `location:share-live`, `location:update`, `location:stop`
- Store coordinates in message (latitude, longitude, address, isLive, expiresAt)
- Extend message schema if needed (or use existing geoLocation + new fields)

**New files — MeeshySDK:**
- `Services/LocationService.swift` — send location message, start/stop live sharing
- `Models/LocationModels.swift` — LocationMessage, LiveLocationSession, Coordinates

**New files — MeeshyUI:**
- `Location/LocationMessageView.swift` — map thumbnail in bubble (150pt), pin, address
- `Location/LocationFullscreenView.swift` — fullscreen map, directions button, close
- `Location/LiveLocationBadge.swift` — indicator "En direct - Xe restantes"

**Modified files:**
- `LocationPickerView.swift` — add "Partager en direct" option with duration picker
- `ConversationView+MessageRow.swift` — render LocationMessageView for type location
- `ConversationViewModel.swift` — send location message, manage live location updates
- `MessageSocketManager.swift` — handle location:update, location:stop events

### Architecture — Transcription

**New files — MeeshySDK:**
- `Services/TranscriptionService.swift` — Apple Speech Framework wrapper (SFSpeechRecognizer)
- Permission request, transcribe audio file, transcribe live stream

**Modified files:**
- `Models/MessageModels.swift` — add `transcription: String?` to send payload
- `ConversationViewModel.swift` — transcribe before send, attach to message
- `ThemedMessageBubble+Media.swift` — discreet expandable transcription text under audio/video

**UI Pattern — Transcription Display:**
- Small text under audio bubble: "Transcription" label + first line
- Tap to expand full transcription
- Subtle animation, respects theme colors
- No segments, no timestamps (as specified)

### Architecture — Voice Cloning

**New files — MeeshySDK:**
- `Services/VoiceProfileService.swift` — consent CRUD, register profile, delete (GDPR)
- `Models/VoiceProfileModels.swift` — VoiceConsent, VoiceProfile, VoiceProfileStats

**New files — MeeshyUI:**
- `Voice/VoiceProfileWizardView.swift` — multi-step: explain > consent > age verify > record > confirm
- `Voice/VoiceRecordingView.swift` — 10s+ recording with waveform visualization
- `Voice/VoiceProfileManageView.swift` — listen sample, re-record, usage stats, delete
- `Voice/VoiceConsentView.swift` — explicit checkboxes with legal text

**Modified files:**
- `Views/SettingsView.swift` — add "Profil vocal" section
- First audio send trigger: prompt wizard if no consent

---

## Plan 5: Notifications + Stats + Affiliates + Search + Finalization

### Scope
- Notification list view (18 types, contextual rendering)
- User stats page (timeline, badges, export)
- Backend: new user-facing stats endpoints
- Affiliate management on iOS
- Global search API corrections
- Thread view (dedicated reply thread)
- Contact share in messages
- Remaining empty states
- Final coherence check

### Architecture — Notifications

**New files — MeeshyUI:**
- `Notifications/NotificationListView.swift` — grouped list (today, this week, older)
- `Notifications/NotificationRowView.swift` — icon + actor + action + preview per type
- `Notifications/NotificationListViewModel.swift` — fetch, mark read, delete, pagination

**New files — MeeshySDK:**
- `Services/NotificationService.swift` — list, markRead, markAllRead, delete, stats
- `Models/NotificationModels.swift` — Notification, NotificationType enum (18 cases)

### Architecture — Stats

**Backend:**
- New endpoints: `GET /users/me/stats` — aggregated personal stats
- `GET /users/me/stats/timeline` — daily activity over 7/30 days
- `GET /users/me/stats/achievements` — computed badges

**New files — MeeshySDK:**
- `Services/StatsService.swift` — fetch personal stats, timeline, achievements
- `Models/StatsModels.swift` — UserStats, StatTimeline, Achievement, AchievementType

**New files — MeeshyUI:**
- `Stats/UserStatsView.swift` — sections: account, messages, conversations, translations
- `Stats/StatsTimelineChart.swift` — SwiftUI Charts for 7/30 day activity
- `Stats/AchievementBadgeView.swift` — badge rendering with unlock animation
- `Stats/DataExportView.swift` — GDPR data export request

### Architecture — Affiliates

**New files — MeeshySDK:**
- `Services/AffiliateService.swift` — create token, list tokens, get stats
- `Models/AffiliateModels.swift` — AffiliateToken, AffiliateRelation, AffiliateStats

**New files — MeeshyUI:**
- `Affiliate/AffiliateView.swift` — list tokens, create, share, stats per token
- `Affiliate/AffiliateCreateView.swift` — name, maxUses, expiration
- `Affiliate/AffiliateStatsView.swift` — referrals, conversions, timeline

### Architecture — Search Corrections
- Audit `GlobalSearchViewModel.swift` API calls vs backend endpoints
- Ensure conversations search uses `GET /conversations/search`
- Ensure users search uses `GET /users/search`
- Ensure messages search uses `GET /conversations/:id/messages/search`
- Add community search tab connecting to `GET /communities/search`

### Architecture — Remaining Items
- `ThreadView.swift` — dedicated view showing all replies to a parent message
- Contact share: `ContactMessageView.swift` — render contact card in bubble
- Empty states: FeedView, CommunityListView, NotificationListView, StatsView

---

## Worktree Strategy

### Branch Naming
```
feat/plan1-deeplinks-join-flow
feat/plan2-communities
feat/plan3-stories-composer
feat/plan4-location-transcription-voice
feat/plan5-notifications-stats-finalization
```

### File Ownership (NO overlap between worktrees)

| Worktree | Owns exclusively |
|----------|-----------------|
| Plan 1 | DeepLinkRouter, JoinFlow/*, ShareLinkService, FriendService, apple-app-site-association |
| Plan 2 | Community/*, CommunityService, communities.ts route, community-preferences.ts |
| Plan 3 | Story/*, StoryComposer*, UnifiedPostComposer, DrawingOverlay, StickerPicker, FontStylePicker |
| Plan 4 | Location/*, Voice/*, TranscriptionService, LocationService, VoiceProfileService |
| Plan 5 | Notifications/*, Stats/*, Affiliate/*, ThreadView, ContactMessageView, DataExportView |

### Shared files (touch carefully, last merger resolves)
- `MeeshyApp.swift` — Plan 1 (deep links) is primary owner
- `ConversationListView.swift` — Plan 1 (menu "+") is primary owner
- `SettingsView.swift` — Plan 4 (voice) and Plan 5 (stats) share; Plan 5 merges last
- `ConversationView+MessageRow.swift` — Plan 4 (location) is primary owner
- `ThemedMessageBubble+Media.swift` — Plan 4 (transcription) is primary owner
- `GlobalSearchViewModel.swift` — Plan 5 is primary owner
- `FeedView.swift` — Plan 2 (community filter) and Plan 3 (composer) share; Plan 3 merges last
- `project.pbxproj` — managed by LAST worktree to merge only

### Merge Order
1. Plan 1 (deep links) — foundational navigation
2. Plan 2 (communities) — new domain, minimal overlap
3. Plan 4 (location + transcription + voice) — message layer extensions
4. Plan 3 (stories) — heaviest UI, depends on feed structure
5. Plan 5 (notifications + stats + finalization) — final pass, coherence check

### Verification
- Each agent runs `./apps/ios/meeshy.sh build` in its worktree
- After all merges: clean build from main
- Final agent (Plan 5) performs full integration coherence check

---

## Coherence Checks (per agent, before implementation)

Each agent MUST verify before coding:
1. **Schema coherence** — Prisma models match what they need
2. **API coherence** — Gateway endpoints exist and return expected shape
3. **Type coherence** — Shared types match SDK models match iOS models
4. **Zod coherence** — Validation schemas match request/response shapes
5. **Permission coherence** — User role checks implemented at API + SDK + UI levels
6. **Design coherence** — New views follow existing MeeshyUI design system (ThemedColors, spacing, typography)
7. **Navigation coherence** — New screens integrate into existing navigation stack
