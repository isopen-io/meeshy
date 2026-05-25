# Meeshy iOS App - Comprehensive User-Facing Feature Inventory
## Android Port Reference & Checklist

**Last Updated:** May 18, 2026  
**Source:** Apps/iOS Reference Implementation (SwiftUI + MeeshyUI SDK)  
**Total Screens Identified:** 95+

---

## 1. AUTHENTICATION & ONBOARDING (15 screens)

### Entry Point & Registration
- [ ] **LoginView** - Email/phone login entry point
  - Primary user actions: Enter credentials, forgot password link, magic link fallback
  - UI Components: Email/phone field, password field, remember me checkbox, animated logo
  - Navigation entry: App launch (unauthenticated state)
  - Key behavior: Remember device option, password visibility toggle

- [ ] **OnboardingView** - Registration splash/intro
  - UI Components: Animated logo, CTA buttons (Get Started, Log In)
  - Navigation entry: Login flow, manual entry point
  - Key behavior: Swipeable intro screens with animations

- [ ] **OnboardingFlowView** - Multi-step wizard (8 steps)
  - Steps: Pseudo, Phone, Email, Identity, Password, Language, Profile, Recap
  - UI Components: Step progress bar, animated background per step, step-specific forms
  - Navigation: Back/Next buttons, conditional step skip validation
  - Key behavior: Step validation before advance, back navigation to previous steps

- [ ] **StepPseudoView** - Username entry
  - User actions: Enter username, check availability (real-time validation)
  - Validation: Required, character limit, uniqueness check
  
- [ ] **StepPhoneView** - Phone number entry
  - User actions: Enter with country code picker, request OTP
  - UI Components: Country picker, phone field with formatting
  - Key behavior: Automatic formatting, OTP verification

- [ ] **StepEmailView** - Email entry & verification
  - User actions: Enter email, verify with code/link
  - Validation: Email format, verification token
  - Key behavior: Resend email option, token expiry handling

- [ ] **StepIdentityView** - Name/identity info
  - Fields: First name, last name, bio/bio optional
  - UI Components: Text fields with character counters
  - Key behavior: Optional bio, auto-save drafts

- [ ] **StepPasswordView** - Password creation
  - UI Components: Password field, strength indicator, visibility toggle
  - Validation: Length, complexity (uppercase, lowercase, number, special)
  - Key behavior: Password strength indicator animation

- [ ] **StepLanguageView** - Language preference selection
  - User actions: Select from language list
  - UI Components: Language picker, list with flags/names
  - Key behavior: Default to device locale, searchable list

- [ ] **StepProfileView** - Avatar upload & bio
  - User actions: Take photo / upload from library, crop/edit
  - UI Components: Avatar preview, upload button, bio text area
  - Key behavior: Avatar cropping UI, optional bio

- [ ] **StepRecapView** - Review all data
  - User actions: Review entered data, edit any step, confirm submission
  - UI Components: All entered data displayed, edit buttons per field
  - Key behavior: Can tap any field to jump back and edit

- [ ] **EmailVerificationView** - Standalone email verification
  - User actions: Enter verification code, resend code
  - UI Components: Code input field, resend button with countdown
  - Navigation: From LoginView for magic link flow
  - Key behavior: OTP input, resend cooldown timer

- [ ] **MagicLinkView** - Passwordless login
  - User actions: Enter email, click link in email, auto-login
  - Key behavior: Deep link handling for magic links

- [ ] **TwoFactorSetupView** - 2FA configuration wizard
  - Steps: Enable 2FA, scan QR code, verify backup codes
  - UI Components: QR code display, code display, copy buttons
  - Key behavior: Backup codes generator, copy-to-clipboard

- [ ] **ChangePasswordView** - Password change in settings
  - User actions: Enter old password, new password, confirm
  - Validation: Old password verification, new password strength
  - Key behavior: Same strength indicator as onboarding

---

## 2. CONVERSATIONS LIST & OVERVIEW (12 screens)

### Main Conversation Hub
- [ ] **ConversationListView** - Primary messaging hub
  - Primary user actions: Tap to open conversation, swipe for quick actions, long-press for menu
  - UI Components: Conversation rows with avatar, name, last message preview, timestamp, unread badge
  - Navigation entry: Root tab after authentication
  - Key behavior: 
    - Real-time message arrival with badge increment
    - Swipe actions (archive, mute, delete) with animations
    - Search integration (filter as type)
    - Pull-to-refresh with skeleton loading
    - Ordered by last activity (smart sort with pinned support)
    - Optimistic updates for muted/archived states
    - Offline message queuing for unsent messages
    - Story tray at top (swipeable carousel)

- [ ] **ThemedConversationRow** - Individual conversation cell
  - Components: Avatar, conversation name, last message snippet, timestamp, badges (unread, typing, online)
  - Key behavior: Online status indicator, typing indicator animation, unread count badge

- [ ] **NewConversationView** - Create/start conversation
  - User actions: Search users, tap to create DM or group, start typing in compose
  - UI Components: Search field, contact/recent list, suggested contacts
  - Navigation: Sheet or modal from conversation list
  - Key behavior: 
    - Auto-complete user search with debounce
    - Recent contacts shortcuts
    - Group creation option visible here or separate screen

- [ ] **FriendRequestListView** - Pending friend requests
  - Primary user actions: Accept/decline friend request, view sender profile
  - UI Components: Request rows with sender avatar/name, action buttons
  - Key behavior: Optimistic accept/decline, list refresh on action

- [ ] **StoryTrayView** - Story carousel at top of conversation list
  - User actions: Swipe through stories, tap to view, long-press for menu
  - UI Components: Story thumbnails in horizontal scroll, add story button
  - Navigation: Tap opens StoryViewerView
  - Key behavior: Auto-advance between stories, progress indicators

- [ ] **GuestConversationContainer** - Wrapper for anonymous user flows
  - Navigation: When accessing conversation as guest/anonymous
  - Key behavior: Read-only mode, no compose capability

- [ ] **ConversationMediaGalleryView** - Shared media gallery
  - User actions: Browse shared media, tap to fullscreen, search/filter
  - UI Components: Grid of thumbnails, filter buttons (images/videos/files)
  - Navigation: Accessible from conversation info
  - Key behavior: Infinite scroll, lazy load thumbnails

- [ ] **ConversationMediaViews** - Helper components for media display
  - Components: Image/video previews, media type indicators

- [ ] **ConversationListHelpers** - Search & filtering components
  - Search field with debounced filtering
  - Recent searches history

- [ ] **ConversationListView+Rows** - Row rendering variants
  - Themed rows with different states (active, muted, archived)

- [ ] **ConversationListView+Overlays** - Context menus, sheets
  - Swipe action overlays, long-press menus

