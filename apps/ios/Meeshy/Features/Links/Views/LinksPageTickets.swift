import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce qu'une page « tous mes liens » montre sous son en-tête (#19601) : les billets fantômes au premier chargement,
/// l'erreur avec « Réessayer » quand rien ne peut se montrer, l'état vide avec « Créer », ou la liste.
enum LinksPagePhase: Equatable {
    case skeleton
    case failed
    case empty
    case list
}

/// La loi des pages de liens : cache d'abord — un lien connu se montre toujours, quel que soit l'état du réseau.
enum LinksPageLaw {
    static func phase(isLoading: Bool, didFail: Bool, hasLinks: Bool) -> LinksPagePhase {
        if MeeshySkeletonLaw.shows(isLoading: isLoading, hasCachedData: hasLinks) { return .skeleton }
        if hasLinks { return .list }
        return didFail ? .failed : .empty
    }

    /// Une liste qui n'a pas pu être relue reste celle qu'on montrait ; une liste relue la remplace, vide comprise.
    static func kept<Link>(current: [Link], fetched: [Link]?) -> [Link] {
        fetched ?? current
    }

    /// Ceux qui servent d'abord, puis « À l'arrêt » (planche `Etat-Erreur` vue 4), chacun dans son ordre.
    static func split(_ tickets: [LinksFaceTicket], now: Date = Date()) -> (serving: [LinksFaceTicket], stopped: [LinksFaceTicket]) {
        (tickets.filter { $0.stoppage(now: now) == nil }, tickets.filter { $0.stoppage(now: now) != nil })
    }
}

/// L'état vide d'une page de liens : une ligne, et le geste qui crée le premier.
struct LinksPageEmpty {
    let title: String
    let createTitle: String
    let onCreate: () -> Void
}

/// La section d'une page de liens, faite du kit : l'en-tête K44 avec son compte, puis ce que `phase` dit de montrer.
struct LinksPageSection<Rows: View>: View {
    let title: String
    let count: Int
    let phase: LinksPagePhase
    let tint: Color
    let empty: LinksPageEmpty
    let onRetry: () -> Void
    @ViewBuilder let rows: () -> Rows

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: title, count: phase == .list ? count : nil, form: .overline)
            switch phase {
            case .skeleton:
                MeeshySkeletonColumn(shape: .ticket(cut: MeeshyTicketRecipe.cut(for: .row)),
                                     loadingLabel: String(localized: "skeleton.links.loading", defaultValue: "Chargement des liens", bundle: .main))
            case .failed:
                MeeshyStateBlock(kind: .error, title: ProfileLinksCopy.createdUnavailable,
                                 primary: MeeshyStateBlockAction(title: ProfileLinksCopy.retry, systemImage: "arrow.clockwise",
                                                                 perform: onRetry),
                                 art: .none, size: .compact, tint: tint)
            case .empty:
                MeeshyStateBlock(kind: .empty, title: empty.title,
                                 primary: MeeshyStateBlockAction(title: empty.createTitle, systemImage: "plus",
                                                                 perform: empty.onCreate),
                                 art: .ghost(.ticket, count: 2), size: .compact, tint: tint)
            case .list:
                rows()
            }
        }
    }
}

/// Les billets d'une page de liens (K30 `.row`, le billet de la face Liens) : ceux qui servent, puis « À l'arrêt ».
/// Sous chaque billet, ce qui le fait reconnaître dans la liste (`footnote` : sa conversation, sa campagne, ses dates).
struct LinksPageTicketList: View {
    let tickets: [LinksFaceTicket]
    let accent: Color
    let footnote: (LinksFaceTicket) -> String?
    let destination: (LinksFaceTicket) -> ProfileCreatedLinkDestination
    let onSwitch: (LinksFaceTicket, Bool) -> Void

    @Environment(\.locale) private var locale
    @Environment(\.routerCommands) private var router

    var body: some View {
        let split = LinksPageLaw.split(tickets)
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            ForEach(split.serving) { row($0) }
            if !split.stopped.isEmpty {
                MeeshySectionHeader(title: ProfileLinksCopy.stoppedTitle, count: split.stopped.count, form: .overline)
                    .padding(.top, MeeshySpacing.sm)
                ForEach(split.stopped) { row($0) }
            }
        }
    }

    private func row(_ ticket: LinksFaceTicket) -> some View {
        ProfileCreatedLinkTicket(ticket: ticket, accent: accent, locale: locale,
                                 destination: destination(ticket),
                                 onOpen: { route in router.push(route) },
                                 onSwitch: { isActive in onSwitch(ticket, isActive) },
                                 footnote: footnote(ticket))
    }
}

/// L'interrupteur d'un billet de page : le geste vaut tout de suite, un refus se défait et se dit.
enum LinksPageSwitchFeedback {
    static func report(accepted: Bool) {
        if accepted { return }
        HapticFeedback.error()
        FeedbackToastManager.shared.showError(ProfileLinksCopy.switchRefused)
    }
}
