# Meeshy Platform SDK and UI

This project contains the core SDK and UI components for the Meeshy platform, allowing applications to integrate Meeshy identity and messaging functionality.

## Project Structure

```
Meeshy/
├── Package.swift                 # Swift Package Manager configuration
├── Sources/
│   ├── MeeshySDK/               # Core SDK module
│   │   ├── MeeshySDK.swift      # Main SDK entry point
│   │   └── CoreModels.swift     # Core data models
│   └── MeeshyUI/                # UI components module
│       └── MeeshyUI.swift       # SwiftUI components
├── Tests/
│   └── MeeshySDKTests/          # SDK tests
│       └── CoreModelsTests.swift
└── App/                         # Your main application code
    ├── Conversation.swift       # Type aliases for convenience
    ├── Message.swift            # Type aliases for convenience
    └── ...
```

## Modules

### MeeshySDK

The core SDK provides data models and business logic for the Meeshy platform:

**Core Models:**
- `MeeshyConversation` - Represents a conversation (direct, group, or community)
- `MeeshyMessage` - Represents a message with attachments and reactions
- `MeeshyUser` - Represents a user on the platform
- `MeeshyConversationTag` - Tags for organizing conversations
- `MeeshyCommunity` - Community/channel information

**Enums:**
- `ConversationType` - Direct, group, community, channel
- `MessageType` - Text, image, video, audio, etc.
- `ConversationLanguage` - Language preferences
- `ConversationTheme` - Visual themes for conversations

### MeeshyUI

SwiftUI components implementing the Meeshy design system:

**Components:**
- `MeeshyAvatarView` - User avatars with automatic initials
- `MeeshyConversationRow` - Conversation list item
- `MeeshyMessageBubble` - Chat message bubble
- `MeeshyTagView` - Colorful conversation tags
- `MeeshyThemeIcon` - Theme-specific icons

## Usage

### In Your App Target

Add the modules as dependencies in your Xcode project settings, or if using Swift Package Manager, add them to your target dependencies.

### Importing

```swift
import MeeshySDK  // For data models and SDK functionality
import MeeshyUI   // For UI components
```

### Creating Conversations

```swift
let conversation = MeeshyConversation(
    identifier: "conv_123",
    type: .direct,
    title: "Alice",
    tags: [
        MeeshyConversationTag(name: "Friends", color: "9B59B6")
    ],
    language: .english,
    theme: .social
)
```

### Using UI Components

```swift
import SwiftUI
import MeeshyUI
import MeeshySDK

struct ConversationListView: View {
    let conversations: [MeeshyConversation]
    
    var body: some View {
        List(conversations) { conversation in
            MeeshyConversationRow(conversation: conversation) {
                // Handle tap
                print("Tapped \(conversation.title)")
            }
        }
    }
}
```

### Type Aliases

For convenience, your app code can use shorter type names:

```swift
// In Conversation.swift and Message.swift
typealias Conversation = MeeshyConversation
typealias Message = MeeshyMessage
// etc.
```

This allows you to use `Conversation` instead of `MeeshyConversation` in your app code.

## Building

### With Xcode

1. Open your project in Xcode
2. The Package.swift file should be automatically detected
3. Build your project (⌘B)

### With Swift Package Manager

```bash
swift build
swift test
```

## Testing

The SDK includes comprehensive tests using the Swift Testing framework:

```bash
swift test
```

Or run tests in Xcode (⌘U).

## Platform Requirements

- iOS 17.0+
- macOS 14.0+
- Swift 5.9+

## Integration with Other Applications

These modules are designed to be integrated into any application that needs Meeshy identity and messaging features. Simply add them as package dependencies and import them where needed.

## Version

- MeeshySDK: 1.0.0
- MeeshyUI: 1.0.0

## License

[Your License Here]
