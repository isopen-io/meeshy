import Foundation
import MeeshySDK

/// Regroupe les 13 closures de l'API actuelle. Une struct value avec closures
/// optionnelles permet à SwiftUI de comparer la struct par identité d'instance
/// — ce qui n'est pas strictement Equatable mais suffit pour le fast-path
/// car les call-sites construisent les callbacks une fois par config.
///
/// IMPORTANT: cette struct n'est PAS Equatable. Les vues qui la prennent en
/// paramètre doivent l'exclure de leur Equatable manuel — les callbacks ne
/// changent jamais le rendu.
struct BubbleCallbacks {
    var onViewStory: (() -> Void)?
    var onAddReaction: ((String) -> Void)?
    var onToggleReaction: ((String) -> Void)?
    var onOpenReactPicker: ((String) -> Void)?
    var onShowInfo: (() -> Void)?
    var onShowReactions: ((String) -> Void)?
    var onReplyTap: ((String) -> Void)?
    var onStoryReplyTap: ((String) -> Void)?
    var onMediaTap: ((MessageAttachment) -> Void)?
    var onConsumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)?
    var onRequestTranslation: ((String, String) -> Void)?
    var onShowTranslationDetail: ((String) -> Void)?
    var onScrollToMessage: ((String) -> Void)?

    static let empty = BubbleCallbacks()
}
