# Meeshy Context Menu

A premium, signature contextual menu component for the Meeshy iOS app. Features elegant spring animations, blur effects, haptic feedback, and a highly reusable architecture.

## Features

- **Signature Animation**: Distinctive spring-based animation with subtle bounce that creates a memorable brand experience
- **Modern iOS Design**: Utilizes native blur/vibrancy effects for a premium look
- **Haptic Feedback**: Rich tactile feedback on appear, item press, and dismiss actions
- **Highly Reusable**: Simple view modifier API that works with any SwiftUI view
- **Flexible Configuration**: Customize appearance, timing, and behavior
- **Section Support**: Organize menu items into logical groups
- **Smart Positioning**: Automatically positions menu to stay on screen
- **Performance Optimized**: Smooth 60fps animations with efficient rendering

## Architecture

### Core Components

```
MeeshyContextMenu/
├── MeeshyContextMenuItem.swift       # Data models and configuration
├── MeeshyContextMenu.swift           # Main menu component with animations
├── MeeshyContextMenuModifier.swift   # View modifiers and programmatic API
└── Examples/
    └── MeeshyContextMenuExamples.swift  # Comprehensive usage examples
```

### Key Types

- **`MeeshyContextMenuItem`**: Represents a single menu item
- **`MeeshyContextMenuSection`**: Groups related menu items
- **`MeeshyContextMenuConfiguration`**: Customizes appearance and behavior
- **`MeeshyContextMenu`**: The main menu view with animations
- **`MeeshyContextMenuModifier`**: View modifier for easy integration
- **`MeeshyContextMenuPresenter`**: Manager for programmatic presentation

## Basic Usage

### Simple Menu (Single Section)

```swift
Text("Long press me!")
    .padding()
    .background(Color.blue)
    .cornerRadius(12)
    .meeshyContextMenu(items: [
        MeeshyContextMenuItem(
            icon: "pin.fill",
            title: "Pin",
            subtitle: "Keep at top"
        ) {
            // Handle pin action
        },
        MeeshyContextMenuItem(
            icon: "bell.slash.fill",
            title: "Mute"
        ) {
            // Handle mute action
        },
        MeeshyContextMenuItem(
            icon: "trash.fill",
            title: "Delete",
            isDestructive: true
        ) {
            // Handle delete action
        }
    ])
```

### Multi-Section Menu

```swift
ConversationRow(conversation: conversation)
    .meeshyContextMenu(
        sections: [
            MeeshyContextMenuSection(title: "Quick Actions", items: [
                MeeshyContextMenuItem(icon: "pin.fill", title: "Pin") { },
                MeeshyContextMenuItem(icon: "checkmark.circle", title: "Mark as Read") { }
            ]),
            MeeshyContextMenuSection(title: "Settings", items: [
                MeeshyContextMenuItem(icon: "bell.slash.fill", title: "Mute") { },
                MeeshyContextMenuItem(icon: "eye.slash.fill", title: "Hide") { }
            ]),
            MeeshyContextMenuSection(items: [
                MeeshyContextMenuItem(icon: "trash.fill", title: "Delete", isDestructive: true) { }
            ])
        ]
    )
```

### Result Builder Syntax

```swift
Text("Dynamic Menu")
    .meeshyContextMenu {
        MeeshyContextMenuItem(icon: "heart.fill", title: "Like") { }

        if isLiked {
            MeeshyContextMenuItem(icon: "heart.text.square", title: "View Likes") { }
        }

        MeeshyContextMenuItem(icon: "bubble.right", title: "Comment") { }
    }
```

### Programmatic Presentation

```swift
struct MyView: View {
    @StateObject private var menuPresenter = MeeshyContextMenuPresenter()

    var body: some View {
        ZStack {
            Button("Show Menu") {
                let rect = CGRect(x: 100, y: 200, width: 100, height: 50)
                menuPresenter.present(
                    items: [
                        MeeshyContextMenuItem(icon: "plus", title: "New") { }
                    ],
                    from: rect
                )
            }

            menuPresenter.menuOverlay()
        }
    }
}
```

## Customization

### Custom Configuration

```swift
let customConfig = MeeshyContextMenuConfiguration(
    cornerRadius: 24,
    itemHeight: 64,
    horizontalPadding: 20,
    shadowRadius: 32,
    shadowOpacity: 0.25,
    maxWidth: 320,
    blurStyle: .systemUltraThinMaterial,
    springResponse: 0.6,
    springDampingFraction: 0.7
)

MyView()
    .meeshyContextMenu(items: items, configuration: customConfig)
```

### Custom Long-Press Duration

```swift
MyView()
    .meeshyContextMenu(
        items: items,
        minimumDuration: 0.3  // Faster activation (default: 0.5)
    )
```

## Animation Details

The menu uses a sophisticated multi-phase animation:

