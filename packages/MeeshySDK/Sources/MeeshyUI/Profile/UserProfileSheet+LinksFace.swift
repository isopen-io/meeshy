import SwiftUI
import MeeshySDK

// MARK: - La face Liens de la fiche d'un autre (#18870, #18871 — planche `Autre-Liens`)
//
// Ce qui amène vers lui : son lien de profil sur un billet (K30) avec son QR (K31) qui s'agrandit, l'adresse en chasse
// fixe, et les gestes du billet en actions libellées (K32) — copier, QR, envoyer son profil, sans contact. Puis « Ses
// adresses » : celles que la fiche me SERT, et seulement elles — le serveur filtre par cercle, rien n'est déduit ici.
// Ouvrir une adresse dit d'abord qu'on quitte Meeshy. Sans pseudo, il n'a pas d'adresse : l'état vide (K38) le dit et
// ramène à sa Vitrine (loi 8 : un état vide a toujours une sortie). Sous ses adresses, ce que mon cercle tient fermé, en
// rangées verrouillées, puis « Ses communautés ouvertes » (#19444, `RelationLinksReach.swift`).

extension RelationLinksFace {
    static func of(_ sheet: UserProfileSheet) -> RelationLinksFace {
        let profile = sheet.loader.profile
        return RelationLinksFace(
            link: ProfileLink(username: sheet.displayUser.username), name: sheet.displayUser.resolvedDisplayName,
            addresses: profile?.addresses?.items ?? [], lockedAddresses: profile?.lockedAddresses?.groups ?? [],
            communities: profile?.openCommunities?.items ?? [], tint: sheet.accentTint,
            sendRoute: ProfileSendRoute.of(sheet), sendSheet: sheet.sendSheet, onLeave: { sheet.dismiss() },
            onCopy: { sheet.copyProfileLink($0) }, onShowVitrine: { sheet.face = .vitrine },
            joinCommunity: { id in await RelationLinksFace.join(communityId: id) }
        )
    }
}

/// « Envoyer son profil » (#19442) : sa carte part par la feuille d'envoi Meeshy de l'app, sinon par celle du système.
extension ProfileSendRoute {
    @MainActor static func of(_ sheet: UserProfileSheet) -> ProfileSendRoute? {
        let user = sheet.displayUser
        return resolve(userId: sheet.resolvedUserId, displayName: user.resolvedDisplayName,
                       link: ProfileLink(username: user.username), avatarURL: user.avatarURL, bio: user.bio,
                       hostOffered: sheet.sendSheet != nil)
    }
}

extension ProfileSendExits {
    static func of(_ sheet: UserProfileSheet) -> ProfileSendExits {
        let sharing = sheet.$sharesProfile
        let leave = sheet.dismiss
        return ProfileSendExits(close: { sharing.wrappedValue = false },
                                closeProfile: { sharing.wrappedValue = false; leave() })
    }
}

struct RelationLinksFace: View {
    let link: ProfileLink?
    let name: String
    let addresses: [ProfileAddress]
    let lockedAddresses: [ServedLockedAddresses.Group]
    let communities: [ProfileOpenCommunity]
    let tint: Color
    let sendRoute: ProfileSendRoute?
    let sendSheet: ProfileSendSheet?
    let onLeave: () -> Void
    let onCopy: (ProfileLink) -> Void
    let onShowVitrine: () -> Void
    let joinCommunity: (String) async -> Bool

