import SwiftUI
import MeeshySDK
import MeeshyUI

/// La face Liens de MA fiche (#18871, planche `Moi-Liens`) : ce qui amène vers moi.
///
/// Faite du kit (loi 12) : mon lien de profil sur un billet héros (K30) avec son QR (K31) et ses quatre gestes libellés
/// (K32) — Copier, QR, Envoyer, Sans contact —, « Mes adresses » en billets compacts sur un rail, « Liens créés » en
/// billets de rangée filtrés par famille (K04), chacun avec son chiffre. Le cache se peint d'abord, le réseau revalide
/// en silence (loi 8) ; une section vide a une sortie, une section en échec a « Réessayer ».
///
/// `showsHeader` : l'en-tête de face (avatar, « Mes liens », pseudo, scanner) n'apparaît que sur ma fiche ; la page
/// « Mes liens » poussée a déjà le sien.
struct ProfileLinksFace: View {
    let user: MeeshyUser?
    let accentColor: String
    let showsHeader: Bool
    /// Une demande de création venue d'ailleurs (le bouton à côté du sélecteur de faces) : ouverte, puis consommée.
    let createRequested: Binding<Bool>
    let onOpen: (Route) -> Void

    @StateObject private var links: ProfileLinksFaceModel
    @ObservedObject private var addresses: ProfileAddressesStore
    @StateObject private var visits: ProfileLinkVisitsModel
    @State private var presented: ProfileLinksPresented?
    @State private var sent: SharedContentWrapper?

    init(user: MeeshyUser?, accentColor: String, showsHeader: Bool = true,
         createRequested: Binding<Bool> = .constant(false),
         links: ProfileLinksFaceModel? = nil, addresses: ProfileAddressesStore = .shared,
         visits: ProfileLinkVisitsModel? = nil, onOpen: @escaping (Route) -> Void) {
        self.user = user
        self.accentColor = accentColor
        self.showsHeader = showsHeader
        self.createRequested = createRequested
        self.onOpen = onOpen
        _links = StateObject(wrappedValue: links ?? ProfileLinksFaceModel())
        _addresses = ObservedObject(wrappedValue: addresses)
        _visits = StateObject(wrappedValue: visits ?? ProfileLinkVisitsModel())
    }

