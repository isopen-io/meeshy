import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// Le détail d'un lien de suivi (planche `Lien-Detail`, #18871) : le billet héros et son QR, les gestes, les chiffres,
/// le graphique des clics, d'où ils viennent, avec quoi, et les derniers clics. Fait du kit : rien n'y est redessiné.
struct TrackingLinkDetailView: View {
    let link: TrackingLink

    @StateObject var viewModel: TrackingDetailViewModel
    @State var period: TrackingInsightsPeriod = .month
    @State var selectedDay: String?
    @State private var showDeleteConfirm = false
    @State private var qrShareImage: QRShareImage?
    @State private var sharedLink: ShareableLink?
    @State var isEditing = false
    @State var isMapEnlarged = false
    @Environment(\.dismiss) private var dismiss

    /// Le lien tel que l'écran le montre : la dernière modification retenue, sinon celui qu'on a ouvert.
    var current: TrackingLink { viewModel.edited ?? link }

    /// Le lien tel que le détail l'a laissé (interrupteur, modification) : la liste qui l'a ouvert le reflète.
    private let onChanged: @MainActor (TrackingLink) -> Void
    /// Le lien supprimé : la liste qui l'a ouvert le retire.
    private let onDeleted: @MainActor (String) -> Void

    init(link: TrackingLink, onChanged: @escaping @MainActor (TrackingLink) -> Void = { _ in },
         onDeleted: @escaping @MainActor (String) -> Void = { _ in }) {
        self.link = link
        self.onChanged = onChanged
        self.onDeleted = onDeleted
        _viewModel = StateObject(wrappedValue: TrackingDetailViewModel(token: link.token, isActive: link.isActive))
    }

    var body: some View {
        LinksPage(title: current.displayName, accent: MeeshyColors.trackingAccent) {
            VStack(spacing: MeeshySpacing.xl) {
                heroTicket
                activeRow
                figuresBand
                clicksChart
                visitorMapSection
                originsSection
                meansSection
                recentClicksSection
                utmInfoSection
                deleteButton
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.lg).padding(.bottom, 60)
            .sheet(item: $sharedLink) { shared in
                ShareSheet(activityItems: shared.activityItems)
            }
        }
        .task { await viewModel.load() }
        .task { await viewModel.loadVisitorMap() }
        .onReceive(viewModel.$isActive.dropFirst().removeDuplicates()) { isActive in
            onChanged(current.withActive(isActive))
        }
        .onReceive(viewModel.$edited.dropFirst().compactMap { $0 }) { edited in
            onChanged(edited.withActive(viewModel.isActive))
        }
        .sheet(isPresented: $isEditing) { editSheet }
        .fullScreenCover(isPresented: $isMapEnlarged) { enlargedMap }
        .confirmationDialog(String(localized: "tracking.link.detail.confirmDelete", defaultValue: "Supprimer ce lien ?", bundle: .main), isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button(String(localized: "tracking.link.detail.delete", defaultValue: "Supprimer", bundle: .main), role: .destructive) { deleteLink() }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
        }
        .sheet(item: $qrShareImage) { qr in
            ShareSheet(activityItems: [qr.image])
        }
    }

    // MARK: - Le billet héros

    private var heroTicket: some View {
        MeeshyTicket(
            title: current.displayName,
            code: current.shortUrl,
            tint: MeeshyColors.trackingAccent,
            systemImage: "cursorarrow.click",
            size: .hero,
            isFlipped: false,
            isSelected: false,
            isDragging: false,
            label: "\(current.displayName), \(current.shortUrl)",
            statusLabel: viewModel.isActive ? TrackingDetailCopy.active : TrackingDetailCopy.inactive,
            onPress: nil,
            stub: { heroActions },
            leading: { EmptyView() },
            trailing: {
                MeeshyCodeCard(payload: URL(string: current.shortUrl)?.absoluteString, label: TrackingDetailCopy.enlargeQR,
                               tint: MeeshyColors.trackingAccent, style: .plain, size: .mini, tilt: .none,
                               boostsBrightness: false, onPress: { generateQRAndShare() })
            },
            status: { EmptyView() },
            back: { EmptyView() }
        )
        .accessibilityIdentifier("tracking.detail.hero")
    }

    private var heroActions: some View {
        MeeshyActionGrid(columns: .fixed(4)) {
            MeeshyLabeledAction(title: TrackingDetailCopy.copy, systemImage: "doc.on.doc", tint: MeeshyColors.trackingAccent,
                                hint: current.shortUrl, action: {
                LinksClipboard.copy(current.shortUrl, confirmation: .inline, message: TrackingDetailCopy.copied)
            })
            MeeshyLabeledAction(title: TrackingDetailCopy.qr, systemImage: "qrcode", tint: MeeshyColors.trackingAccent,
                                action: { generateQRAndShare() })
            MeeshyLabeledAction(title: TrackingDetailCopy.share, systemImage: "square.and.arrow.up",
                                tint: MeeshyColors.trackingAccent, action: {
                sharedLink = URL(string: current.shortUrl).map { ShareableLink(url: $0) }
            })
            .disabled(URL(string: current.shortUrl) == nil)
            MeeshyLabeledAction(title: TrackingDetailCopy.edit, systemImage: "pencil", tint: MeeshyColors.trackingAccent,
                                action: { isEditing = true })
                .accessibilityIdentifier("tracking.detail.edit")
        }
    }

