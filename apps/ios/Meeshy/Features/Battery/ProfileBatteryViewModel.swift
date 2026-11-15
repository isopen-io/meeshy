import Foundation
import MeeshySDK

/// Ce qui se souvient que l'offre de partage à un Proche a été faite (une seule fois par personne et par compte).
protocol BatteryConsentRemembering: AnyObject {
    func wasOffered(viewerId: String, peerId: String) -> Bool
    func markOffered(viewerId: String, peerId: String)
}

/// La batterie sur la fiche d'une personne (#14147) : mon partage avec ELLE (l'offre unique à un Proche, case non
/// cochée), puis, au Sang seulement, la demande de relevé — que la passerelle limite.
@MainActor
final class ProfileBatteryViewModel: ObservableObject {

    enum PullState: Equatable {
        case idle
        case sending
        case requested
    }

    let userId: String
    @Published private(set) var settings: BatteryPersonSettings?
    @Published private(set) var showsConsentOffer = false
    @Published var consentChecked = false
    @Published private(set) var pullState: PullState = .idle
    @Published var notice: String?

    private let service: BatteryServiceProviding
    private let consent: BatteryConsentRemembering
    private let viewerId: () -> String?

    nonisolated deinit {}

    init(
        userId: String,
        service: BatteryServiceProviding,
        consent: BatteryConsentRemembering,
        viewerId: @escaping () -> String?
    ) {
        self.userId = userId
        self.service = service
        self.consent = consent
        self.viewerId = viewerId
    }

    /// `asksConsent` : la personne est à Proche (entre Sangs, le partage est actif d'office).
    func load(asksConsent: Bool) async {
        guard let served = try? await service.personSettings(userId: userId) else { return }
        settings = served
        guard asksConsent, !served.isShared, let viewer = viewerId() else {
            showsConsentOffer = false
            return
        }
        showsConsentOffer = !consent.wasOffered(viewerId: viewer, peerId: userId)
    }

    /// La réponse à l'offre : la case décide, et l'offre ne revient plus — le réglage reste dans la fiche.
    func answerConsent() async {
        if let viewer = viewerId() { consent.markOffered(viewerId: viewer, peerId: userId) }
        showsConsentOffer = false
        guard consentChecked else { return }
        await setShared(true)
    }

    /// Le réglage de partage avec CETTE personne, posé tout de suite et rendu à l'échec.
    func setShared(_ shared: Bool) async {
        guard let update = BatteryPersonSettingsUpdate(isShared: shared) else { return }
        let previous = settings
        if let current = settings {
            settings = BatteryPersonSettings(userId: current.userId, isShared: shared, receive: current.receive)
        }
        do {
            settings = try await service.updatePersonSettings(userId: userId, update)
        } catch {
            settings = previous
            notice = String(localized: "battery.settings.saveFailed", defaultValue: "Réglage non enregistré, réessaie", bundle: .main)
        }
    }

    func requestReading() async {
        guard pullState != .sending else { return }
        pullState = .sending
        switch await service.pull(userId: userId) {
        case .requested:
            pullState = .requested
        case .tooSoon:
            pullState = .requested
            notice = String(localized: "battery.pull.tooSoon", defaultValue: "Un relevé a déjà été demandé il y a moins de 5 minutes", bundle: .main)
        case .forbidden:
            pullState = .idle
            notice = String(localized: "battery.pull.forbidden", defaultValue: "Seul un Sang peut demander un relevé", bundle: .main)
        case .rateLimited, .failed:
            pullState = .idle
            notice = String(localized: "battery.pull.failed", defaultValue: "Demande non envoyée, réessaie", bundle: .main)
        }
    }
}
