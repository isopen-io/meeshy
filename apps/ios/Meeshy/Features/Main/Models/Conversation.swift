// Models previously defined here (ConversationTag, ConversationSection, Conversation, Community)
// are now sourced from MeeshySDK/Models/CoreModels.swift to avoid type ambiguity.
// Typealiases provide backward-compatible short names for the app layer.

import MeeshySDK

typealias Conversation = MeeshyConversation
typealias ConversationTag = MeeshyConversationTag
typealias ConversationSection = MeeshyConversationSection
typealias Community = MeeshyCommunity