    // MARK: - Actif

    /// L'interrupteur répond au toucher ; le serveur confirme ensuite, et l'état revient s'il refuse.
    private var activeRow: some View {
        MeeshyToggleRow(TrackingDetailCopy.active,
                        subtitle: viewModel.isActive ? nil : TrackingDetailCopy.inactiveHint,
                        accessory: .toggle(isOn: viewModel.isActive),
                        tint: MeeshyColors.trackingAccent,
                        action: { Task { await viewModel.setActive(!viewModel.isActive) } })
            .accessibilityIdentifier("tracking.detail.active")
    }

    // MARK: - Supprimer

    private var deleteButton: some View {
        MeeshyButton(TrackingDetailCopy.deleteLink, systemImage: "trash", kind: .outline, width: .fill,
                     isDestructive: true, action: { showDeleteConfirm = true })
            .accessibilityIdentifier("tracking.detail.delete")
    }

    // MARK: - QR

    private func generateQRAndShare() {
        qrShareImage = LinkQRCode.shareImage(for: current.shortUrl)
    }

    private func deleteLink() {
        Task {
            do {
                try await TrackingLinkService.shared.deleteLink(token: current.token)
                await MainActor.run {
                    onDeleted(link.id)
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    HapticFeedback.error()
                    FeedbackToastManager.shared.showError(ShareLinkDetailCopy.actionFailed)
                }
            }
        }
    }
}

// MARK: - ViewModel

@MainActor
class TrackingDetailViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published var clicks: [TrackingLinkClick] = []
    @Published var isLoadingMore = false
    @Published var isActive: Bool
    @Published private(set) var insights = TrackingLinkInsights(samples: [])
    /// Le lien tel que la dernière modification l'a laissé ; `nil` tant qu'on ne l'a pas modifié.
    @Published var edited: TrackingLink?
    /// La carte des visiteurs ; `nil` tant que le serveur ne la sert pas (antérieur à #19412) : la section se tait.
    @Published var visitorMap: TrackingVisitorMapState?

    let token: String
    private let setActiveRemote: @Sendable (String, Bool) async throws -> Void
    let placesRemote: @Sendable (String, Date) async throws -> TrackingLinkPlaceStats
    let updateRemote: @Sendable (String, TrackingLinkChanges) async throws -> TrackingLink
    let locate: @MainActor (TrackingVisitorPlace) async -> TrackingVisitorZone?

    init(token: String,
         isActive: Bool = true,
         setActiveRemote: @escaping @Sendable (String, Bool) async throws -> Void = { token, isActive in
             try await TrackingLinkService.shared.setActive(token: token, isActive: isActive)
         },
         placesRemote: @escaping @Sendable (String, Date) async throws -> TrackingLinkPlaceStats = { token, since in
             try await TrackingLinkService.shared.fetchVisitorPlaces(token: token, since: since)
         },
         updateRemote: @escaping @Sendable (String, TrackingLinkChanges) async throws -> TrackingLink = { token, changes in
             try await TrackingLinkService.shared.updateLink(token: token, changes: changes)
         },
         locate: @escaping @MainActor (TrackingVisitorPlace) async -> TrackingVisitorZone? = { place in
             await TrackingPlaceGeocoder.locate(place)
         }) {
        self.token = token
        self.isActive = isActive
        self.setActiveRemote = setActiveRemote
        self.placesRemote = placesRemote
        self.updateRemote = updateRemote
        self.locate = locate
    }

    func load() async {
        isLoadingMore = true
        defer { isLoadingMore = false }
        if let detail = try? await TrackingLinkService.shared.fetchClicks(token: token) {
            clicks = detail.clicks
            insights = TrackingLinkInsights(samples: detail.clicks.map { TrackingClickSample(click: $0) })
        }
    }

    /// Optimiste : l'état change tout de suite, et revient si le serveur refuse — en le disant.
    func setActive(_ newValue: Bool) async {
        let previous = isActive
        guard previous != newValue else { return }
        isActive = newValue
        do {
            try await setActiveRemote(token, newValue)
        } catch {
            isActive = previous
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(ShareLinkDetailCopy.actionFailed)
        }
    }

    /// Avant le premier chargement, la vue montre un squelette — jamais quand des clics sont déjà là.
    var isFirstLoad: Bool { isLoadingMore && clicks.isEmpty }
}
