import Foundation

/// MeeshySDK - Core SDK for Meeshy platform
///
/// This SDK provides the core models, networking, and business logic for applications
/// built on the Meeshy platform. It can be integrated into any Swift application
/// to provide Meeshy identity and functionality.

// Re-export all public types
@_exported import struct MeeshySDK.MeeshyConversation
@_exported import struct MeeshySDK.MeeshyConversationTag
@_exported import struct MeeshySDK.MeeshyConversationSection
@_exported import struct MeeshySDK.MeeshyCommunity
@_exported import struct MeeshySDK.MeeshyMessage
@_exported import struct MeeshySDK.MeeshyMessageAttachment
@_exported import struct MeeshySDK.MeeshyReaction
@_exported import struct MeeshySDK.MeeshyReactionSummary
@_exported import struct MeeshySDK.MeeshyUser
@_exported import enum MeeshySDK.ConversationType
@_exported import enum MeeshySDK.ConversationLanguage
@_exported import enum MeeshySDK.ConversationTheme
@_exported import enum MeeshySDK.MessageType

public enum MeeshySDK {
    /// SDK version
    public static let version = "1.0.0"
    
    /// SDK name
    public static let name = "MeeshySDK"
}