    @Environment(\.openURL) private var openURL
    @Environment(\.profileCommunityDoor) private var communityDoor
    @State private var sharesProfile = false
    @State private var showsCode: RelationLinksCodeMode?
    @State private var leaving: ProfileAddress?

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxl) {
            Group {
                if let link {
                    ticket(link)
                } else {
                    MeeshyStateBlock(
                        kind: .empty,
                        title: String(localized: "profile.relation.links.empty", defaultValue: "Pas encore de lien", bundle: .module),
                        primary: MeeshyStateBlockAction(title: RelationFace.vitrine.title, systemImage: "person.crop.square") {
                            onShowVitrine()
                        },
                        tint: tint
                    )
                }
            }
            .meeshyCascade(rank: 0)
            if !addresses.isEmpty || !lockedAddresses.isEmpty { addressesSection.meeshyCascade(rank: 1) }
            if !communities.isEmpty {
                RelationOpenCommunitiesSection(communities: communities, tint: tint, join: joinCommunity,
                                               onOpen: communityOpening)
                    .meeshyCascade(rank: 2)
            }
        }
        .meeshyCascadeFace()
        .padding(.horizontal, MeeshySpacing.xl)
        .confirmationDialog(RelationLinksCopy.leaveTitle, isPresented: isLeaving, titleVisibility: .visible,
                            presenting: leaving) { address in
            Button(RelationLinksCopy.leaveContinue) { open(address) }
            Button(RelationLinksCopy.cancel, role: .cancel) { leaving = nil }
        } message: { address in
            Text(RelationLinksCopy.leaveMessage(address.host))
        }
    }

    private var communityOpening: ((String) -> Void)? {
        guard let communityDoor else { return nil }
        return { id in
            onLeave()
            communityDoor.open(id)
        }
    }

    static func join(communityId: String) async -> Bool {
        do {
            _ = try await CommunityService.shared.join(communityId: communityId)
            return true
        } catch {
            return false
        }
    }

    private var isLeaving: Binding<Bool> {
        Binding(get: { leaving != nil }, set: { if !$0 { leaving = nil } })
    }

    private func ticket(_ link: ProfileLink) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
            MeeshySectionHeader(
                title: String(localized: "profile.relation.links.title", defaultValue: "Son lien de profil", bundle: .module),
                form: .overline
            )
            MeeshyTicket(
                title: String(localized: "profile.relation.links.ticket", defaultValue: "Ouvre sa vitrine, vue Public", bundle: .module),
                code: link.displayText,
                tint: tint,
                size: .hero,
                isFlipped: false,
                isSelected: false,
                isDragging: false,
                onPress: nil,
                stub: { EmptyView() },
                leading: { EmptyView() },
                trailing: {
                    MeeshyCodeCard(payload: link.url.absoluteString, label: RelationLinksCopy.enlargeQR(name), tint: tint,
                                   style: .plain, size: .mini, tilt: .none, boostsBrightness: false,
                                   onPress: { showsCode = .qr })
                },
                status: { EmptyView() },
                back: { EmptyView() }
            )
            .accessibilityAction(named: Text(RelationLinksCopy.enlargeQR(name))) { showsCode = .qr }
            actions(link)
        }
        .sheet(isPresented: $sharesProfile) {
            ProfileSendPresentation(route: sendRoute, host: sendSheet, exits: ProfileSendExits(
                close: { sharesProfile = false },
                closeProfile: { sharesProfile = false; onLeave() }
            ))
        }
        .sheet(item: $showsCode) { mode in
            RelationLinksCodeSheet(link: link, name: name, tint: tint, mode: mode)
        }
    }

    private func actions(_ link: ProfileLink) -> some View {
        MeeshyActionGrid(columns: .fixed(4)) {
            MeeshyLabeledAction(
                title: String(localized: "profile.relation.action.copy", defaultValue: "Copier", bundle: .module),
                systemImage: "doc.on.doc",
                tint: tint,
                hint: link.displayText,
                action: { onCopy(link) }
            )
            MeeshyLabeledAction(title: RelationLinksCopy.qr, systemImage: "qrcode", tint: tint,
                                action: { showsCode = .qr })
            MeeshyLabeledAction(
                title: ProfileRelationAction.sendProfile.title,
                systemImage: ProfileRelationAction.sendProfile.systemImage,
                tint: tint,
                action: { sharesProfile = true }
            )
            MeeshyLabeledAction(title: RelationLinksCopy.contactless, systemImage: "wave.3.right", tint: tint,
                                action: { showsCode = .contactless })
        }
    }

    // MARK: - Ses adresses

    private var addressesSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: RelationLinksCopy.addressesTitle, count: addresses.isEmpty ? nil : addresses.count)
            if !addresses.isEmpty { servedAddresses }
            RelationLockedAddressRows(groups: lockedAddresses, tint: tint)
        }
        .accessibilityIdentifier("profile.relation.links.addresses")
    }

    private var servedAddresses: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            VStack(spacing: 0) {
                ForEach(Array(addresses.enumerated()), id: \.element.id) { index, address in
                    MeeshyToggleRow(address.title, systemImage: address.glyph.systemImage, subtitle: address.displayURL,
                                    accessory: .chevron, showsDivider: index < addresses.count - 1, tint: tint,
                                    action: { leaving = address })
                        .accessibilityHint(Text(RelationLinksCopy.leaveMessage(address.host)))
                }
            }
            .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg), tone: .theme)
            MeeshyNote(RelationLinksCopy.visibleToYou(addresses.count), lead: .systemImage("eye"))
        }
    }

    private func open(_ address: ProfileAddress) {
        leaving = nil
        guard let url = address.opening() else { return }
        openURL(url)
    }
}

