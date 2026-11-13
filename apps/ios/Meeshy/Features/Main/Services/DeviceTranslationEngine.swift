import Foundation
import MeeshySDK

// MARK: - Le moteur qui traduit SUR l'appareil (#9899)
//
// l'appareil de chaque membre traduit les
// messages reçus vers SA langue, les montre aussitôt, puis les partage aux
// autres membres. Ce fichier est la FRONTIÈRE de ce que le coordinateur
// (`DeviceTranslationCoordinator`) demande à un moteur : il ne sait ni quel
// moteur traduit, ni que la traduction sera partagée.
//
// Un seul moteur aujourd'hui — `AppleTranslationEngine`, iOS 18+, derrière
// `EntityShieldedDeviceTranslationEngine` (les identités ne sont jamais traduites). Sous iOS 16 et
// 17, `UnavailableDeviceTranslationEngine` déclare tout couple non pris en
// charge : l'appareil ne traduit rien, mais reçoit encore les traductions que
// les autres membres partagent.

/// Ce que l'appareil sait faire d'un couple de langues.
nonisolated enum DeviceTranslationAvailability: Equatable, Sendable {
    /// Les modèles sont sur l'appareil : la traduction est immédiate, hors ligne.
    case ready
    /// Le couple est pris en charge, mais ses modèles ne sont pas téléchargés :
    /// la première traduction fait apparaître la feuille de téléchargement du
    /// système (une fois par couple et par session d'app, jamais deux).
    case needsDownload
    /// Le moteur ne traduit pas ce couple — ou l'utilisateur a refusé son
    /// téléchargement, ou le système est trop ancien.
    case unsupported
}

/// Un texte à traduire. `id` revient tel quel sur le résultat : le moteur peut
/// répondre dans un autre ordre, ou ne pas répondre à tout.
nonisolated struct DeviceTranslationRequest: Equatable, Sendable {
    let id: String
    let text: String
}

nonisolated struct DeviceTranslationResult: Equatable, Sendable {
    let id: String
    let text: String
}

/// Un moteur de traduction sur l'appareil. Aucune erreur ne remonte : un texte
/// que le moteur n'a pas su traduire est ABSENT du résultat, et l'appelant
/// retombe sur le rang suivant du prisme — exactement comme le serveur saute une
/// langue sans traduction.
@MainActor
protocol DeviceTranslationEngineProviding {
    /// Le nom du moteur, écrit dans l'enveloppe partagée (`engine`) et dans
    /// `translationModel`. Entre 1 et 64 caractères.
    var engineName: String { get }

    /// Ce que le moteur sait faire de ce couple — les codes sont ceux de
    /// `DeviceTranslationTarget` (normalisés, région-aveugles).
    func availability(of pair: DeviceTranslationPair) async -> DeviceTranslationAvailability

    /// Traduit un lot. Les textes absents du résultat n'ont pas été traduits.
    func translate(
        _ requests: [DeviceTranslationRequest],
        pair: DeviceTranslationPair
    ) async -> [DeviceTranslationResult]

    /// Abandonne ce qui est en attente : les appels en cours rendent aussitôt ce
    /// qu'ils ont.
    func cancelPending()
}

/// Le moteur des systèmes qui n'en ont pas (iOS 16 et 17).
struct UnavailableDeviceTranslationEngine: DeviceTranslationEngineProviding {
    let engineName = "unavailable"

    func availability(of pair: DeviceTranslationPair) async -> DeviceTranslationAvailability {
        .unsupported
    }

    func translate(
        _ requests: [DeviceTranslationRequest],
        pair: DeviceTranslationPair
    ) async -> [DeviceTranslationResult] {
        []
    }

    func cancelPending() {}
}

enum DeviceTranslationEngineFactory {

    /// Un moteur NEUF par conversation : sa file, sa configuration et son hôte
    /// (`AppleTranslationHost`) ne sont à personne d'autre. Seul le refus d'un
    /// téléchargement est partagé, à l'échelle de la session d'app.
    static func makeDefault() -> any DeviceTranslationEngineProviding {
        if #available(iOS 18.0, *) {
            return EntityShieldedDeviceTranslationEngine(AppleTranslationEngine())
        }
        return UnavailableDeviceTranslationEngine()
    }
}

/// Le masquage des identités devant n'importe quel moteur (#14333) : nom de
/// l'auteur d'une phrase de partage, adresses, e-mails, @mentions, #hashtags,
/// pseudos nus et émojis ne sont jamais donnés au moteur, et une sortie qui en
/// a perdu un n'est jamais servie — la règle du translator (#14327), portée par
/// `TranslationShieldedBatch` (MeeshySDK).
@MainActor
final class EntityShieldedDeviceTranslationEngine: DeviceTranslationEngineProviding {
    nonisolated deinit {}

    /// Le moteur masqué — l'hôte de sa session (`AppleTranslationHost`) se monte sur lui.
    let inner: any DeviceTranslationEngineProviding

    init(_ inner: any DeviceTranslationEngineProviding) {
        self.inner = inner
    }

    var engineName: String { inner.engineName }

    func availability(of pair: DeviceTranslationPair) async -> DeviceTranslationAvailability {
        await inner.availability(of: pair)
    }

    func translate(
        _ requests: [DeviceTranslationRequest],
        pair: DeviceTranslationPair
    ) async -> [DeviceTranslationResult] {
        let batch = TranslationShieldedBatch(requests.map { TranslationShieldedPiece(id: $0.id, text: $0.text) })
        let settlement = batch.settle(await engineOutput(batch.requests, pair: pair))
        var served = settlement.served
        if let retry = settlement.retry, !Task.isCancelled {
            served.merge(retry.settle(await engineOutput(retry.requests, pair: pair))) { first, _ in first }
        }
        return requests.compactMap { request in
            served[request.id].map { DeviceTranslationResult(id: request.id, text: $0) }
        }
    }

    func cancelPending() {
        inner.cancelPending()
    }

    private func engineOutput(_ pieces: [TranslationShieldedPiece], pair: DeviceTranslationPair) async -> [String: String] {
        guard !pieces.isEmpty else { return [:] }
        let results = await inner.translate(pieces.map { DeviceTranslationRequest(id: $0.id, text: $0.text) }, pair: pair)
        return Dictionary(results.map { ($0.id, $0.text) }, uniquingKeysWith: { first, _ in first })
    }
}
