// Message, MessageAttachment, Reaction, ReactionSummary, ChatMessage, MessageReaction
// are now sourced from MeeshySDK/Models/CoreModels.swift to avoid type ambiguity.
// ReplyReference and ForwardReference are also in the SDK.
// Typealiases provide backward-compatible short names for the app layer.

import MeeshySDK

typealias Message = MeeshyMessage
typealias MessageAttachment = MeeshyMessageAttachment
typealias Reaction = MeeshyReaction
typealias ReactionSummary = MeeshyReactionSummary
typealias ChatMessage = MeeshyChatMessage
typealias MessageReaction = MeeshyMessageReaction
