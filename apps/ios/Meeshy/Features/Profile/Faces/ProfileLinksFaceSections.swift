import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Mes adresses

/// « Mes adresses » sur la face Liens (planche `Moi-Liens`) : un rail de billets compacts (K30), chaque billet avec
/// son glyphe, son titre et son adresse en chasse fixe, puis le billet fantôme « Ajouter ». Une adresse masquée de la
/// vitrine se lit barrée. Tout geste mène à « Mes adresses », où elles se règlent. « Nouveau » suit le titre à sa
/// première apparition pour ce compte.
struct ProfileAddressesRail: View {
    @ObservedObject var store: ProfileAddressesStore
    let accent: Color
    let accountId: String?
    let onManage: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            ProfileNoveltyReader(feature: .myAddresses, accountId: accountId) { badge in
                MeeshySectionHeader(title: ProfileLinksCopy.addressesTitle, titleBadge: badge, tint: accent,
                                    lead: { EmptyView() }, accessory: { manage })
            }
            content
        }
        .accessibilityIdentifier("profile.links.addresses")
    }

    private var manage: some View {
        MeeshyGlassButton(systemImage: "slider.horizontal.3", label: ProfileLinksCopy.manageAddresses, size: .s36,
                          glyphTint: accent, action: onManage)
    }

    @ViewBuilder
    private var content: some View {
        switch (store.phase, store.addresses.isEmpty) {
        case (.loading, true):
            rail { ForEach(0..<2, id: \.self) { _ in MeeshyTicket(title: "", code: "", size: .compact, kind: .loading) } }
        case (.failed, true):
            MeeshyStateBlock(kind: .error, title: ProfileLinksCopy.addressesUnavailable,
                             primary: MeeshyStateBlockAction(title: ProfileLinksCopy.retry, systemImage: "arrow.clockwise",
                                                             perform: { Task { await store.refresh() } }),
                             art: .none, size: .compact, tint: accent)
        case (_, true):
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                MeeshyNote(ProfileLinksCopy.addressesEmpty, lead: .systemImage("link.badge.plus"), tint: accent)
                rail { addTicket }
            }
        default:
            rail {
                ForEach(store.addresses) { address in ticket(address) }
                if store.canAdd { addTicket }
            }
        }
    }

    private func rail<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: MeeshySpacing.md) { content() }
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.vertical, MeeshySpacing.xxs)
        }
        .padding(.horizontal, -MeeshySpacing.lg)
    }

    private func ticket(_ address: ProfileAddress) -> some View {
        MeeshyTicket(title: address.title, code: address.displayURL, tint: accent,
                     systemImage: ProfileLinksCopy.glyph(of: address.glyph), size: .compact,
                     kind: address.isShown ? .normal : .struck,
                     label: ProfileLinksCopy.addressLabel(address),
                     statusLabel: address.isShown ? nil : ProfileLinksCopy.addressHidden, onPress: onManage)
    }

    private var addTicket: some View {
        MeeshyTicket(title: ProfileLinksCopy.addAddress, code: "", tint: accent, systemImage: "plus", size: .compact,
                     kind: .ghost, label: ProfileLinksCopy.addAddress, onPress: onManage)
            .accessibilityIdentifier("profile.links.addresses.add")
    }
}

// MARK: - Liens créés

/// « Liens créés » (planche `Moi-Liens`) : l'en-tête et le compte des liens actifs, les filtres par famille (K04), puis
/// un billet de rangée (K30) par lien, avec son chiffre — arrivées sur un plafond, clics, membres, filleuls —, sa jauge
/// quand il est plafonné (K42) et son échéance. Copier se fait du billet ; toucher le billet ouvre son détail.
struct ProfileCreatedLinks: View {
    @ObservedObject var model: ProfileLinksFaceModel
    let accent: Color
    let onOpen: (Route) -> Void
    let onCreate: () -> Void

