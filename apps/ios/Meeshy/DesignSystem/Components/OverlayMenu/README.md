# MeeshyOverlayMenu Component System

A comprehensive WhatsApp-style overlay menu system for the Meeshy iOS app. This overlay appears on long-press for messages and conversations, providing quick reactions, message info, and contextual actions.

## Architecture

```
MeeshyOverlayMenu
├── MeeshyQuickViewArea (top - swipeable TabView)
│   ├── Page 1: EmojiGridView
│   ├── Page 2: MessageInfoView
│   └── Page 3: ReactionsDetailView
├── Preview Component (center)
├── MeeshyActionMenu (bottom - slide up)
└── Alert Mode (replaces QuickViewArea + ActionMenu)
```

## Files

1. **MeeshyOverlayMenu.swift** - Main container with blur background, animations, and data models
2. **MeeshyQuickViewArea.swift** - Swipeable top area with page indicators
3. **EmojiGridView.swift** - Emoji picker with Recent and Popular sections
4. **MessageInfoView.swift** - Message metadata (location, read receipts)
5. **ReactionsDetailView.swift** - Reactions list with emoji tabs
6. **MeeshyActionMenu.swift** - Bottom action sheet with menu items
7. **MeeshyAlertOverlay.swift** - Alert/Edit mode for confirmations

## Usage Example

### Basic Usage

```swift
import SwiftUI

struct MessageView: View {
    @State private var showOverlay = false
    @State private var overlayMode: MeeshyOverlayMode = .actions
    let message: Message

    var body: some View {
        MessageBubble(message: message)
            .onLongPressGesture(minimumDuration: 0.5) {
                showOverlay = true
            }
            .fullScreenCover(isPresented: $showOverlay) {
                MeeshyOverlayMenu(
                    mode: $overlayMode,
                    quickViewConfig: .init(
                        pages: [
                            .emoji(.init(
                                recentEmojis: ["❤️", "👍", "😂", "🔥", "😮", "🙏", "👏", "🎉"],
                                popularEmojis: ["😊", "😍", "🥰", "😘", "🤔", "😢", "😡", "🤯"],
                                onSelect: { emoji in
                                    // Handle emoji reaction
                                    addReaction(emoji)
                                    showOverlay = false
                                },
                                onBrowseAll: {
                                    // Open full emoji picker
                                }
                            )),
                            .messageInfo(.init(
                                location: message.location,
                                timestamp: message.timestamp,
                                readReceipts: message.readReceipts
                            )),
                            .reactions(.init(
                                reactions: message.reactions,
                                onUserTap: { user in
                                    // Handle user tap
                                }
                            ))
                        ]
                    ),
                    preview: {
                        MessageBubble(message: message)
                    },
                    actions: [
                        .init(icon: "arrow.turn.up.left", title: "Répondre") {
                            showOverlay = false
                            replyToMessage(message)
                        },
                        .init(icon: "pencil", title: "Modifier") {
                            overlayMode = .edit(.init(
                                title: "Modifier le message",
                                initialText: message.content,
                                placeholder: "Entrez votre message",
                                onSave: { newText in
                                    editMessage(newText)
                                    showOverlay = false
                                },
                                onCancel: {
                                    overlayMode = .actions
                                }
                            ))
                        },
                        .init(icon: "trash", title: "Supprimer", style: .destructive) {
                            overlayMode = .alert(.init(
                                icon: "exclamationmark.triangle",
                                title: "Supprimer ce message ?",
                                message: "Cette action est irréversible.",
                                confirmButton: .init(title: "Supprimer", style: .destructive) {
                                    deleteMessage(message)
                                    showOverlay = false
                                },
                                cancelButton: .init(title: "Annuler", style: .cancel) {
                                    overlayMode = .actions
                                }
                            ))
                        }
                    ],
                    onDismiss: { showOverlay = false }
                )
                .background(ClearBackgroundView())
            }
    }
}
```