- [ ] **ConversationAnimatedBackground** - Animated gradient backgrounds
  - Dynamic background animations on conversation list

---

## 3. CONVERSATION / MESSAGES VIEW (35+ screens)

### Main Message Thread
- [ ] **ConversationView** - Core messaging screen
  - Primary user actions: 
    - Send text/media messages
    - React with emoji
    - Reply to specific message (threaded)
    - Forward message
    - Delete message
    - Long-press for context menu
    - Scroll to load older/newer messages
    - Typing indicators display
  - UI Components: 
    - Header with conversation info, action buttons, call buttons
    - Message list with varied bubble styles
    - Message composer at bottom
    - Floating action overlays (reactions, menu)
  - Navigation entry: Tap conversation from list
  - Key behaviors:
    - Real-time message arrival with scroll auto-jump behavior
    - Optimistic message sending (appears immediately)
    - Ephemeral/burn message countdown display
    - Message reactions bar display
    - Typing indicator animation ("User is typing...")
    - Online/offline status banner
    - Connection loss banner
    - Message selection mode (multi-select for batch delete/forward)
    - Swipe to reply gesture
    - Link previews in chat
    - Message translation display with language flags

- [ ] **MessageListView** - Message list container
  - Components: Scrollable message list, pagination controls
  - Key behavior: Lazy loading older messages, auto-scroll on new message

- [ ] **ThemedMessageBubble** - Individual message bubble
  - Components: Text, attachments, reactions, quote/reply context
  - Key behaviors:
    - Different styles for sent vs. received
    - Media attachment thumbnails
    - Emoji reactions bar
    - Threaded reply indicator
    - Ephemeral message countdown timer
    - Read receipts (checkmarks)
    - Burn effect animation
    - Blur reveal animation (for sensitive content preview)
    - Translation display with language flags
    - Link preview card

- [ ] **BubbleContent** - Message bubble data model
  - Components: Text, attachments, reactions, reply, translation metadata
  
- [ ] **BubbleStandardLayout** - Bubble layout orchestrator
  - Renders text, attachments, reactions, reply, secondary content conditionally

- [ ] **BubbleQuotedReply** - Quoted/replied-to message context
  - Shows context of message being replied to
  - Components: Sender name, quoted text snippet, media thumbnail

- [ ] **BubbleReactionsOverlay** - Emoji reactions bar
  - Components: Emoji buttons, reaction counts, add reaction button
  - User actions: Tap to add reaction, long-press for emoji picker
  - Key behavior: Auto-hide overflow reactions, show count

- [ ] **BubbleSecondaryContent** - Translation/language display
  - Components: Language flags, translated text in inline panel
  - User actions: Tap flag to toggle translation view
  - Key behavior: Color-coded language indicators, smooth reveal

- [ ] **BubbleAttachmentView** - Attachment display (media, files, location)
  - Components: Image/video thumbnails, file icons, location map preview
  - User actions: Tap to fullscreen/download
  - Key behavior: Download progress indicator, caching status

- [ ] **BubbleEphemeralLifecycle** - Burn/ephemeral message countdown
  - Components: Timer display, burn animation
  - Key behavior: Auto-delete visual effect, countdown timer

- [ ] **BubbleBlurRevealLifecycle** - Sensitive content blur & reveal
  - Components: Blurred content, tap-to-reveal button
  - Key behavior: Blur effect, reveal animation, re-blur option

- [ ] **BubbleLanguageFlagController** - Language indicator UI
  - Components: Flag buttons for original + translated languages
  - Key behavior: Flag selection, secondary content toggle

- [ ] **BubbleMetaBadges** - Status badges (read receipts, timestamp)
  - Components: Checkmark icons, timestamp, "edited" badge
  - Key behavior: Animated checkmark appearance (sent → received → read)

- [ ] **UniversalComposerBar** - Message input area
  - Components: Text field, send button, attachment button, emoji/sticker buttons
  - User actions: Type message, attach media, send
  - Key behaviors:
    - Text placeholder changes based on context
    - Emoji picker integration
    - Attachment picker (camera, photos, files, location)
    - Voice message recording button (hold-to-record)
    - Typing indicator broadcast
    - Mentions auto-complete (@user trigger)
    - Scheduled message support (future send)

- [ ] **UniversalComposerBar+Attachments** - Attachment handling
  - Components: Photo picker, file picker, location picker, camera access
  - User actions: Select media type, grant permissions, confirm selection
  - Key behavior: Media preview before send, size validation

- [ ] **UniversalComposerBar+Recording** - Voice message recording
  - Components: Recording timer, waveform visualization, send/discard buttons
  - User actions: Hold to record, slide to discard, release to send
  - Key behavior: Waveform animation during recording, audio preview playback

- [ ] **LocationPickerView** - Location sharing
  - User actions: Allow location permission, share current location, select from map
  - Components: Map view, location search field, confirmation buttons
  - Key behavior: Current location auto-fill, map interaction

- [ ] **CameraView** - In-app camera for photo/video
  - User actions: Take photo/video, apply filters, retake, confirm
  - Components: Camera preview, capture button, filter selector
  - Key behavior: Flash toggle, front/rear camera switch, video recording

- [ ] **ImageEditView** - Photo editor
  - User actions: Crop, rotate, apply filters, draw, add stickers
  - Components: Image canvas, toolbar with edit tools
  - Key behavior: Touch gestures for manipulation, real-time preview

- [ ] **VideoPreviewView** - Video preview before send
  - Components: Video player, duration display, size info
  - User actions: Play preview, confirm/retake
  - Key behavior: Thumbnail generation, quality indicator

- [ ] **EffectsPickerView** - Message effects selector
  - User actions: Select animation effect (love, celebration, etc.)
  - Components: Effect preview buttons, animation samples
  - Key behavior: Effect preview, confirmation before send

- [ ] **MentionComposerController** - @mention auto-complete
  - Components: User list popup, filtered by typed text
  - User actions: Type @username, select from popup
  - Key behavior: Auto-complete insertion, mention badge in message

- [ ] **MentionSuggestionPanel** - Mention dropdown
  - Components: Scrollable user list with avatars and names
  - Key behavior: Filter as type, highlight selection

- [ ] **ConversationView+Composer** - Composer integration
  - Layout and state management for composer in conversation

- [ ] **ConversationView+Header** - Conversation header bar
  - Components: Conversation name, participant count, call buttons, info button
  - User actions: Tap to open conversation info, tap call to initiate call
  - Key behavior: Online status indicator, typing indicator

- [ ] **ConversationView+MessageRow** - Message row rendering
  - Row layout with bubble, timestamp, reactions