1. **Background Fade** (0.25s ease-out): Dims the background
2. **Main Spring** (0.5s spring): Scales menu from 0.8 to 1.0 with bounce
3. **Content Scale** (0.5s spring): Scales content from 0.9 to 1.0
4. **Secondary Bounce** (0.3s): Subtle overshoot to 1.02 then settle
5. **Haptic Feedback**: Medium impact on appear, light on interactions

This creates the signature "pop" effect that makes the menu memorable.

## Menu Items

### Properties

- **`icon`**: SF Symbol name (e.g., "pin.fill", "trash", "heart")
- **`title`**: Main label text
- **`subtitle`**: Optional secondary text (e.g., "For 1 hour")
- **`isDestructive`**: Displays in red with warning icon
- **`action`**: Closure executed when item is tapped

### Best Practices

1. **Use System Icons**: SF Symbols provide consistent, recognizable icons
2. **Keep Titles Short**: 1-3 words for best readability
3. **Group Related Actions**: Use sections to organize complex menus
4. **Destructive Actions Last**: Place delete/remove at bottom
5. **Provide Context**: Use subtitles for actions that need clarification
6. **Limit Items**: 3-7 items per section for optimal UX

## Integration with Conversations

### Example: Conversation Row

```swift
struct ConversationRow: View {
    let conversation: Conversation

    var body: some View {
        HStack {
            Avatar(conversation.user)
            VStack(alignment: .leading) {
                Text(conversation.user.name)
                Text(conversation.lastMessage)
            }
        }
        .meeshyContextMenu(
            sections: [
                MeeshyContextMenuSection(title: "Quick Actions", items: [
                    MeeshyContextMenuItem(
                        icon: conversation.isPinned ? "pin.slash" : "pin.fill",
                        title: conversation.isPinned ? "Unpin" : "Pin"
                    ) {
                        togglePin()
                    },
                    MeeshyContextMenuItem(
                        icon: "checkmark.circle",
                        title: "Mark as Read"
                    ) {
                        markAsRead()
                    }
                ]),
                MeeshyContextMenuSection(items: [
                    MeeshyContextMenuItem(
                        icon: "trash",
                        title: "Delete",
                        isDestructive: true
                    ) {
                        deleteConversation()
                    }
                ])
            ]
        )
    }
}
```

### Example: Message Bubble

```swift
struct MessageBubble: View {
    let message: Message

    var body: some View {
        Text(message.text)
            .padding()
            .background(Color.blue)
            .cornerRadius(18)
            .meeshyContextMenu(items: [
                MeeshyContextMenuItem(icon: "arrow.turn.up.left", title: "Reply") {
                    replyToMessage()
                },
                MeeshyContextMenuItem(icon: "doc.on.doc", title: "Copy") {
                    UIPasteboard.general.string = message.text
                },
                MeeshyContextMenuItem(icon: "arrow.uturn.forward", title: "Forward") {
                    forwardMessage()
                },
                MeeshyContextMenuItem(icon: "trash", title: "Delete", isDestructive: true) {
                    deleteMessage()
                }
            ])
    }
}
```

## Performance Considerations

- Menu animation runs at 60fps on iPhone 8 and newer
- Blur effects use native `UIVisualEffectView` for optimal performance
- Haptic feedback uses appropriate intensities to avoid battery drain
- Gesture recognition is optimized to not interfere with scrolling

## Accessibility

The component includes:
- VoiceOver support through native SwiftUI accessibility
- Dynamic Type support for text scaling
- High contrast mode compatible
- Reduced motion respected (animations simplified)

## Requirements

- iOS 16.0+
- Swift 5.9+
- SwiftUI

## Integration Checklist

- [ ] Add all component files to your Xcode project
- [ ] Import in views where context menus are needed
- [ ] Test long-press gesture on target devices
- [ ] Verify animations feel smooth (60fps)
- [ ] Test with VoiceOver enabled
- [ ] Test with Dynamic Type at different sizes
- [ ] Verify menu positioning on different screen sizes
- [ ] Test haptic feedback on physical devices

## Troubleshooting

### Menu doesn't appear
- Ensure view has a frame (not zero-sized)
- Check that long-press gesture isn't conflicting with other gestures
- Verify items array is not empty

### Animation stutters
- Check for heavy computations in action closures
- Ensure view hierarchy isn't too complex
- Profile with Instruments to identify bottlenecks

### Menu appears in wrong position
- Verify the source view has proper frame in global coordinate space
- Check for layout issues in parent views
- Test on different device sizes

## Future Enhancements

Potential additions for future versions:
- Dark mode specific configurations
- Swipe gesture support for additional actions
- Multi-select mode for batch operations
- Custom animation presets
- Nested submenu support
- iPad-optimized presentation

## License

Proprietary - Meeshy iOS App

---

**Questions or issues?** Contact the iOS team or create an issue in the project repository.
