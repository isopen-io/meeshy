import Foundation
import MeeshySDK

/// Ce qui se souvient que l'offre « Prévenir {name} si mon téléphone est injoignable » a été faite à un Proche (une
/// seule fois par personne et par compte).
protocol PhoneReachabilityConsentRemembering: AnyObject {
    func wasOffered(viewerId: String, peerId: String) -> Bool
    func markOffered(viewerId: String, peerId: String)
}

/// Le téléphone injoignable sur la fiche d'une personne (#18737) : mon partage avec ELLE — l'offre unique à un Proche,
/// case non cochée ; entre Sangs, actif d'office et retirable.
@MainActor
final class ProfilePhoneReachabilityViewModel: ObservableObject {

    let userId: String
    @Published private(set) var settings: PhoneReachabilityPersonSettings?
    @Published private(set) var showsConsentOffer = false
    @Published var consentChecked = false
    @Published var notice: String?

    private let service: PhoneReachabilityServiceProviding
    private let consent: PhoneReachabilityConsentRemembering
    private let viewerId: () -> String?

    nonisolated deinit {}

    init(
        userId: String,
        service: PhoneReachabilityServiceProviding,
        consent: PhoneReachabilityConsentRemembering,
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

    /// Le réglage de partage avec CETTE personne, posé tout de suite et rendu à l'échec. L'alerte servie se garde.
    func setShared(_ shared: Bool) async {
        let previous = settings
        settings = PhoneReachabilityPersonSettings(userId: userId, isShared: shared, alertsMe: previous?.alertsMe)
        do {
            let served = try await service.updatePersonSettings(userId: userId, isShared: shared)
            settings = PhoneReachabilityPersonSettings(userId: userId, isShared: served.isShared,
                                                       alertsMe: served.alertsMe ?? previous?.alertsMe)
        } catch {
            settings = previous
            notice = PhoneReachabilitySettingsWording.saveFailed
        }
    }

    /// « Me prévenir s'il devient injoignable » (#19433) : seulement quand le serveur sert le champ (#19435).
    var offersAlert: Bool { settings?.alertsMe != nil }

    /// Être prévenu, ou non, quand SON téléphone devient injoignable : posé tout de suite, rendu à l'échec. Mon
    /// partage ne bouge pas.
    func setAlertsMe(_ alerts: Bool) async {
        guard let previous = settings, previous.alertsMe != nil else { return }
        settings = PhoneReachabilityPersonSettings(userId: userId, isShared: previous.isShared, alertsMe: alerts)
        do {
            let served = try await service.updateAlert(userId: userId, alertsMe: alerts)
            settings = PhoneReachabilityPersonSettings(userId: userId, isShared: served.isShared,
                                                       alertsMe: served.alertsMe ?? alerts)
        } catch {
            settings = previous
            notice = PhoneReachabilitySettingsWording.saveFailed
        }
    }
}