- [ ] **ConversationView+ScrollIndicators** - Scroll helper UI
  - Components: Jump-to-latest button, scroll progress indicator
  - Key behavior: Fade in/out on scroll

- [ ] **ConversationView+AttachmentHandlers** - Attachment logic
  - Photo picker, file picker, camera access handlers

- [ ] **MessageDetailSheet** - Message detail/actions overlay
  - Tabs: Info (timestamp, sender, read receipts), Reactions (emoji reactions list), Language (translation options)
  - User actions: Copy message, delete, report, forward, react, translate
  - Key behavior: Swipeable tabs, reaction emoji list

- [ ] **MessageOverlayMenu** - Context menu for messages
  - User actions: Reply, React, Forward, Copy, Edit, Delete, Report
  - Components: Popover menu with action buttons
  - Key behavior: Haptic feedback on select, gesture dismissal

- [ ] **ReportMessageSheet** - Message reporting
  - User actions: Select reason, add details, submit report
  - Components: Reason picker, text area, submit button
  - Key behavior: Confirmation after submit

- [ ] **MessageComposer** - Core message composition model
  - Manages text, attachments, metadata before send

---

## 4. THREADS / REPLY CONVERSATIONS (5 screens)

- [ ] **ThreadView** - Threaded replies view
  - Primary user actions: View replies to a message, reply in thread, view all replies
  - UI Components: Parent message, reply chain, thread composer
  - Navigation: Tap "Replies" or "Show more" on message
  - Key behavior: 
    - Auto-scroll to new replies
    - Typing indicators in thread
    - Real-time reply addition
    - Optimistic reply sending

- [ ] **ReplyThreadOverlay** - Floating thread indicator
  - Components: Reply count badge, tap indicator
  - Key behavior: Shows reply count, taps open thread

- [ ] **ReplyContextCleaner** - Thread context cleanup logic
  - Handles stale reply context removal

- [ ] **LoadMoreRepliesCell** - Load earlier replies
  - User actions: Tap to load more older replies
  - Key behavior: Pagination of replies

- [ ] **ReplyCell** - Individual reply in thread
  - Components: Message bubble, sender info
  - Key behavior: Same as main bubble but compact layout

---

## 5. STORIES (16+ screens)

### Story Creation & Viewing
- [ ] **StoryTrayView** - Story carousel at conversation list top
  - User actions: Swipe through stories, tap user story to view, tap "+" to create
  - UI Components: Story thumbnails in horizontal scroll, add button
  - Navigation: Tap story → StoryViewerView
  - Key behavior: 
    - Shows active stories from contacts
    - Progress indicators for multi-slide stories
    - Swipeable/draggable carousel
    - Story status (viewed/unviewed)

- [ ] **StoryViewerView** - Main story viewer
  - Primary user actions:
    - Swipe left/right to next/previous story
    - Tap left/right edges to navigate
    - Tap top to see story info/viewers
    - Long-press to pause
    - Tap right side for comments/reactions sheet
    - Tap export for video export
  - UI Components:
    - Story canvas (full screen)
    - Progress bar with slide indicators
    - Sidebar with reactions/stats
    - Story author info header
    - Reply/comment button
  - Navigation entry: Tap from story tray or conversation row
  - Key behaviors:
    - Auto-advance to next slide after duration
    - Tap-to-pause, resume on release
    - Keyboard navigation support
    - Haptic feedback on slide transition
    - Story marked as viewed
    - Reactions display with emoji
    - Comments sheet (async load)
    - Language-aware text rendering (Prisme Linguistique)

- [ ] **StoryViewerView+Canvas** - Story rendering canvas
  - Components: Video/image background, text overlays, stickers, effects rendering
  - Key behavior: Smooth media transitions, real-time text rendering

- [ ] **StoryViewerView+Content** - Story content display
  - Media player, effects layer composition

- [ ] **StoryViewerView+Sidebar** - Reactions & stats sidebar
  - Components: Emoji reactions, view count, like button
  - User actions: Add reaction, view reactions list
  - Key behavior: Real-time reaction count updates

- [ ] **StoryViewerContainer** - Wrapper for story viewer
  - Handles presentation and state management

- [ ] **StoryComposerView** - Story creation/editing canvas
  - Primary user actions:
    - Add background (image/video/color)
    - Add text, stickers, drawings
    - Adjust position/scale/rotation of elements
    - Preview story
    - Publish or schedule
  - UI Components:
    - Canvas (full screen)
    - Media picker
    - Text editor toolbar
    - Sticker picker
    - Drawing tool
    - Timeline for multi-slide stories
  - Navigation entry: Tap "+" in story tray or feed menu
  - Key behaviors:
    - Undo/redo support
    - Snap to grid on drag
    - Layer ordering (z-order)
    - Text formatting (font, color, alignment)
    - Filter effects preview
    - Multi-slide story support with timeline
    - Draft auto-save
    - Optimistic publish update
    - Offline queue if no connection

- [ ] **StoryComposerView+GranularSync** - Real-time collaboration for group stories
  - If supported, syncs edits in real-time

- [ ] **StoryTextEditorView** - In-canvas text editor
  - User actions: Edit text, change font, color, alignment
  - Components: Text input field, font picker, color picker
  - Key behavior: Live preview on canvas

- [ ] **TextEditToolOptions** - Text formatting toolbar
  - Components: Font selector, size slider, color picker, alignment buttons
  - Key behavior: Real-time canvas update

- [ ] **StoryFilterPickerView** - Filter selection
  - Components: Filter thumbnails with preview
  - User actions: Swipe or tap to select filter
  - Key behavior: Real-time preview on canvas

- [ ] **StoryFilterGridView** - Grid view of filters
  - All available filters displayed in grid

- [ ] **StickerPickerView** - Sticker/emoji selection
  - Components: Sticker grid, search/category tabs
  - User actions: Tap sticker to add to canvas
  - Key behavior: Recent stickers at top

- [ ] **DrawingOverlayView** - Freehand drawing tool
  - User actions: Draw on canvas, select color, adjust brush size
  - Components: Drawing canvas, color palette, brush size slider, undo/redo
  - Key behavior: Real-time drawing, smooth strokes, pressure sensitivity

- [ ] **StoryExportShareSheet** - Video export & sharing
  - User actions: Select language, format, quality, export, share via SMS/WhatsApp/AirDrop
  - Components: Language picker, format selector, export progress, share sheet
  - Navigation: From viewer export button (author-only)
  - Key behavior:
    - MP4 video generation (RAW → baked)
    - Format selection (resolution, quality)
    - Share via UIActivityViewController
    - Offline queue if needed
    - Progress indicator during export

- [ ] **StoryMediaLoader** - Media loading orchestrator
  - Handles lazy loading of story media

