import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// The QR bitmap is minted on demand, so `ShareLink` — which needs its item at
/// view-construction time — cannot carry it. Wrapping the render in an
/// `Identifiable` value lets `.sheet(item:)` own the presentation instead:
/// SwiftUI anchors the iPad popover and picks the presenting scene, which the
/// manual top-VC walk this replaces got wrong on both counts.
private struct QRShareImage: Identifiable {
    let id = UUID()
    let image: UIImage
}

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
    @Environment(\.dismiss) private var dismiss

    init(link: TrackingLink) {
        self.link = link
        _viewModel = StateObject(wrappedValue: TrackingDetailViewModel(token: link.token, isActive: link.isActive))
    }

    var body: some View {
        LinksPage(title: link.displayName, accent: MeeshyColors.trackingAccent) {
            VStack(spacing: MeeshySpacing.xl) {
                heroTicket
                activeRow
                figuresBand
                clicksChart
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
            title: link.displayName,
            code: link.shortUrl,
            tint: MeeshyColors.trackingAccent,
            systemImage: "cursorarrow.click",
            size: .hero,
            isFlipped: false,
            isSelected: false,
            isDragging: false,
            label: "\(link.displayName), \(link.shortUrl)",
            statusLabel: viewModel.isActive ? TrackingDetailCopy.active : TrackingDetailCopy.inactive,
            onPress: nil,
            stub: { heroActions },
            leading: { EmptyView() },
            trailing: {
                MeeshyCodeCard(payload: URL(string: link.shortUrl)?.absoluteString, label: TrackingDetailCopy.enlargeQR,
                               tint: MeeshyColors.trackingAccent, style: .plain, size: .mini, tilt: .none,
                               boostsBrightness: false, onPress: { generateQRAndShare() })
            },
            status: { EmptyView() },
            back: { EmptyView() }
        )
        .accessibilityIdentifier("tracking.detail.hero")
    }

    private var heroActions: some View {
        MeeshyActionGrid(columns: .fixed(3)) {
            MeeshyLabeledAction(title: TrackingDetailCopy.copy, systemImage: "doc.on.doc", tint: MeeshyColors.trackingAccent,
                                hint: link.shortUrl, action: {
                LinksClipboard.copy(link.shortUrl, confirmation: .inline, message: TrackingDetailCopy.copied)
            })
            MeeshyLabeledAction(title: TrackingDetailCopy.qr, systemImage: "qrcode", tint: MeeshyColors.trackingAccent,
                                action: { generateQRAndShare() })
            MeeshyLabeledAction(title: TrackingDetailCopy.share, systemImage: "square.and.arrow.up",
                                tint: MeeshyColors.trackingAccent, action: {
                sharedLink = URL(string: link.shortUrl).map { ShareableLink(url: $0) }
            })
            .disabled(URL(string: link.shortUrl) == nil)
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

    private static let qrContext = CIContext()

    private func generateQRAndShare() {
        guard let url = URL(string: link.shortUrl),
              let filter = CIFilter(name: "CIQRCodeGenerator") else { return }
        filter.setValue(url.absoluteString.data(using: .utf8), forKey: "inputMessage")
        filter.setValue("H", forKey: "inputCorrectionLevel")
        guard let ciImage = filter.outputImage else { return }
        let scaled = ciImage.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        guard let cgImage = Self.qrContext.createCGImage(scaled, from: scaled.extent) else { return }
        qrShareImage = QRShareImage(image: UIImage(cgImage: cgImage))
    }

    private func deleteLink() {
        Task {
            do {
                try await TrackingLinkService.shared.deleteLink(token: link.token)
                await MainActor.run { dismiss() }
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
    @Published private(set) var isActive: Bool
    @Published private(set) var insights = TrackingLinkInsights(samples: [])

    let token: String
    private let setActiveRemote: @Sendable (String, Bool) async throws -> Void

    init(token: String,
         isActive: Bool = true,
         setActiveRemote: @escaping @Sendable (String, Bool) async throws -> Void = { token, isActive in
             try await TrackingLinkService.shared.setActive(token: token, isActive: isActive)
         }) {
        self.token = token
        self.isActive = isActive
        self.setActiveRemote = setActiveRemote
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
