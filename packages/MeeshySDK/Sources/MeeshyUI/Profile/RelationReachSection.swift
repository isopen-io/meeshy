import SwiftUI
import MeeshySDK

// MARK: - Où le trouver, sur la Vitrine d'un autre (#18871, #20177)
//
// La face Liens n'existe plus : ce qu'elle DISAIT de lui se range sur sa Vitrine —
// « Ses adresses », celles que la fiche me SERT et seulement elles (le serveur filtre par cercle, rien n'est déduit
// ici), puis « Ses communautés ouvertes » (#19444). Ce qu'elle FAISAIT avec son lien (envoyer, copier, son QR) vit dans
// « Sa fiche », sur la face Actions. Ouvrir une adresse dit d'abord qu'on quitte Meeshy. Rien de servi, rien de posé.

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

struct RelationReachSection: View {
    let addresses: [ProfileAddress]
    let communities: [ProfileOpenCommunity]
    let tint: Color
    let onLeave: () -> Void

    @Environment(\.openURL) private var openURL
    @Environment(\.profileCommunityDoor) private var communityDoor
    @State private var leaving: ProfileAddress?

    /// Ce que la fiche me sert de lui : rien, et la section ne se pose pas.
    static func isShown(addresses: [ProfileAddress], communities: [ProfileOpenCommunity]) -> Bool {
        !addresses.isEmpty || !communities.isEmpty
    }

    @ViewBuilder
    static func of(_ sheet: UserProfileSheet) -> some View {
        let profile = sheet.loader.profile
        let addresses = profile?.addresses?.items ?? []
        let communities = profile?.openCommunities?.items ?? []
        if isShown(addresses: addresses, communities: communities) {
            RelationReachSection(addresses: addresses, communities: communities, tint: sheet.accentTint,
                                 onLeave: { sheet.dismiss() })
                .padding(.horizontal, MeeshySpacing.xl)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxl) {
            if !addresses.isEmpty { addressesSection }
            if !communities.isEmpty {
                RelationOpenCommunitiesSection(communities: communities, tint: tint, join: communityDoor?.join,
                                               onOpen: communityOpening)
            }
        }
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

    private var isLeaving: Binding<Bool> {
        Binding(get: { leaving != nil }, set: { if !$0 { leaving = nil } })
    }

    /// Une carte de groupe du kit (K43), une rangée (K06) par adresse, la sortie de Meeshy en accessoire : ces adresses
    /// s'ouvrent hors de l'app.
    private var addressesSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: RelationLinksCopy.addressesTitle, count: addresses.count)
            MeeshyGroupCard(layout: .group) {
                MeeshyGroupCardRows(addresses, id: \.id) { address in
                    MeeshyToggleRow(address.title, systemImage: address.glyph.systemImage, subtitle: address.displayURL,
                                    accessory: .external, tint: tint, action: { leaving = address })
                        .accessibilityHint(Text(RelationLinksCopy.leaveMessage(address.host)))
                }
            }
            MeeshyNote(RelationLinksCopy.visibleToYou(addresses.count), lead: .systemImage("eye"))
        }
        .accessibilityIdentifier("profile.relation.links.addresses")
    }

    private func open(_ address: ProfileAddress) {
        leaving = nil
        guard let url = address.opening() else { return }
        openURL(url)
    }
}

/// Le QR de son lien de profil, en grand (K31) : on le montre à quelqu'un d'autre, qui le scanne. Sur iPhone, c'est
/// aussi le geste sans contact.
struct RelationLinksCodeSheet: View {
    let link: ProfileLink
    let name: String
    let tint: Color

    var body: some View {
        VStack(spacing: MeeshySpacing.lg) {
            MeeshySectionHeader(title: name)
            MeeshyCodeCard(payload: link.url.absoluteString, label: RelationLinksCopy.enlargeQR(name),
                           caption: link.displayText, tint: tint, size: .large)
            MeeshyNote(link.displayText, lead: .systemImage("link"), tint: tint)
            Spacer(minLength: 0)
        }
        .padding(MeeshySpacing.xl)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }
}

/// Les mots de « Ses adresses » et de son QR (#18871).
enum RelationLinksCopy {
    static func enlargeQR(_ name: String) -> String {
        let format = String(localized: "profile.relation.links.enlargeQR", defaultValue: "Agrandir le QR de %@", bundle: .module)
        return String(format: format, name)
    }
    static var addressesTitle: String {
        String(localized: "profile.relation.links.addresses", defaultValue: "Ses adresses", bundle: .module)
    }
    /// « 1 visible pour toi », « 3 visibles pour toi » : le pluriel vient du catalogue, dans chaque langue.
    static func visibleToYou(_ count: Int) -> String {
        String(localized: "profile.relation.links.addresses.visible.count", defaultValue: "\(count) visibles pour toi",
               bundle: .module)
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
}