- [ ] **StorySlideManager** - Multi-slide story management
  - Handles slide transitions, ordering

- [ ] **StoryCanvasGuides** - Visual guides for composition
  - Grid overlays, safe area indicators

- [ ] **SlideMiniPreview** - Slide thumbnail in timeline
  - Components: Small preview of slide
  - Key behavior: Tap to select slide

---

## 6. FEED / POSTS (12 screens)

### Social Feed & Post Viewing
- [ ] **FeedView** - Main social feed
  - Primary user actions: Scroll feed, like/comment on posts, share post, create post
  - UI Components: Post cards (text/image/video/audio), author info, engagement metrics
  - Navigation entry: Feed tab or menu option
  - Key behaviors:
    - Infinite scroll with pagination
    - Swipe down pull-to-refresh
    - Like animation (heart burst)
    - Optimistic like/unlike
    - Comment count with "View all comments" button
    - Share menu for reposting
    - Post preview on link shares
    - Mute/report options per post
    - Real-time engagement updates (via socket)
    - Language-aware text (Prisme Linguistique)

- [ ] **FeedListView** - List container for feed
  - Components: Scrollable feed, pagination
  - Key behavior: Lazy loading, skeleton loaders

- [ ] **FeedListViewController** - UIViewController wrapper for feed
  - Used for complex UIKit integration if needed

- [ ] **FeedPostCard** - Individual post card
  - Components: Author avatar/name, timestamp, post content, media, like/comment counts, engagement buttons
  - User actions: Tap to view detail, like, comment, share, menu
  - Key behavior: Tap to open PostDetailView

- [ ] **FeedPostCard+Media** - Media rendering in post
  - Image gallery, video player, audio player

- [ ] **PostDetailView** - Full post detail screen
  - Primary user actions: View full post, read all comments, reply, like, share, report
  - UI Components: Full post content, comment thread, comment composer
  - Navigation: Tap post card
  - Key behaviors:
    - Comments thread display (nested replies support)
    - Real-time comment arrivals
    - Optimistic comment posting
    - @mention support in comments
    - Edit post (author-only)
    - Delete post (author-only)
    - Pin/unpin (community moderators)

- [ ] **CommentListView** - Comments section
  - Components: Comment threads, load more button
  - User actions: Tap reply, react, view replies
  - Key behavior: Infinite scroll comments

- [ ] **CommentListViewController** - UIViewController for complex comment rendering

- [ ] **TopLevelCommentCell** - Top-level comment rendering
  - Components: Author info, comment text, engagement, nested replies

- [ ] **FeedCommentsSheet** - Comments modal
  - Full-screen comments sheet accessed from feed card
  - Key behavior: Modal presentation, swipe to dismiss

- [ ] **PostTranslationSheet** - Post translation view
  - User actions: View post in different languages, select language
  - Components: Language tabs, translated content
  - Key behavior: Same as message translation (Prisme Linguistique)

- [ ] **AudioPostComposerView** - Create audio post
  - User actions: Record audio, name post, select privacy, publish
  - Components: Recording controls, duration display, waveform
  - Key behavior: Recording timer, playback preview

- [ ] **StatusComposerView** - Status/text post creation
  - User actions: Type status, add media, select privacy, publish
  - Components: Text area, media picker, privacy selector, publish button
  - Key behavior: Character counter, draft auto-save, privacy options

- [ ] **FeedView+Attachments** - Media attachment handling in feed composer
  - Components: Media picker, preview

---

## 7. COMMUNITY (8 screens)

### Community Features
- [ ] **CommunityListView** - Community directory/list
  - Primary user actions: Browse communities, tap to join/view, search communities
  - UI Components: Community cards (name, description, member count, join status)
  - Navigation entry: Communities tab or section in menu
  - Key behavior:
    - Browse/discover communities
    - Search with auto-complete
    - Suggested communities
    - Join/leave actions (optimistic)
    - Community categories/tags

- [ ] **CommunityDetailView** - Community hub/page
  - Primary user actions: View posts, members, info, leave/join, create post, manage (if mod)
  - UI Components: Community header (image, name, description), feed, members list, settings button
  - Navigation: Tap community card
  - Key behaviors:
    - Community rules/guidelines display
    - Member list with search
    - Community posts feed
    - Community settings (mods/admins only)
    - Leave community
    - Create post in community

- [ ] **CommunityCreateView** - Create new community
  - User actions: Name, description, avatar, rules, privacy setting, create
  - Components: Form fields, avatar picker, category selector
  - Navigation: From communities list menu
  - Key behavior: Validation, community auto-created

- [ ] **CommunityMembersView** - Community member list
  - Components: Member rows with roles, mod/kick actions (for mods)
  - User actions: View profile, remove member (mod), promote to mod
  - Key behavior: Search members, role badges

- [ ] **CommunitySettingsView** - Community administration
  - Components: Settings form, rules editor, privacy selector, member moderation tools
  - User actions: Update settings, edit rules, remove members, change owner
  - Navigation: From community detail (mods/admins)
  - Key behavior: Changes apply immediately

- [ ] **CommunityInviteView** - Invite members to community
  - User actions: Select users from list, send invites, generate invite link
  - Components: User list, selected count, send button, link copy button
  - Key behavior: Bulk invite, shareable invite link

- [ ] **CommunityLinksView** - Community invite links
  - User actions: View active links, create link, revoke link, copy/share
  - Components: Links list with creation date, use count
  - Key behavior: Link expiry options, max uses limit

- [ ] **CommunityLinkDetailView** - Single community link details
  - Components: Link info, QR code, use statistics
  - User actions: Copy, share, revoke, edit settings

---

## 8. AFFILIATE / SHARING LINKS (9 screens)

### Share Links, Tracking Links, Affiliate Links
- [ ] **ShareLinksView** - User's share links
  - Primary user actions: Create share link, view analytics, delete link, copy/share
  - UI Components: Links list with creation date, click count, stats button
  - Navigation entry: Settings > Links menu
  - Key behavior:
    - Infinite scroll/pagination
    - Link preview on hover/tap
    - Copy to clipboard
    - Share link via SMS/email
    - View click analytics

- [ ] **CreateShareLinkView** - Create new share link
  - User actions: Select content (profile, post, etc.), customize URL slug, set expiry, create
  - Components: Content selector, URL customizer, expiry picker, create button
  - Navigation: Sheet from ShareLinksView
  - Key behavior: Slug availability check (debounced), URL preview

- [ ] **ShareLinkDetailView** - View share link analytics
  - Components: Link info, click count, last clicked timestamp, geographic/device stats
  - User actions: Copy, share, delete, edit expiry
  - Navigation: Tap link from list
  - Key behavior: Real-time click updates, export stats