    @Environment(\.locale) private var locale
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// Le détail ouvert depuis un billet : porté par la liste, il survit au passage du billet entre « servants » et
    /// « À l'arrêt », au changement de filtre et à la suppression du lien.
    @State private var opened: ProfileCreatedLinkDestination?

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileLinksCopy.createdTitle, lead: { EmptyView() }, accessory: { header })
            content
        }
        .modifier(ProfileCreatedLinkDetailHost(opened: $opened))
        .accessibilityIdentifier("profile.links.created")
    }

    @ViewBuilder
    private var header: some View {
        HStack(spacing: MeeshySpacing.sm) {
            if model.phase == .ready {
                Text(ProfileLinksCopy.activeCount(model.summary.activeCount()))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundStyle(ThemeManager.shared.textMuted)
            }
            MeeshyGlassButton(systemImage: "plus", label: ProfileLinksCopy.createLink, size: .s36,
                              glyphTint: accent, action: onCreate)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch model.phase {
        case .loading:
            ForEach(0..<3, id: \.self) { _ in MeeshyTicket(title: "", code: "", kind: .loading) }
        case .failed:
            MeeshyStateBlock(kind: .error, title: ProfileLinksCopy.createdUnavailable,
                             primary: MeeshyStateBlockAction(title: ProfileLinksCopy.retry, systemImage: "arrow.clockwise",
                                                             perform: { Task { await model.refresh() } }),
                             art: .none, size: .compact, tint: accent)
        case .ready where model.summary.tickets.isEmpty:
            firstLink
        case .ready:
            filters
            tickets(model.summary.serving(model.visibleTickets))
            stoppedSection(model.summary.stopped(model.visibleTickets))
        }
    }

    private func tickets(_ tickets: [LinksFaceTicket]) -> some View {
        ForEach(tickets) { ticket in
            ProfileCreatedLinkTicket(ticket: ticket, accent: accent, locale: locale,
                                     destination: destination(of: ticket), onOpen: onOpen,
                                     onOpenDetail: { opened = $0 },
                                     onSwitch: { isActive in setActive(isActive, ticketId: ticket.id) })
        }
    }

    /// L'interrupteur d'un billet : le geste vaut tout de suite, un refus se défait et se dit.
    private func setActive(_ isActive: Bool, ticketId: String) {
        Task {
            let accepted = await model.setActive(isActive, ticketId: ticketId)
            if accepted { return }
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(ProfileLinksCopy.switchRefused)
        }
    }

    /// « À l'arrêt » (planche `Etat-Erreur` vue 4) : les liens pleins, en pause ou expirés passent sous ceux qui servent,
    /// sous leur propre en-tête et leur compte.
    @ViewBuilder
    private func stoppedSection(_ stopped: [LinksFaceTicket]) -> some View {
        if !stopped.isEmpty {
            MeeshySectionHeader(title: ProfileLinksCopy.stoppedTitle, count: stopped.count, form: .overline)
                .padding(.top, MeeshySpacing.sm)
                .accessibilityIdentifier("profile.links.stopped")
            tickets(stopped)
        }
    }

    /// Les familles proposées quand je n'ai encore créé aucun lien (planche `Etat-Vide` vue 1).
    static let firstLinkShortcuts: [LinksFaceFamily] = [.share, .tracking, .referral]

    /// La page d'une famille de liens, où l'on crée le premier.
    static func route(for family: LinksFaceFamily) -> Route {
        switch family {
        case .share: return .shareLinks
        case .tracking: return .trackingLinks
        case .community: return .communityLinks
        case .referral: return .affiliate
        }
    }

    /// Aucun lien créé : « Ton premier lien t'attend », « Créer un lien », et un raccourci par famille.
    private var firstLink: some View {
        VStack(spacing: MeeshySpacing.md) {
            MeeshyStateBlock(kind: .empty, title: ProfileLinksCopy.firstLinkTitle,
                             primary: MeeshyStateBlockAction(title: ProfileLinksCopy.createLink, systemImage: "plus",
                                                             perform: onCreate),
                             art: .ghost(.ticket, count: 2), tint: accent)
            // Aux tailles d'accessibilité, les trois raccourcis passent en colonne plutôt que de tronquer leurs noms.
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: MeeshySpacing.sm) { firstLinkShortcutButtons }
            } else {
                HStack(spacing: MeeshySpacing.sm) { firstLinkShortcutButtons }
            }
        }
    }

    private var firstLinkShortcutButtons: some View {
        ForEach(Self.firstLinkShortcuts, id: \.self) { family in
            MeeshyButton(ProfileLinksCopy.familyName(family), systemImage: ProfileLinksCopy.familyGlyph(family),
                         kind: .outline, size: .s36, tint: accent,
                         action: { onOpen(Self.route(for: family)) })
        }
    }

    private var filters: some View {
        MeeshyChipRow(
            model.summary.filters.map(chip(for:)),
            selection: [model.filter],
            label: ProfileLinksCopy.filterLabel,
            surface: .theme,
            size: .compact,
            onChange: { _, filter in model.filter = filter }
        )
    }

    private func chip(for filter: LinksFaceFilter) -> MeeshyChip<LinksFaceFilter> {
        switch filter {
        case .all:
            return MeeshyChip(id: filter, title: ProfileLinksCopy.filterAll)
        case .family(let family):
            return MeeshyChip(id: filter, title: ProfileLinksCopy.familyName(family),
                              systemImage: ProfileLinksCopy.familyGlyph(family), tint: ProfileCreatedLinkTicket.tint(of: family))
        }
    }

    /// Où mène un billet : le détail du lien quand l'app en a un, sinon la page de sa famille.
    private func destination(of ticket: LinksFaceTicket) -> ProfileCreatedLinkDestination {
        switch ticket.family {
        case .share:
            guard let link = model.shareLink(id: ticket.id) else { return .route(.shareLinks) }
            return .share(link, onChanged: { model.replace($0) }, onDeleted: { model.remove(shareLinkId: $0) })
        case .tracking:
            guard let link = model.trackingLink(id: ticket.id) else { return .route(.trackingLinks) }
            return .tracking(link, onChanged: { model.replace($0) }, onDeleted: { model.remove(trackingLinkId: $0) })
        case .community:
            return model.communityLink(id: ticket.id).map(ProfileCreatedLinkDestination.community) ?? .route(.communityLinks)
        case .referral:
            return .route(.affiliate)
        }
    }
}