### Alert Mode Example

```swift
// Trigger alert mode for destructive actions
overlayMode = .alert(.init(
    icon: "exclamationmark.triangle",
    title: "Supprimer ce message ?",
    message: "Cette action est irréversible.",
    confirmButton: .init(
        title: "Supprimer",
        style: .destructive
    ) {
        // Handle deletion
        deleteMessage()
        showOverlay = false
    },
    cancelButton: .init(
        title: "Annuler",
        style: .cancel
    ) {
        overlayMode = .actions
    }
))
```

### Edit Mode Example

```swift
// Trigger edit mode for message editing
overlayMode = .edit(.init(
    title: "Modifier le message",
    initialText: message.content,
    placeholder: "Entrez votre message",
    onSave: { newText in
        updateMessage(newText)
        showOverlay = false
    },
    onCancel: {
        overlayMode = .actions
    }
))
```

## Data Models

### MeeshyOverlayMode

```swift
enum MeeshyOverlayMode {
    case actions
    case alert(AlertConfig)
    case edit(EditConfig)
}
```

### QuickViewPage

```swift
enum QuickViewPage {
    case emoji(EmojiGridConfig)
    case messageInfo(MessageInfoConfig)
    case reactions(ReactionsConfig)
}
```

### MeeshyActionItem

```swift
struct MeeshyActionItem {
    let icon: String
    let title: String
    let subtitle: String?
    let style: ActionStyle  // .default or .destructive
    let action: () -> Void
}
```

## Features

### Animations

- **Appear**: Background fades in, QuickView slides down, Preview scales, ActionMenu slides up
- **Dismiss**: All elements animate out with spring animations
- **Mode Transitions**: Smooth cross-fade between actions, alert, and edit modes
- **Haptic Feedback**: Touch feedback on all interactions

### QuickViewArea Pages

#### Page 1: Emoji Grid
- Recent emojis (8 items)
- Popular emojis (8 items)
- "Browse all" button
- 8-column grid layout
- Scale animation on tap

#### Page 2: Message Info
- Location with timestamp
- Read receipts with status icons:
  - ✓✓ blue = read
  - ✓ gray = delivered
  - ○ gray = sent

#### Page 3: Reactions Detail
- Horizontal scrollable emoji tabs
- "All" tab showing all reactions
- User list with avatars
- Timestamps

### Action Menu

- Bottom sheet with rounded top corners
- Drag indicator
- Icon + title + optional subtitle
- Destructive items in red with warning icon
- Dividers between sections
- Press animation

### Alert/Edit Overlay

#### Alert Mode
- Icon + title + message
- Confirm button (primary or destructive)
- Cancel button
- Centered layout

#### Edit Mode
- Icon + title
- TextField with placeholder
- Save button (disabled when empty)
- Cancel button
- Auto-focus on appear

## Styling

- **Corner Radius**: 16pt (QuickView), 20pt (ActionMenu), 12pt (Buttons)
- **Shadows**: Subtle shadows on all major components
- **Background**: systemBackground with blur
- **Dim Overlay**: 40% black opacity
- **Spring Animations**: response: 0.3-0.45, dampingFraction: 0.7-0.8

## Accessibility

- All buttons have proper labels
- VoiceOver support
- Dynamic Type support
- Haptic feedback for interactions

## Requirements

- iOS 16+
- SwiftUI only
- French labels by default
- Dark mode support

## Integration with Existing Code

The overlay menu reuses patterns from:
- `ModernMessageBubble.swift` - ClearBackgroundView, reaction styling
- `EmojiPickerSheet.swift` - Emoji picker patterns
- `ButtonStyles.swift` - Shared button styles (MeeshyScaleButtonStyle)

## Notes

- Use `.fullScreenCover` with `ClearBackgroundView()` for proper transparency
- The preview component maintains its original appearance
- All closures are executed after animations complete
- Mode can be changed dynamically during interaction