- [ ] **TrackingLinksView** - Affiliate/tracking links
  - Primary user actions: Create tracking link, view performance, manage affiliates
  - UI Components: Links list with commission info, clicks, conversions
  - Navigation entry: Settings > Affiliate section
  - Key behavior:
    - Real-time click/conversion tracking
    - Commission calculation display
    - Payout status
    - Link performance comparison

- [ ] **CreateTrackingLinkView** - Create tracking link
  - User actions: Select destination URL, customize slug, set attributes, create
  - Components: URL input, slug customizer, tag selector, create button
  - Navigation: Sheet from TrackingLinksView
  - Key behavior: Real-time URL validation, slug availability check

- [ ] **TrackingLinkDetailView** - Tracking link analytics
  - Components: Link stats (clicks, conversions, commission), charts
  - User actions: Copy link, share, edit, pause/reactivate
  - Navigation: Tap link from list
  - Key behavior: Time-range selector for stats, export CSV

- [ ] **AffiliateView** - Affiliate program management
  - Primary user actions: Join/manage affiliate program, view earnings, request payout
  - UI Components: Program info, earnings display, payout history, request button
  - Navigation: Settings menu
  - Key behavior:
    - Earnings calculation
    - Payout status tracking
    - Minimum payout threshold display

- [ ] **AffiliateCreateView** - Create affiliate content (articles, reviews)
  - Components: Editor, add tracking links button
  - Key behavior: Preview with tracking links embedded

- [ ] **SharePickerView** - Native share sheet wrapper
  - Components: UIActivityViewController for system share options
  - Key behavior: Share to SMS, email, social media, copy, etc.

---

## 9. PROFILE & USER MANAGEMENT (11 screens)

### User Profile & Account Management
- [ ] **ProfileView** - User's own profile
  - Primary user actions: View profile, edit profile, view stats, share profile, view stories
  - UI Components: Avatar, name, bio, stats (posts, followers, following), edit button, stories
  - Navigation entry: Profile tab or menu
  - Key behaviors:
    - Bio display with link support
    - Edit button redirects to EditProfileView
    - Tap avatar to fullscreen
    - Stats display (view, follow counts)
    - Story grid display
    - Profile completion ring indicator

- [ ] **UserStatsView** - User statistics/analytics
  - Components: Engagement charts, follower/following graphs, post stats
  - User actions: View charts, time-range selector
  - Navigation: Sheet from ProfileView
  - Key behavior: Time range filtering, chart animations

- [ ] **EditProfileView** - Edit profile information
  - Primary user actions: Edit avatar, name, bio, status, language preference, visibility settings
  - UI Components: Image picker, text fields with character counters
  - Navigation: From ProfileView edit button
  - Key behaviors:
    - Avatar crop/rotate
    - Bio with markdown support (link preview)
    - Optional status message (like "in a meeting")
    - Visibility toggles (show online status, etc.)
    - Save/cancel buttons
    - Optimistic profile update

- [ ] **UserProfileSheet** - Profile card overlay
  - Components: Avatar, name, bio, stats, action buttons (message, add friend, view profile)
  - User actions: Tap to open full profile, message, add friend
  - Navigation: From any user mention/reference
  - Key behavior: Quick profile preview, tap to expand

- [ ] **ProfileSheetUser** - Simpler profile preview
  - Variant of profile sheet for minimal display

- [ ] **FullscreenImageView** - Avatar/image fullscreen
  - Components: Image viewer with pinch/zoom
  - User actions: Zoom, save image
  - Key behavior: Swipe to dismiss, double-tap to zoom

- [ ] **ReportUserView** - Report user for abuse
  - User actions: Select reason, add details, submit report
  - Components: Reason picker, text area, submit button
  - Navigation: From user profile menu
  - Key behavior: Confirmation after submit, block option

- [ ] **BlockedUsersView** - Manage blocked users
  - Primary user actions: View blocked users, unblock
  - UI Components: Blocked user list with unblock buttons
  - Navigation: Settings > Contacts > Blocked Users
  - Key behavior: Unblock with confirmation, remove from list

- [ ] **ContactsHubView** - Contacts hub (requests, discover, list)
  - Components: Tabs for Requests, All Contacts, Blocked, Discover
  - Navigation: From main menu
  - Key behavior: Real-time request notifications

- [ ] **ContactsListTab** - All contacts list
  - Components: Searchable contacts list with status
  - User actions: Search, tap to open profile, remove contact
  - Key behavior: Online status indicators, recent contacts at top

- [ ] **DiscoverTab** - Discover suggested contacts
  - Components: Suggested user cards, add button
  - User actions: Swipe through, add contact, skip, view profile
  - Key behavior: Personalized suggestions, refresh suggestions

---

## 10. SETTINGS & ACCOUNT CONFIGURATION (16 screens)

### Main Settings Hub
- [ ] **SettingsView** - Main settings menu
  - Primary user actions: Navigate to settings categories, logout
  - UI Components: Settings sections (Account, Privacy, Notifications, Security, Data, About)
  - Navigation entry: Profile/menu
  - Key behaviors:
    - Logout confirmation dialog
    - Visual hierarchy with sections
    - Quick toggles for common settings
    - Navigation to sub-screens
    - Theme selection (light/dark/system)
    - Language selection

### Privacy & Visibility
- [ ] **PrivacySettingsView** - Privacy configuration
  - User actions: Set profile visibility, control who can message, block lists, read receipts
  - Components: Toggle switches, selectors (everyone/friends/nobody)
  - Navigation: Settings > Privacy
  - Key behaviors:
    - Instant setting update
    - Preview of profile visibility
    - Message notification settings (who can message)
    - Story visibility (public/friends/close friends)
    - Activity status visibility

### Notifications
- [ ] **NotificationSettingsView** - Notification preferences
  - User actions: Enable/disable notification types, customize sounds, manage channels
  - Components: Toggle switches per notification type, sound selector, priority options
  - Navigation: Settings > Notifications
  - Key behaviors:
    - Separate controls for: messages, reactions, story updates, friend requests
    - Sound and vibration preview
    - Quiet hours configuration
    - DND (do not disturb) schedule

### Security & Authentication
- [ ] **SecurityView** - Security settings
  - User actions: Change password, enable 2FA, manage sessions, view login history
  - Components: Password change button, 2FA toggle, sessions list, backup codes button
  - Navigation: Settings > Security
  - Key behaviors:
    - Password change form (old + new)
    - 2FA setup QR code
    - Active sessions list (device, location, last active)
    - Session logout button
    - Suspicious activity alerts

- [ ] **ActiveSessionsView** - Manage active sessions
  - Components: Device list with location, last activity, logout button
  - User actions: Logout from other devices, view details
  - Key behavior: Real-time session status

