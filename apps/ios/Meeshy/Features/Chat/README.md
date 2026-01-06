# Chat & Messaging Feature

Complete real-time chat and messaging implementation for Meeshy iOS app.

## Overview

This module provides a modern, feature-rich chat interface with real-time messaging, translations, reactions, attachments, and more.

## Architecture

### MVVM Pattern
- **Views**: SwiftUI views for UI presentation
- **ViewModels**: Business logic and state management
- **Components**: Reusable UI components
- **Helpers**: Utility classes for grouping, keyboard management, etc.

### Real-time Communication
- WebSocket integration via Socket.IO
- Optimistic UI updates
- Offline message queueing
- Automatic reconnection

## File Structure

```
Features/Chat/
├── Views/
│   ├── ChatView.swift                 # Main conversation screen
│   ├── MessageBubbleView.swift        # Individual message display
│   ├── MessageInputBar.swift          # Input bar with attachments
│   ├── AttachmentPreviewView.swift    # Preview selected attachments
│   ├── ReactionPickerView.swift       # Emoji reaction selector
│   ├── TranslationView.swift          # Inline translations
│   └── TypingIndicatorView.swift      # Typing animation
├── ViewModels/
│   └── ChatViewModel.swift            # Chat business logic
├── Components/
│   ├── MessageRow.swift               # Message container
│   ├── AttachmentBubbleView.swift     # Media attachments
│   ├── LinkPreviewView.swift          # Rich link previews
│   └── DateSeparatorView.swift        # Date separators
└── Helpers/
    ├── MessageGrouper.swift           # Message grouping logic
    └── KeyboardManager.swift          # Keyboard handling
```

## Key Features

### 1. Real-time Messaging
- Instant message delivery via WebSocket
- Read receipts (single/double checkmarks)
- Typing indicators with debouncing
- Message status (sending, sent, failed)
- Optimistic UI updates

### 2. Message Types
- **Text**: Plain text with emoji support
- **Images**: Photos with full-screen preview
- **Videos**: Playback with thumbnails
- **Audio**: Voice messages with waveform
- **Documents**: PDF, DOC, XLS, etc.
- **Location**: Map previews and directions
- **Links**: Rich link previews

### 3. Interactions
- **Reactions**: Quick emoji reactions (👍 ❤️ 😂 etc.)
- **Reply**: Quote and reply to messages
- **Translate**: Auto-translate to user's language
- **Edit**: Modify sent messages (own only)
- **Delete**: Remove messages (own only)
- **Copy**: Copy message text
- **Forward**: Share to other conversations

### 4. UI/UX Features
- Beautiful gradient message bubbles
- Smooth animations and transitions
- Pull-to-refresh for older messages
- Infinite scroll pagination
- Auto-scroll to bottom on new messages
- Date separators (Today, Yesterday, etc.)
- Message grouping by sender
- Avatar display (group chats)
- Sender names (group chats)

### 5. Accessibility
- VoiceOver support
- Dynamic Type
- High contrast mode
- Semantic labels
- Keyboard navigation

### 6. Performance
- Message virtualization (lazy loading)
- Image caching (memory + disk)
- Pagination (50 messages per page)
- Background loading
- Memory warning handling
- Efficient rendering

## Usage

### Basic Implementation

```swift
import SwiftUI

struct ConversationsView: View {
    var body: some View {
        NavigationView {
            List(conversations) { conversation in
                NavigationLink(destination: ChatView(conversation: conversation)) {
                    ConversationRow(conversation: conversation)
                }
            }
        }
    }
}
```

### ChatViewModel

```swift
let viewModel = ChatViewModel(conversationId: "123")

// Send message
await viewModel.sendMessage(content: "Hello!", type: .text)

// Load messages
await viewModel.loadMessages()

// React to message
await viewModel.addReaction(to: messageId, emoji: "👍")

// Translate message
await viewModel.translateMessage(messageId)

// Delete message
await viewModel.deleteMessage(messageId: messageId)
```

### WebSocket Events

The app listens for these Socket.IO events:

```swift
// Incoming events
"message:new"       // New message received
"message:updated"   // Message edited/updated
"message:deleted"   // Message deleted
"user:typing"       // User typing status
"message:read"      // Read receipt

// Outgoing events
"typing"            // Send typing status
"message:send"      // Send new message
"message:react"     // Add reaction
"message:edit"      // Edit message
"message:delete"    // Delete message
```

## Design System

