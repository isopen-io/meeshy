import SwiftUI
import MeeshySDK
import MeeshyUI


/// **Le salut d'un arrivant se touche** (#16338).
///
/// L'avis d'arrivée se termine, dans toutes les langues du catalogue, par
/// « — dis-lui salut » (`system.members.arrived.*`). Le fil détache cette
/// invite, la rend en gras, et la toucher écrit dans le composeur la mention
/// de chaque arrivant — `@a @b ` —, puis y donne le focus.
nonisolated enum ArrivalGreeting {

    static let separator = " — "

    /// La phrase et son invite, coupées au DERNIER tiret cadratin du catalogue.
    static func split(_ line: String) -> (sentence: String, invite: String?) {
        guard let range = line.range(of: separator, options: .backwards) else { return (line, nil) }
        let invite = line[range.upperBound...].trimmingCharacters(in: .whitespaces)
        guard !invite.isEmpty else { return (line, nil) }
        return (String(line[..<range.lowerBound]), invite)
    }

    /// Les pseudos à saluer, dans l'ordre de l'avis : celui que porte l'avis,
    /// sinon celui que le fil connaît. Un arrivant sans pseudo (visiteur sans
    /// compte, ou inconnu du fil) n'est pas mentionné ; le lecteur ne se salue
    /// pas lui-même.
    static func handles(of arrivals: [(participantId: String, username: String?)],
                        resolving resolve: (String) -> String?,
                        excluding ownHandle: String?) -> [String] {
        let resolved = arrivals.compactMap { arrival in
            (arrival.username?.isEmpty == false ? arrival.username : nil) ?? resolve(arrival.participantId)
        }
        return resolved.reduce(into: [String]()) { kept, handle in
            guard handle != ownHandle, !kept.contains(handle) else { return }
            kept.append(handle)
        }
    }

    /// Le brouillon après le salut : les mentions s'ajoutent à la fin, séparées
    /// du texte par une espace, et une mention déjà écrite ne se répète pas.
    static func inserting(_ handles: [String], into draft: String) -> String {
        let written = Set(draft.split(whereSeparator: \.isWhitespace).map(String.init))
        let missing = handles.map { "@\($0)" }.filter { !written.contains($0) }
        guard !missing.isEmpty else { return draft }
        let lead = draft.isEmpty || draft.last?.isWhitespace == true ? draft : draft + " "
        return lead + missing.joined(separator: " ") + " "
    }
}

extension ArrivalGreeting {
    /// Les arrivants qu'un avis annonce — l'avis individuel, ou la ligne
    /// d'arrivées regroupées de Meeshy Global. Un visiteur sans compte n'a pas
    /// de pseudo à mentionner (`ano_…` est un identifiant technique).
    static func arrivals(of message: Message) -> [(participantId: String, username: String?)] {
        if let join = message.joinNotice {
            return [(join.participantId, join.isAnonymous ? nil : join.username)]
        }
        return message.arrivalsNotice?.arrivals.map { ($0.participantId, $0.username) } ?? []
    }

    /// L'invite qu'un avis offre à ce lecteur : celle de l'avis individuel d'un
    /// AUTRE compte, ou celle de la ligne d'arrivées regroupées (`noticeText`,
    /// déjà composée dans la langue d'interface). Un visiteur sans pseudo n'en a pas.
    static func invite(for message: Message, noticeText: String) -> String? {
        guard message.messageSource == .system else { return nil }
        if let join = message.joinNotice {
            guard !message.isMe, !join.isAnonymous, join.username?.isEmpty == false else { return nil }
            return split(ConversationPreviewCatalog.strings()(.systemMembersArrivedOne, ["first": join.displayName])).invite
        }
        return message.arrivalsNotice == nil ? nil : split(noticeText).invite
    }

    /// Le brouillon après avoir touché l'invite de l'avis `messageId` — `nil`
    /// si l'avis n'est plus dans le fil.
    static func draft(greeting messageId: String, in messages: [Message], ownHandle: String?, draft: String) -> String? {
        guard let notice = messages.first(where: { $0.id == messageId }) else { return nil }
        let handles = Self.handles(of: arrivals(of: notice), resolving: { knownHandle(of: $0, in: messages) }, excluding: ownHandle)
        return inserting(handles, into: draft)
    }

    /// Le pseudo d'un arrivant que le fil connaît déjà — par un message qu'il a signé.
    static func knownHandle(of participantId: String, in messages: [Message]) -> String? {
        messages.first { $0.senderId == participantId && $0.senderUsername?.isEmpty == false }?.senderUsername
    }
}

/// L'invite détachée de l'avis, rendue en GRAS et touchable.
struct ArrivalGreetingInvite: View {
    let text: String
    /// La couleur de la conversation : l'invite se lit comme un geste offert.
    let accentColor: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(text)
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .bold))
                .foregroundStyle(Color(hex: accentColor))
                .multilineTextAlignment(.center)
        }
        .buttonStyle(.plain)
        .accessibilityHint(String(localized: "bubble.arrivals.greet.hint",
                                  defaultValue: "Écrit la mention de chaque arrivant dans le message.",
                                  bundle: .main))
        .accessibilityIdentifier("bubble-arrivals-greet")
    }
}

/// L'avis d'arrivée se lit d'un bloc sous VoiceOver : l'invite y devient une
/// ACTION nommée, sans quoi son bouton serait absorbé par le regroupement.
struct ArrivalGreetingAccessibility: ViewModifier {
    let greeting: ArrivalGreetingInvite?

    func body(content: Content) -> some View {
        if let greeting {
            content.accessibilityAction(named: Text(greeting.text), greeting.action)
        } else {
            content
        }
    }
}
