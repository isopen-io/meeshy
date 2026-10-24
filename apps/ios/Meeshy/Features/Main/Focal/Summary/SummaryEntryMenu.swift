import SwiftUI
import MeeshySDK

// MARK: - Le menu d'appui long d'une entrée du Résumé (#11225)
//
// Un visage de la rampe et un épisode désignent chacun UN message — celui où
// leur toucher mène : la première preuve d'un visage, le premier message d'un
// épisode. Leur menu porte sur ce même message, jamais sur un autre : « Aller
// au message » y mène comme le toucher, « Répondre » le cite. Miroir de
// `summary-exits.ts` et `summary-entry-menu.tsx` (web) — mêmes actions, même
// ordre, mêmes mots.

/// Ce que le menu d'une entrée du Résumé offre, dans l'ordre où il l'offre.
enum SummaryEntryAction: CaseIterable, Hashable {
    case goToMessage, reply

    /// Nommée par LA table des verbes (#11234) : « Répondre » dit le mot du
    /// menu d'un message, « Aller au message » celui de la galerie.
    var verb: MessageActionVerb {
        switch self {
        case .goToMessage: return .goToMessage
        case .reply: return .reply
        }
    }

    /// Le message qu'un visage désigne ; `nil` : il ne désigne rien, et n'a pas de menu.
    static func target(of entry: FaceRampEntry) -> String? {
        entry.evidenceMessageIds.first
    }

    /// Le message qu'un épisode désigne ; `nil` : il ne désigne rien, et n'a pas de menu.
    static func target(of episode: ConversationEpisode) -> String? {
        episode.messageIds.first
    }

    /// **Ce que le menu offre pour ce message, selon la loi d'actions du SDK.**
    /// « Répondre » suit `MessageActionPolicy` telle que `MessageMenuContext.make`
    /// la projette pour le menu d'un message — supprimé, conversation fermée,
    /// canal d'annonces, invité sans droit d'envoi, vue unique : pas de citation.
    /// Le Résumé ne réécrit aucune règle. Un message sorti de la fenêtre se
    /// rejoint encore, mais aucune loi ne l'ouvre à la citation.
    static func offered(
        for message: Message?,
        authority: ConversationMenuAuthority,
        now: Date
    ) -> [SummaryEntryAction] {
        guard let message else { return [.goToMessage] }
        let law = MessageMenuContext.make(message: message, facts: MessageMenuFacts(), authority: authority, now: now)
        return law.canReply ? [.goToMessage, .reply] : [.goToMessage]
    }
}

/// `actionsOf` dit ce qui s'offre pour le message qu'une entrée désigne ;
/// `run` l'exécute. Construit une fois par l'hôte du Résumé, remis à chaque
/// visage et à chaque épisode.
struct SummaryEntryMenu {
    let actionsOf: (String) -> [SummaryEntryAction]
    let run: (SummaryEntryAction, String) -> Void

    /// `run` RELIT la loi au moment du choix : un droit retiré entre
    /// l'ouverture du menu et le geste mène au message sans le citer.
    static func make(
        offered: @escaping (String) -> [SummaryEntryAction],
        goTo: @escaping (String) -> Void,
        reply: @escaping (String) -> Void
    ) -> SummaryEntryMenu {
        SummaryEntryMenu(
            actionsOf: offered,
            run: { action, messageId in
                goTo(messageId)
                guard action == .reply, offered(messageId).contains(.reply) else { return }
                reply(messageId)
            }
        )
    }
}

// MARK: - Le geste

/// Le menu système à l'appui long, posé sur le message qu'une entrée désigne,
/// et pour VoiceOver les MÊMES actions nommées : on y arrive sans le savoir et
/// sans voir. Sans cible ni menu, la vue reste intacte.
struct SummaryEntryMenuModifier: ViewModifier {
    let target: String?
    let menu: SummaryEntryMenu?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let target, let menu {
            content
                .contextMenu { SummaryEntryMenuButtons(target: target, menu: menu) }
                .accessibilityActions { SummaryEntryMenuButtons(target: target, menu: menu) }
        } else {
            content
        }
    }
}

private struct SummaryEntryMenuButtons: View {
    let target: String
    let menu: SummaryEntryMenu

    var body: some View {
        ForEach(menu.actionsOf(target), id: \.self) { action in
            Button {
                menu.run(action, target)
            } label: {
                Label(action.verb.label, systemImage: action.verb.symbol)
            }
        }
    }
}
