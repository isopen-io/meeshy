import SwiftUI
import MeeshySDK
import MeeshyUI

/// La fiche d'un lien de communauté (planche `Lien-Communaute`, #18871).
///
/// De haut en bas : le billet héros, son QR et ses gestes (Copier · QR · Partager · Modifier), les chiffres, les
/// entrées sur trente jours, les règles d'entrée, les entrées récentes, puis Fermer les entrées. Fait du kit : rien
/// n'y est redessiné. Le lien s'affiche depuis la ligne qui l'a ouvert (cache d'abord) ; la communauté et ses
/// arrivées viennent ensuite, sans jamais bloquer la fiche.
struct CommunityLinkDetailView: View {
    @StateObject var viewModel: CommunityLinkDetailViewModel
    @Environment(\.colorScheme) var colorScheme
    @Environment(\.dismiss) private var dismiss
    @State private var showsMore = false
    @State private var isEditing = false
    @State private var qrShareImage: QRShareImage?
    @State private var sharedLink: ShareableLink?
    @State var selectedDay: String?

    init(link: CommunityLink) {
        _viewModel = StateObject(wrappedValue: CommunityLinkDetailViewModel.live(link: link))
    }

    var isDark: Bool { colorScheme == .dark }
    var link: CommunityLink { viewModel.link }
    static let accent = MeeshyColors.communityAccent

    var body: some View {
        LinksPage(title: CommunityLinkDetailCopy.pageTitle, accent: Self.accent,
                  action: LinksPageAction(label: ShareLinkDetailCopy.more, systemImage: "ellipsis") { showsMore = true }) {
            VStack(spacing: MeeshySpacing.xl) {
                heroTicket
                figuresBand
                entriesChart
                entryRules
                recentSection
                closeButton
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.lg)
            .padding(.bottom, 60)
        }
        .task { await viewModel.load() }
        .confirmationDialog(link.name, isPresented: $showsMore, titleVisibility: .visible) {
            Button(CommunityLinkDetailCopy.copyIdentifier) {
                LinksClipboard.copy(link.identifier, message: CommunityLinkDetailCopy.identifierCopied)
            }
            if viewModel.details?.settingsCommunity != nil {
                Button(ShareLinkDetailCopy.edit) { isEditing = true }
            }
            Button(ShareLinkDetailCopy.cancel, role: .cancel) {}
        }
        .sheet(isPresented: $isEditing) { editSheet }
        .sheet(item: $qrShareImage) { qr in ShareSheet(activityItems: [qr.image]) }
        .sheet(item: $sharedLink) { shared in ShareSheet(activityItems: shared.activityItems) }
    }

    // MARK: - Le billet héros (K30 + K31 + K32)

