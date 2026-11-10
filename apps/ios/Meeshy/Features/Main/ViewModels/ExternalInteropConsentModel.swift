import Foundation
import MeeshySDK

// MARK: - Ce qui part chez Meta, et le consentement (#17118 × #17120)
//
// La passerelle refuse d'ouvrir une conversation WhatsApp sans consentement
// daté sous la version en vigueur de l'information (`403
// EXTERNAL_CONVERSATION_CONSENT_REQUIRED`). L'entrée montre alors cette
// information : la liste vient du client (`ExternalInteropDisclosure`), elle
// s'affiche avant toute réponse réseau ; seule la durée de conservation du
// numéro de l'ami vient du serveur. Un consentement déjà donné sous la version
// en vigueur ne redemande rien. Miroir web :
// `apps/web/src/components/external-interop-notice.tsx`.

@MainActor
final class ExternalInteropConsentModel: ObservableObject {
    @Published private(set) var retentionDays: Int?
    @Published private(set) var consented = false
    @Published private(set) var isRecording = false
    @Published private(set) var answer: ExternalInteropConsentAnswer?

    let disclosures = ExternalInteropDisclosure.allCases

    private let service: ExternalInteropServiceProviding

    init(service: ExternalInteropServiceProviding = ExternalInteropService.shared) {
        self.service = service
    }

    nonisolated deinit {}

    func load() async {
        guard let status = try? await service.consentStatus() else { return }
        if status.current {
            consented = true
        } else {
            retentionDays = status.retentionDays
        }
    }

    func accept() async {
        guard !isRecording else { return }
        isRecording = true
        answer = nil
        do {
            let status = try await service.recordConsent(granted: true)
            isRecording = false
            if status.current { consented = true } else { answer = .failed }
        } catch {
            isRecording = false
            answer = .of(error: error)
        }
    }
}

/// Ce que l'information dit, dans la langue de l'interface. Le texte est
/// PROVISOIRE : sa version définitive est l'affaire du juriste (#16999).
nonisolated enum ExternalInteropConsentCopy {
    static func disclosure(_ disclosure: ExternalInteropDisclosure) -> String {
        switch disclosure {
        case .phoneNumber:
            return String(localized: "conversation.external.consent.disclosure.phoneNumber", defaultValue: "votre numéro de téléphone vérifié, qui vous identifie chez WhatsApp ;", bundle: .main)
        case .profileName:
            return String(localized: "conversation.external.consent.disclosure.profileName", defaultValue: "votre nom affiché ;", bundle: .main)
        case .publicKeys:
            return String(localized: "conversation.external.consent.disclosure.publicKeys", defaultValue: "les clés publiques de chiffrement de vos appareils ;", bundle: .main)
        case .encryptedContent:
            return String(localized: "conversation.external.consent.disclosure.encryptedContent", defaultValue: "vos messages et médias, chiffrés de bout en bout : Meta ne peut pas les lire ;", bundle: .main)
        case .deliveryMetadata:
            return String(localized: "conversation.external.consent.disclosure.deliveryMetadata", defaultValue: "qui écrit à qui, quand, la taille des envois et les accusés de réception.", bundle: .main)
        }
    }

    static func retention(days: Int?) -> String {
        guard let days else {
            return String(localized: "conversation.external.consent.retention.unknown", defaultValue: "Meeshy garde le numéro de votre ami pendant une durée limitée, puis l’efface.", bundle: .main)
        }
        return String(localized: "conversation.external.consent.retention", defaultValue: "Meeshy garde le numéro de votre ami \(days) jours après votre dernière ouverture de la conversation, puis l’efface.", bundle: .main)
    }

    static func answer(_ answer: ExternalInteropConsentAnswer) -> String {
        switch answer {
        case .outdated:
            return String(localized: "conversation.external.consent.outdated", defaultValue: "Cette information a changé : mettez Meeshy à jour pour la relire avant d’accepter.", bundle: .main)
        case .unavailable:
            return String(localized: "conversation.external.refused.disabled", defaultValue: "Écrire à un ami WhatsApp n’est pas encore disponible ici.", bundle: .main)
        case .failed:
            return String(localized: "conversation.external.consent.error", defaultValue: "Votre consentement n’a pas pu être enregistré. Réessayez.", bundle: .main)
        }
    }
}