/// Ce que montre la feuille du QR d'un autre : son code, ou le sans contact (le même QR, sur iPhone).
nonisolated enum RelationLinksCodeMode: String, Identifiable {
    case qr
    case contactless

    var id: String { rawValue }
}

/// Le QR de son lien de profil, en grand (K31) : on le montre à quelqu'un d'autre, qui le scanne.
struct RelationLinksCodeSheet: View {
    let link: ProfileLink
    let name: String
    let tint: Color
    let mode: RelationLinksCodeMode

    var body: some View {
        VStack(spacing: MeeshySpacing.lg) {
            MeeshySectionHeader(title: name)
            MeeshyCodeCard(payload: link.url.absoluteString, label: RelationLinksCopy.enlargeQR(name),
                           caption: link.displayText, tint: tint, size: .large)
            MeeshyNote(link.displayText, lead: .systemImage("link"), tint: tint)
            if mode == .contactless {
                MeeshyNote(RelationLinksCopy.noChip, form: .band, lead: .systemImage("wave.3.right"), tint: tint)
            }
            Spacer(minLength: 0)
        }
        .padding(MeeshySpacing.xl)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }
}

/// Les mots de la face Liens d'un autre (#18871).
enum RelationLinksCopy {
    static var qr: String { String(localized: "profile.relation.links.qr", defaultValue: "QR", bundle: .module) }
    static var contactless: String {
        String(localized: "profile.relation.links.contactless", defaultValue: "Sans contact", bundle: .module)
    }
    static func enlargeQR(_ name: String) -> String {
        let format = String(localized: "profile.relation.links.enlargeQR", defaultValue: "Agrandir le QR de %@", bundle: .module)
        return String(format: format, name)
    }
    static var addressesTitle: String {
        String(localized: "profile.relation.links.addresses", defaultValue: "Ses adresses", bundle: .module)
    }
    static func visibleToYou(_ count: Int) -> String {
        let format = String(localized: "profile.relation.links.addresses.visible", defaultValue: "%@ visibles pour toi", bundle: .module)
        return String(format: format, count.formatted())
    }
    static var leaveTitle: String {
        String(localized: "profile.relation.links.leave.title", defaultValue: "Tu quittes Meeshy", bundle: .module)
    }
    static func leaveMessage(_ host: String) -> String {
        let format = String(localized: "profile.relation.links.leave.message", defaultValue: "%@ n'est pas géré par Meeshy. Il s'ouvre dans ton navigateur.", bundle: .module)
        return String(format: format, host)
    }
    static var leaveContinue: String {
        String(localized: "profile.relation.links.leave.continue", defaultValue: "Continuer", bundle: .module)
    }
    static var cancel: String {
        String(localized: "profile.relation.links.leave.cancel", defaultValue: "Annuler", bundle: .module)
    }
    static var noChip: String {
        String(localized: "profile.relation.links.noChip", defaultValue: "Sur iPhone, la puce n'échange pas de profil : le QR fait le même geste.", bundle: .module)
    }
}
