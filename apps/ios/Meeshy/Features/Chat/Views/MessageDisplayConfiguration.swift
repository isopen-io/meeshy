//
//  MessageDisplayConfiguration.swift
//  Meeshy
//
//  Configuration for unified message display across Feed and Conversation views
//  Allows customizing message bubble behavior without code duplication
//

import SwiftUI

// MARK: - Message Display Mode

/// Defines how messages are displayed in different contexts
enum MessageDisplayMode: Equatable {
    /// Full conversation mode with all features
    case conversation

    /// Feed mode with simplified UI (no avatars, compact reactions)
    case feed

    /// Read-only mode (no interactions, just display)
    case readOnly

    /// Compact mode for replies/previews
    case compact
}

// MARK: - Message Bubble Configuration

/// Configuration for message bubble appearance and behavior
struct MessageBubbleConfiguration: Equatable {
    // MARK: - Display Options

    /// The display mode for the message
    let mode: MessageDisplayMode

    /// Whether to show sender avatar
    let showAvatar: Bool

    /// Whether to show sender name
    let showSenderName: Bool

    /// Whether to show timestamp
    let showTimestamp: Bool

    /// Whether to show read receipts
    let showReadReceipts: Bool

    /// Whether to show reaction badges
    let showReactions: Bool

    /// Whether to show translation icon
    let showTranslationIcon: Bool

    // MARK: - Interaction Options

    /// Whether long press menu is enabled
    let enableLongPressMenu: Bool

    /// Whether tap to reply is enabled
    let enableTapToReply: Bool

    /// Whether swipe to reply is enabled
    let enableSwipeToReply: Bool

    /// Whether attachment tap opens fullscreen
    let enableAttachmentFullscreen: Bool

    // MARK: - Layout Options

    /// Maximum width ratio (0.0-1.0) relative to screen
    let maxWidthRatio: CGFloat

    /// Horizontal padding for the bubble
    let horizontalPadding: CGFloat

    /// Vertical spacing between messages
    let verticalSpacing: CGFloat

    /// Whether to use compact spacing
    let compactSpacing: Bool

    // MARK: - Presets

    /// Standard conversation configuration
    static let conversation = MessageBubbleConfiguration(
        mode: .conversation,
        showAvatar: true,
        showSenderName: true,
        showTimestamp: true,
        showReadReceipts: true,
        showReactions: true,
        showTranslationIcon: true,
        enableLongPressMenu: true,
        enableTapToReply: true,
        enableSwipeToReply: true,
        enableAttachmentFullscreen: true,
        maxWidthRatio: 0.75,
        horizontalPadding: 12,
        verticalSpacing: 8,
        compactSpacing: false
    )

    /// Feed configuration (simplified UI)
    static let feed = MessageBubbleConfiguration(
        mode: .feed,
        showAvatar: false,
        showSenderName: true,
        showTimestamp: true,
        showReadReceipts: false,
        showReactions: true,
        showTranslationIcon: false,
        enableLongPressMenu: true,
        enableTapToReply: false,
        enableSwipeToReply: false,
        enableAttachmentFullscreen: true,
        maxWidthRatio: 0.85,
        horizontalPadding: 12,
        verticalSpacing: 6,
        compactSpacing: true
    )

    /// Read-only configuration (no interactions)
    static let readOnly = MessageBubbleConfiguration(
        mode: .readOnly,
        showAvatar: true,
        showSenderName: true,
        showTimestamp: true,
        showReadReceipts: false,
        showReactions: true,
        showTranslationIcon: false,
        enableLongPressMenu: false,
        enableTapToReply: false,
        enableSwipeToReply: false,
        enableAttachmentFullscreen: true,
        maxWidthRatio: 0.75,
        horizontalPadding: 12,
        verticalSpacing: 8,
        compactSpacing: false
    )

    /// Compact configuration for previews/replies
    static let compact = MessageBubbleConfiguration(
        mode: .compact,
        showAvatar: false,
        showSenderName: false,
        showTimestamp: false,
        showReadReceipts: false,
        showReactions: false,
        showTranslationIcon: false,
        enableLongPressMenu: false,
        enableTapToReply: false,
        enableSwipeToReply: false,
        enableAttachmentFullscreen: false,
        maxWidthRatio: 1.0,
        horizontalPadding: 8,
        verticalSpacing: 4,
        compactSpacing: true
    )
}

// MARK: - Message List Configuration

/// Configuration for the message list container
struct MessageListConfiguration: Equatable {
    /// Display mode
    let mode: MessageDisplayMode

    /// Whether to show load more button
    let showLoadMore: Bool

    /// Whether to auto-scroll to bottom on new messages
    let autoScrollToBottom: Bool

    /// Whether to show typing indicator
    let showTypingIndicator: Bool

    /// Whether to show date separators
    let showDateSeparators: Bool

    /// Whether to show unread separator
    let showUnreadSeparator: Bool

    /// Whether messages are in reversed order (newest at bottom)
    let reversedOrder: Bool

    /// Bubble configuration to use
    let bubbleConfiguration: MessageBubbleConfiguration

    // MARK: - Presets

    /// Standard conversation list
    static let conversation = MessageListConfiguration(
        mode: .conversation,
        showLoadMore: true,
        autoScrollToBottom: true,
        showTypingIndicator: true,
        showDateSeparators: true,
        showUnreadSeparator: true,
        reversedOrder: true,
        bubbleConfiguration: .conversation
    )

    /// Feed list
    static let feed = MessageListConfiguration(
        mode: .feed,
        showLoadMore: true,
        autoScrollToBottom: true,
        showTypingIndicator: true,
        showDateSeparators: false,
        showUnreadSeparator: false,
        reversedOrder: true,
        bubbleConfiguration: .feed
    )

    /// Read-only list
    static let readOnly = MessageListConfiguration(
        mode: .readOnly,
        showLoadMore: false,
        autoScrollToBottom: false,
        showTypingIndicator: false,
        showDateSeparators: true,
        showUnreadSeparator: false,
        reversedOrder: false,
        bubbleConfiguration: .readOnly
    )
}

// MARK: - Environment Key

private struct MessageDisplayConfigurationKey: EnvironmentKey {
    static let defaultValue: MessageBubbleConfiguration = .conversation
}

extension EnvironmentValues {
    var messageDisplayConfiguration: MessageBubbleConfiguration {
        get { self[MessageDisplayConfigurationKey.self] }
        set { self[MessageDisplayConfigurationKey.self] = newValue }
    }
}

extension View {
    /// Sets the message display configuration for this view hierarchy
    func messageDisplayConfiguration(_ configuration: MessageBubbleConfiguration) -> some View {
        environment(\.messageDisplayConfiguration, configuration)
    }
}
