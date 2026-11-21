import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce que la face Liens présente par-dessus elle : ma carte en plein écran, ou une feuille.
nonisolated enum ProfileLinksPresented: Hashable, Identifiable {
    case card(ProfileCardMode)
    case scanner
    case create
    case createShare
    case createTracking
    case createReferral

    var id: String {
        switch self {
        case .card(let mode): return "card.\(mode.rawValue)"
        case .scanner: return "scanner"
        case .create: return "create"
        case .createShare: return "createShare"
        case .createTracking: return "createTracking"
        case .createReferral: return "createReferral"
        }
    }

    var cardMode: ProfileCardMode? {
        if case .card(let mode) = self { return mode }
        return nil
    }
}

/// Les présentations de la face Liens, à part pour que la face garde un `body` court : la carte de profil en plein
/// écran (sans sélecteur de faces, loi 5), le lecteur de QR, « Nouveau lien » puis le formulaire de la famille choisie
/// — une seule feuille dont le contenu change, jamais deux feuilles empilées —, et la feuille d'envoi Meeshy.
struct ProfileLinksPresentations: ViewModifier {
    let user: MeeshyUser?
    let link: ProfileLink?
    let accentColor: String
    /// Les visites de mon lien ce mois (#19489), que la création « Mon profil » rappelle ; `nil` tant qu'elles manquent.
    var profileVisits: Int? = nil
    @Binding var presented: ProfileLinksPresented?
    @Binding var sent: SharedContentWrapper?
    let onOpen: (Route) -> Void
    let onCreated: () -> Void

    @Environment(\.meeshyConversationList) private var conversationList
    /// « Mon profil » choisi dans « Nouveau lien » : la carte s'ouvre une fois la feuille partie.
    @State private var opensCardAfterSheet = false
    /// « Mettre en story » choisi sur la carte : le composer s'ouvre semé une fois la carte partie.
    @State private var storyAfterCard = DeferredSheetFollowUp<UIImage>()

    private var card: Binding<ProfileCardMode?> {
        Binding(get: { presented?.cardMode }, set: { mode in presented = mode.map { .card($0) } })
    }

    private var sheet: Binding<ProfileLinksPresented?> {
        Binding(get: { presented?.cardMode == nil ? presented : nil }, set: { presented = $0 })
    }

    func body(content: Content) -> some View {
        content
            .fullScreenCover(item: card, onDismiss: { openStoryIfAsked() }) { mode in
                if let link {
                    ProfileCardView(user: user, link: link, accentColor: accentColor, mode: mode,
                                    onStory: { image in storyAfterCard.schedule(image) })
                        .closesForConversationOpening(.sheet)
                }
            }
            .sheet(item: sheet, onDismiss: { openCardIfAsked() }) { item in sheetContent(item) }
            .modifier(MeeshySendSheet(sent: $sent))
    }

    @ViewBuilder
    private func sheetContent(_ item: ProfileLinksPresented) -> some View {
        switch item {
        case .scanner:
            ProfileQRScannerSheet()
        case .create:
            ProfileLinkCreateChooser(accent: Color(hex: accentColor), profileVisits: profileVisits, onPick: { pick($0) })
        case .createShare:
            CreateShareLinkView { _ in onCreated() }
                .conversationListObject(conversationList)
        case .createTracking:
            CreateTrackingLinkView(owner: user.map { TrackingLinkOwner(userId: $0.id, username: $0.username) },
                                   onCreate: { _ in onCreated() })
                .environment(\.meeshyConversationList, conversationList)
        case .createReferral:
            AffiliateCreateView { _ in onCreated() }
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        case .card:
            EmptyView()
        }
    }

    private func openStoryIfAsked() {
        guard let image = storyAfterCard.consume() else { return }
        NotificationCenter.default.post(name: .openStoryComposerSeeded, object: image)
    }

    private func openCardIfAsked() {
        guard opensCardAfterSheet else { return }
        opensCardAfterSheet = false
        presented = .card(.qr)
    }

    /// Le choix de « Nouveau lien » remplace la feuille par le formulaire de sa famille.
    private func pick(_ creation: ProfileLinkCreation) {
        switch creation {
        case .profile:
            opensCardAfterSheet = true
            presented = nil
        case .share: presented = .createShare
        case .tracking: presented = .createTracking
        case .referral: presented = .createReferral
        case .community:
            presented = nil
            onOpen(.communityLinks)
        }
    }
}