### Data Management
- [ ] **DataStorageView** - Data usage and storage quota
  - Components: Storage usage bar, breakdown by media type
  - User actions: View details, manage old files
  - Navigation: Settings > Data
  - Key behavior: Storage calculation, auto-cleanup options

- [ ] **DataExportView** - Export user data (GDPR)
  - User actions: Request export format (JSON/ZIP), submit request, download when ready
  - Components: Format selector, export status, download link
  - Key behaviors:
    - Multiple export formats
    - Email notification when ready
    - Timed download link (expires)

- [ ] **MediaDownloadSettingsView** - Auto-download preferences
  - User actions: Toggle auto-download for images/videos, choose wifi/cellular options
  - Components: Toggle switches, quality selector
  - Key behavior: Immediate apply

### Account Actions
- [ ] **DeleteAccountView** - Account deletion
  - User actions: Confirm password, confirm deletion, receive verification email
  - Components: Password field, confirmation checkboxes, delete button
  - Navigation: Settings > Account > Delete Account
  - Key behaviors:
    - Multi-step confirmation
    - Data retention policy display
    - Email verification
    - Account soft-delete (30 day grace period)

### Legal & About
- [ ] **AboutView** - About app
  - Components: App version, build number, copyright, links to legal docs
  - User actions: Tap links to legal pages
  - Navigation: Settings > About
  - Key behavior: Version checking (update available badge)

- [ ] **PrivacyPolicyView** - Privacy policy document
  - Components: Long-form text/web view
  - Navigation: Settings > Legal > Privacy Policy
  - Key behavior: Scrollable document, in-app web view

- [ ] **TermsOfServiceView** - Terms of service document
  - Components: Long-form text/web view
  - Navigation: Settings > Legal > Terms
  - Key behavior: Scrollable document, in-app web view

- [ ] **LicensesView** - Open source licenses
  - Components: Collapsible license list (all dependencies)
  - Navigation: Settings > About > Licenses
  - Key behavior: Search licenses, expand to view

- [ ] **SupportView** - Support and help
  - Components: FAQ, contact form, knowledge base links
  - User actions: Search FAQ, send support ticket
  - Navigation: Settings > Support
  - Key behavior: In-app help system, email integration

---

## 11. VOICE PROFILE (4 screens)

### Voice Profile Features
- [ ] **VoiceProfileWizardView** - Setup wizard
  - Primary user actions: Record voice samples, generate voice profile, confirm result
  - UI Components: Recording interface, playback buttons, progress indicator
  - Navigation entry: Settings > Voice Profile > Create or first-time setup
  - Key behaviors:
    - Multi-sample recording (3-5 phrases)
    - Real-time audio waveform display
    - Playback of each recording
    - Re-record individual samples
    - Voice profile generation progress
    - ML model training on device

- [ ] **VoiceProfileManageView** - Manage existing voice profile
  - Primary user actions: Delete profile, share profile, use profile in messages
  - UI Components: Voice profile info, delete button, share button
  - Navigation: Settings > Voice Profile
  - Key behavior: One-tap voice message sending with profile

- [ ] **VoiceProfileManageViewModel** - State for voice profile management
  - Tracks profile status, handles API calls

- [ ] **VoiceProfileWizardViewModel** - State for setup flow
  - Tracks recording samples, trains model, manages progress

---

## 12. CALLS (6 screens)

### WebRTC Call Functionality
- [ ] **IncomingCallView** - Incoming call alert
  - Primary user actions: Answer or decline incoming call
  - UI Components: Caller avatar/name, large answer/decline buttons
  - Navigation entry: Overlay/modal on top of any screen
  - Key behaviors:
    - Caller info display
    - Ring tone playback
    - Haptic feedback (vibration pattern)
    - Vibration pattern matching ringtone
    - Timeout auto-decline after 30s
    - Hide sensitive content on caller screen (blur/privacy)

- [ ] **CallView** - Active call screen
  - Primary user actions: 
    - Mute/unmute microphone
    - Disable/enable camera
    - Switch cameras (front/rear)
    - Add participant (merge calls)
    - Switch to video/audio-only
    - End call
  - UI Components:
    - Remote video feed (large)
    - Local video preview (PiP)
    - Control buttons overlay
    - Call duration timer
    - Participant list if group call
  - Navigation: From incoming call answer or outgoing call initiation
  - Key behaviors:
    - Video freeze on loss of camera
    - Audio quality auto-adjust based on network
    - Bandwidth-aware quality switching
    - Participant audio level indicators
    - Blur background option
    - Screen share support (if implemented)
    - Call recording start/stop (if supported)
    - Battery optimization (reduces FPS/resolution on low battery)

- [ ] **WebRTCVideoView** - Video rendering surface
  - Components: Metal/OpenGL renderer for video
  - Key behavior: Hardware-accelerated video decode

- [ ] **FloatingCallPillView** - Minimized call UI
  - Primary user actions: Tap to expand call, swipe to close, mute button
  - UI Components: Avatar, mute button, time, drag handle
  - Navigation entry: Visible over other screens during active call
  - Key behaviors:
    - Draggable position (free-floating)
    - Collapse to pill (avatar + timer)
    - Quick mute/unmute
    - Tap to open call full screen
    - Auto-minimize when navigating

- [ ] **CallWaitingBannerView** - Incoming call during active call
  - Components: Banner with caller info, accept/decline buttons
  - User actions: Answer (merge), decline, ignore
  - Key behavior: Toast-like banner display

- [ ] **CallEffectsOverlay** - Visual effects during call
  - Components: AR filters, virtual backgrounds, lighting effects
  - User actions: Apply effect, configure, disable
  - Navigation: In-call effects menu
  - Key behavior: Real-time effect application, ML-based background blur

---

## 13. GLOBAL SEARCH (2 screens)

- [ ] **GlobalSearchView** - Unified search across app
  - Primary user actions: Type search query, browse results by category
  - UI Components: Search field, result sections (users, conversations, posts, communities)
  - Navigation entry: Search tab or menu
  - Key behaviors:
    - Real-time search as-you-type (debounced)
    - Categorized results display
    - Recent searches history
    - Search suggestions/auto-complete
    - Result action buttons (message, add, view)

- [ ] **GlobalSearchViewModel** - Search state management
  - Handles API search calls, result filtering, history

---

## 14. NOTIFICATIONS (3 screens)

- [ ] **NotificationListView** - Notification center/history
  - Primary user actions: View notifications, clear all, tap to navigate to context
  - UI Components: Notification rows with timestamps, action buttons
  - Navigation entry: Notifications tab or menu icon
  - Key behaviors:
    - Mark as read on tap
    - Swipe to delete notification
    - Tap navigates to context (message, post, profile)
    - Infinite scroll pagination
    - Filter by type (messages, reactions, requests)

