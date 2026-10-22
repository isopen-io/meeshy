import SwiftUI
import MeeshySDK

enum BubbleAccessibilityAction: CaseIterable, Equatable {
    case reply, react, copy, openMenu

    var name: String {
        switch self {
        case .reply: return MessageActionVerb.reply.label
        case .react: return String(localized: "media.react.title", defaultValue: "Réagir", bundle: .main)
        case .copy: return MessageActionVerb.copy.label
        case .openMenu: return String(localized: "conversation.row.menu_action", defaultValue: "Ouvrir le menu", bundle: .main)
        }
    }
}

enum BubbleAccessibilityActionSet {
    static func available(canReply: Bool, canReact: Bool, canCopy: Bool, canOpenMenu: Bool) -> [BubbleAccessibilityAction] {
        BubbleAccessibilityAction.allCases.filter { action in
            switch action {
            case .reply: return canReply
            case .react: return canReact
            case .copy: return canCopy
            case .openMenu: return canOpenMenu
            }
        }
    }
}

struct BubbleAccessibilityActionButtons: View {
    let messageId: String
    var onReply: (() -> Void)?
    var onReact: ((String) -> Void)?
    var onCopy: (() -> Void)?
    var onOpenMenu: (() -> Void)?

    var body: some View {
        ForEach(available, id: \.self) { action in
            Button(action.name) { perform(action) }
        }
    }

    private var available: [BubbleAccessibilityAction] {
        BubbleAccessibilityActionSet.available(
            canReply: onReply != nil,
            canReact: onReact != nil,
            canCopy: onCopy != nil,
            canOpenMenu: onOpenMenu != nil
        )
    }

    private func perform(_ action: BubbleAccessibilityAction) {
        switch action {
        case .reply: onReply?()
        case .react: onReact?(messageId)
        case .copy: onCopy?()
        case .openMenu: onOpenMenu?()
        }
    }
}