    private var accent: Color { Color(hex: accentColor) }
    private var profileLink: ProfileLink? { ProfileLink(username: user?.username) }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxl) {
            if showsHeader { header.meeshyCascade(rank: 0) }
            if let profileLink {
                ProfileNoveltyReader(feature: .profileLink, accountId: user?.id) { badge in
                    profileTicket(profileLink, badge: badge)
                }
                .meeshyCascade(rank: 1)
            }
            ProfileAddressesRail(store: addresses, accent: accent, accountId: user?.id,
                                 onManage: { onOpen(.myAddresses) })
                .meeshyCascade(rank: 2)
            ProfileCreatedLinks(model: links, accent: accent, onOpen: onOpen,
                                onCreate: { presented = .create })
                .meeshyCascade(rank: 3)
        }
        .task { await loadAll() }
        .task(id: createRequested.wrappedValue) { openRequestedCreation() }
        .modifier(ProfileLinksPresentations(
            user: user, link: profileLink, accentColor: accentColor, profileVisits: visits.monthVisits,
            presented: $presented, sent: $sent, onOpen: onOpen, onCreated: { Task { await links.refresh() } }
        ))
    }

    private func openRequestedCreation() {
        guard createRequested.wrappedValue else { return }
        createRequested.wrappedValue = false
        presented = .create
    }

    private func loadAll() async {
        async let created: Void = links.load()
        async let mine: Void = addresses.load()
        async let counted: Void = visits.load(ownerId: user?.id, link: profileLink)
        _ = await (created, mine, counted)
    }

    // MARK: - En-tête

    private var header: some View {
        ProfileFaceHeader(user: user, title: ProfileLinksCopy.title, accentColor: accentColor,
                          identifier: "profile.links.header") {
            MeeshyGlassButton(systemImage: "qrcode.viewfinder", label: ProfileLinksCopy.scan, size: .s44,
                              action: { presented = .scanner })
        }
    }

    // MARK: - Mon lien de profil

    /// Le billet héros : « Mon lien de profil », l'adresse en chasse fixe, « 1 719 visites ce mois » dès que la
    /// passerelle le sert (#19489, rien sinon) et le QR qui s'agrandit ; sous la coupe, les quatre gestes. Le QR ne
    /// porte que l'adresse publique, jamais une donnée de cercle. « Nouveau » suit le titre à sa première apparition.
    private func profileTicket(_ link: ProfileLink, badge: String?) -> some View {
        let month = visits.monthVisits
        let spoken = [ProfileLinksCopy.profileLinkTitle, link.displayText, month.map { ProfileLinksCopy.visitsFigure($0) }]
        return MeeshyTicket(
            title: ProfileLinksCopy.profileLinkTitle,
            code: link.displayText,
            tint: accent,
            figure: month.map { $0.formatted() },
            figureCaption: month.map { ProfileLinksCopy.visitsThisMonth($0) },
            size: .hero,
            isFlipped: false,
            isSelected: false,
            isDragging: false,
            label: spoken.compactMap { $0 }.joined(separator: ", "),
            titleBadge: badge,
            onPress: nil,
            stub: { profileActions(link) },
            leading: { EmptyView() },
            trailing: {
                MeeshyCodePlate(payload: link.url.absoluteString, label: ProfileLinksCopy.enlargeQR, tint: accent,
                                side: MeeshyCodeCardSize.mini.side, style: .plain, onPress: { presented = .card(.qr) })
            },
            status: { EmptyView() },
            back: { EmptyView() }
        )
        .accessibilityAction(named: Text(ProfileLinksCopy.enlargeQR)) { presented = .card(.qr) }
        .accessibilityIdentifier("profile.links.profileTicket")
    }

    private func profileActions(_ link: ProfileLink) -> some View {
        MeeshyActionGrid(columns: .fixed(4)) {
            MeeshyLabeledAction(title: ProfileLinksCopy.copy, systemImage: "doc.on.doc", tint: accent,
                                hint: link.displayText,
                                action: { LinksClipboard.copy(link.url.absoluteString, message: ProfileLinksCopy.copied) })
            MeeshyLabeledAction(title: ProfileLinksCopy.qr, systemImage: "qrcode", tint: accent,
                                action: { presented = .card(.qr) })
            MeeshyLabeledAction(title: ProfileLinksCopy.send, systemImage: "paperplane", tint: accent,
                                action: { sendProfile(link) })
            MeeshyLabeledAction(title: ProfileLinksCopy.contactless, systemImage: "wave.3.right", tint: accent,
                                action: { presented = .card(.contactless) })
        }
    }

    /// « Envoyer » : ma vitrine part comme une carte dans une conversation, par la feuille d'envoi Meeshy.
    private func sendProfile(_ link: ProfileLink) {
        guard let user else { return }
        sent = SharedContentWrapper(subject: .card(ProfileLinksShare.card(of: user, link: link)))
    }
}

/// La carte d'un profil qui part dans une conversation : son nom, son pseudo, son avatar et l'adresse courte.
enum ProfileLinksShare {
    static func card(of user: MeeshyUser, link: ProfileLink) -> ShareCard {
        ShareCard(kind: .profile, contentId: user.id, title: user.displayName ?? user.username,
                  subtitle: "@\(link.username)", url: link.url, imageURL: user.avatar, detail: bio(user.bio))
    }

    /// La carte d'un AUTRE, telle que la fiche la remet (#19442) : la même carte, sa bio sous son pseudo.
    static func card(of request: ProfileSendRequest) -> ShareCard {
        ShareCard(kind: .profile, contentId: request.userId, title: request.displayName,
                  subtitle: "@\(request.username)", url: request.url, imageURL: request.avatarURL, detail: request.bio)
    }

    private static func bio(_ text: String?) -> String? {
        let trimmed = (text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