- [ ] **NotificationToastView** - Toast notifications
  - Components: Message toast, auto-dismiss timer
  - Navigation: Overlay during app usage
  - Key behavior: Auto-dismiss after 5s, tap to navigate

- [ ] **NotificationRowView** - Individual notification item
  - Components: Icon, message, timestamp, action button
  - Key behavior: Different styles per notification type

---

## 15. BOOKMARKS & STARRED MESSAGES (2 screens)

- [ ] **BookmarksView** - Saved/bookmarked items
  - Primary user actions: Browse bookmarked messages, delete bookmark
  - UI Components: Message list with conversation context
  - Navigation entry: Menu or profile dropdown
  - Key behaviors:
    - Grouping by conversation
    - Search within bookmarks
    - Quick delete with swipe
    - Tap to jump to message in conversation

- [ ] **StarredMessagesView** - Starred messages (alternative to bookmarks)
  - Same as BookmarksView but using star rating system
  - Key behavior: Rating scale (1-5 stars)

---

## 16. SPECIAL SCREENS & UTILITIES (8+ screens)

### Root & Navigation
- [ ] **RootView** - App root view
  - Manages: Authentication state, bottom tab navigation, floating buttons
  - Components: Tab bar (Conversations, Feed, Profile), floating buttons, overlays
  - Key behavior:
    - Deep link routing
    - Floating "Add" button (feed + menu)
    - Story viewer full-screen presentation
    - Connection status banner

- [ ] **AdaptiveRootView** - Phone/tablet layout adaptation
  - iPhone: Tab-based navigation
  - iPad: Split view or sidebar navigation

- [ ] **iPadRootView** - Dedicated iPad layout
  - Multi-column layout, sidebar navigation, split panes
  - Key behavior: Landscape orientation, large screens

### Onboarding & Entry
- [ ] **OnboardingView** - Splash/intro screens
  - Animated intro with feature showcase
  - Navigation: On first app launch

### Web & Auth Flow
- [ ] **MagicLinkView** - Passwordless link-based login
  - Deep link handling for magic links

### Experimental/Utility
- [ ] **WidgetPreviewView** - Home screen widget configuration
  - Widget customization UI

- [ ] **StatusBarView** - Custom status bar display
  - System status information, connection status

- [ ] **ConnectionBanner** - Offline/online status banner
  - Component showing connection status with retry button
  - Key behavior: Auto-hide when online, persistent when offline

- [ ] **OfflineBanner** - Offline mode notification
  - User messaging about offline state

### Accessibility & Overlays
- [ ] **OverlayMenu** - General-purpose overlay menu
  - Context menus, action sheets

- [ ] **EmojiPickerSheet** - Emoji selection UI
  - Components: Emoji grid, category tabs, search
  - User actions: Tap emoji to select
  - Key behavior: Recent emojis at top, skin tone selector

---

## KEY UI COMPONENTS & PATTERNS

### Reusable Components (From MeeshyUI Package)
- [ ] **MeeshyAvatar** - User avatar display with placeholder, online status badge
- [ ] **ChatBubble** - Message bubble with directional styling
- [ ] **EmojiReactionPicker** - Emoji selection overlay for reactions
- [ ] **CategoryPickerView** - Category/tag selection component
- [ ] **TagInputField** - Tag entry and display
- [ ] **MeeshyRefreshableScroll** - Pull-to-refresh implementation
- [ ] **MeeshyPullIndicator** - Visual refresh indicator
- [ ] **SkeletonView** - Loading placeholder
- [ ] **SwipeableRow** - Row with swipe actions
- [ ] **ProfileCompletionRing** - Circular progress for profile completion
- [ ] **StatsCard** - Statistics display card
- [ ] **UserIdentityBar** - User identity chip/badge
- [ ] **ToastView** - Toast notification
- [ ] **ErrorBannerView** - Error message banner
- [ ] **EmptyStateView** - Empty state placeholder
- [ ] **CachedAsyncImage** - Image loading with 3-tier cache
- [ ] **AnimatedLogoView** - Meeshy logo animation
- [ ] **AchievementBadge** - Badge/achievement display

### Media Components (From MeeshyUI)
- [ ] **ImageViewerView** - Full-screen image viewer with pinch/zoom
- [ ] **VideoPlayerView** - Video player with controls
- [ ] **AudioPlayerView** - Audio player with waveform
- [ ] **MeeshyVideoEditorView** - Video editing interface
- [ ] **MeeshyImageEditorView** - Image editing/cropping
- [ ] **MeeshyAudioEditorView** - Audio editing interface
- [ ] **DocumentViewerView** - File/document viewer
- [ ] **LocationMessageView** - Location sharing display

### Authentication Components (From MeeshyUI)
- [ ] **AuthTextField** - Styled input field for auth forms
- [ ] **PasswordStrengthIndicator** - Password strength visual
- [ ] **CountryPicker** - Country/phone code selection
- [ ] **LanguageSelector** - Language selection component
- [ ] **MeeshyForgotPasswordView** - Password reset flow

### Community Components (From MeeshyUI)
- [ ] **JoinFlowSheet** - Join community flow (anonymous user)
- [ ] **JoinLinkPreviewView** - Preview before joining via link
- [ ] **AnonymousJoinFormView** - Guest user join form

---

## NOTABLE BEHAVIORS & PATTERNS

### Real-Time Updates
- Message arrival with socket.io real-time updates
- Typing indicator animation ("User is typing...")
- Online status indicator updates
- Reaction count updates
- Read receipt animations (✓ → ✓✓)
- Comment count updates

### Optimistic Updates
- Message appears immediately on send (before server confirmation)
- Like/unlike appears instantly
- Bookmark/star appears instantly
- Mute/archive conversation updates instantly
- Typing indicator broadcast on key press

### Offline Behavior
- Message queuing when offline
- Automatic retry on reconnection
- Offline badge display
- Read-only mode indicators
- Sync progress indicators

### Animations & Interactions
- Spring animations for navigation transitions (response: 0.4-0.7, damping: 0.6-0.8)
- Haptic feedback for: button press, message send, error, success
- Swipe gestures: swipe to reply, swipe to delete, swipe for actions
- Long-press for context menus and reactions
- Pull-to-refresh with snap-back animation
- Fade/slide transitions between tabs
- Staggered animations on list items (0.04-0.05s delay per item)
- Burn effect on ephemeral message deletion
- Blur/reveal transition for sensitive content
- Floating button drag-to-position (free-floating UI)