### Colors
```swift
// Sent messages
Blue gradient: #007AFF to #007AFF90

// Received messages
Gray gradient: #E9E9EB to #F2F2F7 (light)
Gray gradient: #2C2C2E to #3A3A3C (dark)

// Accents
Primary: .blue
Secondary: .secondary
Success: .green
Error: .red
```

### Typography
```swift
Message content: .system(size: 17, weight: .regular)
Sender name: .system(size: 13, weight: .medium)
Timestamp: .system(size: 13, weight: .regular)
Reactions: .system(size: 16)
```

### Spacing
```swift
Message padding: .horizontal(16), .vertical(10)
Bubble max width: 70% of screen
Bubble corner radius: 20pt
Avatar size: 40pt circle
Input min height: 50pt
Send button: 44pt circle
```

## API Integration

### Endpoints
```
GET    /api/conversations/:id/messages?limit=50&offset=0
POST   /api/messages
PUT    /api/messages/:id
DELETE /api/messages/:id
POST   /api/messages/:id/read
POST   /api/messages/:id/reactions
DELETE /api/messages/:id/reactions/:emoji
POST   /api/messages/:id/translate
```

### Request/Response Models

```swift
// Send Message
struct MessageSendRequest: Codable {
    let conversationId: String
    let content: String
    let type: MessageType
    let attachmentIds: [String]?
    let replyTo: String?
}

// Message Response
struct Message: Codable {
    let id: String
    let conversationId: String
    let senderId: String
    let senderName: String?
    let content: String
    let type: MessageType
    let attachments: [Attachment]
    let reactions: [MessageReaction]
    let translations: [Translation]
    let readBy: [String]
    let isEdited: Bool
    let createdAt: Date
    let updatedAt: Date
}
```

## Offline Support

Messages are queued when offline and sent when connection is restored:

```swift
// Queue message for offline sync
offlineQueueManager.queueMessage(message)

// Retry failed messages
await viewModel.retryFailedMessage(message)

// Show offline indicator
if !NetworkMonitor.shared.isConnected {
    // Display offline banner
}
```

## Testing

### Unit Tests
```swift
// Test message grouping
func testMessageGrouping() {
    let messages = [/* test messages */]
    let groups = MessageGrouper.groupByDate(messages)
    XCTAssertEqual(groups.count, expectedCount)
}

// Test message sending
func testSendMessage() async {
    await viewModel.sendMessage(content: "Test")
    XCTAssertEqual(viewModel.messages.count, 1)
}
```

### UI Tests
```swift
// Test message input
func testMessageInput() {
    app.textFields["Message..."].tap()
    app.textFields["Message..."].typeText("Hello")
    app.buttons["Send"].tap()
    XCTAssertTrue(app.staticTexts["Hello"].exists)
}
```

## Performance Optimization

### Image Caching
```swift
// Use AsyncImage with caching
AsyncImage(url: URL(string: imageUrl)) { image in
    image.resizable()
} placeholder: {
    ProgressView()
}
```

### Lazy Loading
```swift
// Use LazyVStack for efficient rendering
LazyVStack {
    ForEach(messages) { message in
        MessageRow(message: message)
    }
}
```

### Pagination
```swift
// Load more on scroll
if viewModel.hasMoreMessages {
    await viewModel.loadMoreMessages()
}
```

## Accessibility

All views include proper accessibility labels:

```swift
// Message bubble
.accessibilityLabel("Message from \(senderName) at \(time): \(content)")

// Send button
.accessibilityLabel("Send message")

// Attachment button
.accessibilityLabel("Attach file")

// Voice button
.accessibilityLabel("Record voice message")
```

## Known Limitations

1. Voice recording requires AVAudioRecorder integration
2. Image picker needs PHPickerViewController integration
3. Document picker needs UIDocumentPickerViewController
4. Location sharing needs CoreLocation integration
5. Link preview generation is placeholder
6. Push notifications for new messages not included

## Future Enhancements

- [ ] Voice message recording and playback
- [ ] Animated GIF support
- [ ] Message search
- [ ] Message pinning
- [ ] Conversation muting
- [ ] Custom notification sounds
- [ ] Message forwarding to multiple chats
- [ ] Poll creation and voting
- [ ] Scheduled messages
- [ ] Message encryption (E2E)

## Dependencies

- SwiftUI (iOS 16+)
- Combine
- AVKit (for video playback)
- Foundation
- UIKit (for keyboard management)

## Support

For issues or questions:
- Check the inline documentation
- Review the code comments
- Test with preview providers
- Consult the main app architecture docs

---

**Version**: 1.0.0
**Last Updated**: 2025-01-22
**iOS Support**: 16.0+