    private var address: String {
        link.joinUrl.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "")
    }

    private var heroTicket: some View {
        MeeshyTicket(
            title: link.name,
            code: address,
            tint: Self.accent,
            systemImage: "person.3.fill",
            size: .hero,
            label: "\(link.name), \(address)",
            statusLabel: link.isActive ? ShareLinkDetailCopy.active : ShareLinkDetailCopy.inactive,
            stub: { heroStub },
            leading: { EmptyView() },
            trailing: {
                MeeshyCodeCard(payload: URL(string: link.joinUrl)?.absoluteString, label: TrackingDetailCopy.enlargeQR,
                               tint: Self.accent, style: .plain, size: .mini, tilt: .none,
                               boostsBrightness: false, onPress: { showQR() })
            },
            status: { EmptyView() },
            back: { EmptyView() }
        )
        .accessibilityIdentifier("communityLink.detail.hero")
    }

    /// « Tu l'animes · 342 membres » : la pile des entrées récentes (K48) quand il y en a, sinon l'avatar de la
    /// communauté.
    private var heroStub: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            let faces = viewModel.headFaces
            if faces.isEmpty {
                MeeshyPersonRow(title: stewardshipLine, size: .inline, showsDivider: false) {
                    MeeshyAvatar(name: link.name, context: .custom(26), kind: .entity,
                                 avatarURL: viewModel.details?.avatar, isDark: isDark)
                }
            } else {
                LinksFaceStack(members: faces, summary: stewardshipLine,
                               label: ProfileLinksCopy.facesLabel(stewardshipLine, faces: faces),
                               tint: Self.accent)
                    .accessibilityIdentifier("communityLink.detail.faces")
            }
            heroActions
        }
    }

    /// « Tu l'animes · 342 membres » : ce que le lecteur est pour la communauté, puis son compte.
    var stewardshipLine: String {
        let members = CommunityLinkDetailCopy.members(viewModel.memberCount)
        switch viewModel.stewardship {
        case .animates: return "\(CommunityLinkDetailCopy.animates) · \(members)"
        case .moderates: return "\(CommunityLinkDetailCopy.moderates) · \(members)"
        case .member: return members
        }
    }

    private var heroActions: some View {
        MeeshyActionGrid(columns: .fixed(4)) {
            MeeshyLabeledAction(title: TrackingDetailCopy.copy, systemImage: "doc.on.doc", tint: Self.accent,
                                hint: address, action: {
                LinksClipboard.copy(link.joinUrl, confirmation: .inline, message: ShareLinkDetailCopy.copied)
            })
            MeeshyLabeledAction(title: TrackingDetailCopy.qr, systemImage: "qrcode", tint: Self.accent,
                                action: { showQR() })
                .disabled(URL(string: link.joinUrl) == nil)
            MeeshyLabeledAction(title: ShareLinkDetailCopy.share, systemImage: "square.and.arrow.up", tint: Self.accent,
                                action: { sharedLink = URL(string: link.joinUrl).map { ShareableLink(url: $0) } })
                .disabled(URL(string: link.joinUrl) == nil)
            MeeshyLabeledAction(title: ShareLinkDetailCopy.edit, systemImage: "pencil", tint: Self.accent,
                                action: { isEditing = true })
                .disabled(viewModel.details?.settingsCommunity == nil)
        }
    }

    // MARK: - Fermer les entrées (K40)

    private var closeButton: some View {
        let isClosed = viewModel.isClosed ?? false
        return MeeshyButton(isClosed ? CommunityLinkDetailCopy.reopenEntries : CommunityLinkDetailCopy.closeEntries,
                            systemImage: isClosed ? "door.left.hand.open" : "door.left.hand.closed",
                            kind: .outline, width: .fill, isDestructive: !isClosed,
                            action: { setClosed(!isClosed) })
            .disabled(viewModel.isClosed == nil)
            .accessibilityIdentifier("communityLink.detail.close")
    }

    // MARK: - Modifier (feuille)

    @ViewBuilder
    private var editSheet: some View {
        if let community = viewModel.details?.settingsCommunity {
            CommunitySettingsView(
                community: community,
                onUpdated: { _ in
                    isEditing = false
                    Task { await viewModel.load() }
                },
                onDeleted: { leaveFiche() },
                onLeft: { leaveFiche() },
                onCancel: { isEditing = false }
            )
        }
    }

    // MARK: - Actions

    private func showQR() {
        qrShareImage = LinkQRCode.shareImage(for: link.joinUrl)
    }

    private func setClosed(_ closed: Bool) {
        HapticFeedback.light()
        Task {
            guard await viewModel.setEntriesClosed(closed) else {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(ShareLinkDetailCopy.actionFailed)
                return
            }
        }
    }

    private func leaveFiche() {
        isEditing = false
        dismiss()
    }
}

extension CommunityLinkDetailViewModel {
    /// Les sources réelles — la communauté, la dernière page de ses membres, l'écriture de sa confidentialité —,
    /// branchées par la vue : la fabrique vit chez son hôte, jamais dans le ViewModel.
    static func live(link: CommunityLink) -> CommunityLinkDetailViewModel {
        CommunityLinkDetailViewModel(
            link: link,
            viewerId: AuthManager.shared.currentUser?.id,
            loadDetails: { id in
                let community = try await CommunityService.shared.get(communityId: id)
                return CommunityLinkDetails(community: community)
            },
            loadEntries: { id in
                try await latestMembers(communityId: id).compactMap { CommunityLinkEntry(member: $0) }
            },
            setPrivate: { id, closed in
                _ = try await CommunityService.shared.update(communityId: id, name: nil, identifier: nil,
                                                             description: nil, isPrivate: closed, avatar: nil,
                                                             banner: nil)
            }
        )
    }

    nonisolated private static func latestMembers(communityId: String) async throws -> [APICommunityMember] {
        let size = CommunityLinkEntries.pageSize
        let first = try await CommunityService.shared.getMembers(communityId: communityId, offset: 0, limit: size)
        guard let offset = CommunityLinkEntries.latestPageOffset(total: first.pagination?.total, pageSize: size) else {
            return first.data
        }
        return try await CommunityService.shared.getMembers(communityId: communityId, offset: offset, limit: size).data
    }
}