### Prisme Linguistique (Multi-Language Support)
- Message translation with language flags
- Multiple translation display (original + selected translations)
- Tap flag to toggle secondary language view
- Translation metadata in message detail sheet
- Re-translate button
- Language-aware text rendering in stories
- Profile language preference for default translation
- Regional/custom translation support

### Accessibility Features
- VoiceOver support for all interactive elements
- Dynamic Type scaling for text
- Minimum 44x44pt touch targets
- Color contrast compliance
- Accessibility labels on images
- Semantic structure for screen readers
- Keyboard navigation support

---

## NAVIGATION PATTERNS

### Hierarchical Navigation
- TabView for main tab sections (Conversations, Feed, Profile)
- NavigationStack for hierarchical drill-down (conversation → message detail)
- Swipe gesture to go back (UINavigationController gesture)
- @Environment(\.dismiss) for modal dismissal

### Modal Presentations
- .sheet() for most settings/detailed views
- .fullScreenCover() for story viewer
- .alert() for confirmations/errors
- UIActivityViewController for system share sheet
- UIImagePickerController / PHPickerViewController for media selection

### Overlay Presentations
- ZStack for floating buttons, menus, banners
- GeometryReader for position calculations
- Free-floating buttons with drag-to-persist position
- Floating call pill (draggable, minimizable)

---

## DATA PERSISTENCE & CACHING

### Cache Layers
1. **Memory Cache** - NSCache for recent/hot data
2. **Disk Cache** - FileManager for media (images, videos, files)
3. **Database** - SwiftData or Core Data for local-first state
4. **Network** - Fresh fetch with background silent refresh

### Cache-First Pattern
- Load from cache immediately
- Display `.stale` cached data with refresh indicator
- Background refresh in parallel (no spinner)
- Update UI when fresh data arrives

---

## ESTIMATED SCREEN COUNT SUMMARY

| Category | Count | Notes |
|----------|-------|-------|
| Auth & Onboarding | 15 | Registration flow, login, 2FA, password reset |
| Conversations List | 12 | List view, new conversation, friend requests, story tray |
| Messages & Composer | 35+ | Main view, bubbles, composer, reactions, threads |
| Threads | 5 | Thread view, reply cells, load more |
| Stories | 16+ | Tray, viewer, composer, filters, export, text editing |
| Feed & Posts | 12 | Feed, posts, detail, comments, audio composer |
| Community | 8 | List, detail, create, members, settings, invites |
| Affiliate/Sharing | 9 | Share links, tracking links, affiliate program |
| Profile & Contacts | 11 | User profile, edit, stats, contacts, reports, blocked |
| Settings & Account | 16 | Main settings, privacy, notifications, security, data, legal |
| Voice Profile | 4 | Setup wizard, manage, view models |
| Calls | 6 | Incoming, active, floating pill, effects, waiting |
| Search | 2 | Global search, search history |
| Notifications | 3 | List, toasts, rows |
| Bookmarks | 2 | Bookmarks, starred messages |
| Root & Special | 8+ | Root view, widgets, banners, menus, splash |
| **TOTAL** | **≈ 144+** | Includes variants and helper screens |

---

## IMPLEMENTATION NOTES FOR ANDROID PORT

### High-Priority Features
1. **Messaging Architecture**
   - WebSocket/Socket.IO for real-time message delivery
   - Optimistic message sending with sync status UI
   - Typing indicator broadcast
   - Read receipt tracking
   - Message reactions with emoji picker

2. **Story System**
   - Multi-slide story support with timeline
   - Real-time rendering (canvas composition)
   - Export to MP4 (language-aware, author-only)
   - Story viewer with auto-advance

3. **Media Handling**
   - Image/video caching with 3-tier strategy
   - Thumbnail generation
   - On-device audio processing (transcription, filtering)
   - Media picker integration (Photos, Files, Camera)

4. **Offline Support**
   - Message queue persists across app restarts
   - Automatic retry on reconnection
   - Offline mode UI indicators

5. **Calls (WebRTC)**
   - Incoming/outgoing call handling
   - Floating call pill (draggable)
   - Mute/video control buttons
   - Network quality adaptation

6. **Prisme Linguistique**
   - Message translation display
   - Language flag indicators
   - Translation detail sheet
   - Language preference per user

### Medium-Priority Features
1. **Community System** - Moderation, member management, rules
2. **Affiliate Links** - Click tracking, commission calculation
3. **Voice Profile** - On-device voice training, ML inference
4. **Search** - Full-text search with caching
5. **Notifications** - Push + in-app notification management
6. **Data Export** - GDPR compliance data dump

### Lower-Priority Features
1. **Widget Support** - Home screen widgets
2. **Share Extensions** - Share to Meeshy from other apps
3. **Siri/Voice Commands** - Voice assistant integration
4. **Advanced Analytics** - Stats charts, usage tracking

### Design System Notes
- **Primary Color**: Indigo (#6366F1) with gradient to #4338CA
- **Semantic Colors**: Success (#34D399), Warning (#FBBF24), Error (#F87171), Info (#60A5FA)
- **Glass UI**: Ultra-thin material with Indigo tint
- **Animations**: Spring transitions (response: 0.4-0.7, damping: 0.6-0.8)
- **Haptics**: Light, Medium, Success, Error feedback patterns
- **Typography**: System fonts (SF Pro Display/SF Pro Text), Dynamic Type scaling
- **Dark Mode**: Full support with theme manager

---

## ANDROID-SPECIFIC CONSIDERATIONS

### Architecture Mapping
- **SwiftUI Views** → **Jetpack Compose** or **XML Layouts + Fragment/Activity**
- **MVVM ViewModels** → **ViewModel (AndroidX)**
- **@Published** → **StateFlow / LiveData**
- **@State** → **remember { mutableStateOf(...) }` (Compose)
- **@Environment** → **Dependency Injection (Hilt)**
- **Socket.IO** → **Socket.IO Android Client**
- **WebRTC** → **WebRTC Android SDK**
- **Local Storage** → **SharedPreferences** or **DataStore** (Room for complex data)

### Platform Differences to Implement
1. **Back Navigation** - Hardware back button, Action Bar back
2. **Share Sheet** - Share intent instead of UIActivityViewController
3. **Media Selection** - Content resolver instead of PHPickerViewController
4. **Keyboard** - InputMethodManager instead of @FocusState
5. **Haptics** - HapticFeedback or Vibrator API instead of UIImpactFeedbackGenerator
6. **Push Notifications** - Firebase Cloud Messaging instead of APNs
7. **Local Database** - Room instead of Core Data
8. **Image Caching** - Glide or Coil instead of custom CachedAsyncImage
9. **Permissions** - Runtime permissions with ActivityResultContracts
10. **Theme** - Material Design 3 with dynamic colors

