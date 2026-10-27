import Foundation

enum CallDeclineQuickReply: String, CaseIterable, Identifiable {
    case callBack
    case meeting
    case cantTalk
    case writeMe

    var id: String { rawValue }

    var text: String {
        switch self {
        case .callBack:
            return String(localized: "call.decline.reply.callBack", defaultValue: "Je te rappelle.", bundle: .main)
        case .meeting:
            return String(localized: "call.decline.reply.meeting", defaultValue: "Je suis en réunion.", bundle: .main)
        case .cantTalk:
            return String(localized: "call.decline.reply.cantTalk", defaultValue: "Je ne peux pas parler pour l’instant.", bundle: .main)
        case .writeMe:
            return String(localized: "call.decline.reply.writeMe", defaultValue: "Écris-moi, je te réponds vite.", bundle: .main)
        }
    }

    static var interfaceLanguage: String? {
        Bundle.main.preferredLocalizations.first
            .map { Locale(identifier: $0).language.languageCode?.identifier ?? $0 }
    }
}

struct CallDeclineReplyPlan: Equatable, Sendable {
    let conversationId: String
    let content: String
    let originalLanguage: String?
}

enum CallDeclineReplyRule {
    static let maxLength = 500

    static func plan(
        isDeclinable: Bool,
        conversationId: String?,
        text: String,
        originalLanguage: String?
    ) -> CallDeclineReplyPlan? {
        guard isDeclinable, let conversationId, !conversationId.isEmpty else { return nil }
        let content = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxLength))
        guard !content.isEmpty else { return nil }
        return CallDeclineReplyPlan(
            conversationId: conversationId,
            content: content,
            originalLanguage: originalLanguage
        )
    }
}
