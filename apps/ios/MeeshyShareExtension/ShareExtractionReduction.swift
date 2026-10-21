import Foundation

nonisolated enum ShareProviderPayload: Sendable, Equatable {
    case text(String?)
    case url(URL?)
}

nonisolated struct ShareStagingResult: Sendable {
    let index: Int
    let outcome: Result<ShareStagedMedia, ShareMediaStagingError>
}

/// Ce qu'un fournisseur a rendu : un morceau de texte, un fichier copié (ou
/// son échec), ou rien.
nonisolated enum ShareLoadOutcome: Sendable {
    case payload(ShareProviderPayload)
    case staged(ShareStagingResult)
    case nothing
}

/// Ce que l'écran reçoit : le texte composé et les fichiers copiés.
nonisolated struct ShareGathered: Sendable {
    let content: String?
    let media: [ShareStagedMedia]
    /// Chaque fichier qui n'a pas été copié, dans l'ordre des fournisseurs.
    let failures: [ShareMediaStagingError]

    var failure: ShareMediaStagingError? { failures.first }
}

nonisolated enum ShareExtractionReduction {

    /// `outcomes` est dans l'ordre des fournisseurs : c'est lui qui fait foi,
    /// jamais l'ordre d'arrivée des callbacks.
    static func gathered(from outcomes: [ShareLoadOutcome]) -> ShareGathered {
        let payloads = outcomes.compactMap { outcome -> ShareProviderPayload? in
            guard case .payload(let payload) = outcome else { return nil }
            return payload
        }
        let results = outcomes.compactMap { outcome -> ShareStagingResult? in
            guard case .staged(let result) = outcome else { return nil }
            return result
        }
        let text = content(from: payloads)
        let staged = staging(from: results)
        return ShareGathered(
            content: ShareSender.composeContent(text: text.text, url: text.url),
            media: staged.media,
            failures: staged.failures
        )
    }

    static func content(from payloads: [ShareProviderPayload]) -> (text: String?, url: URL?) {
        let texts = payloads.compactMap { payload -> String? in
            guard case .text(let value) = payload, let value, !value.isEmpty else { return nil }
            return value
        }
        let urls = payloads.compactMap { payload -> URL? in
            guard case .url(let value) = payload else { return nil }
            return value
        }
        return (texts.first, urls.first)
    }

    static func staging(from results: [ShareStagingResult]) -> (media: [ShareStagedMedia], failures: [ShareMediaStagingError]) {
        let ordered = results.sorted { $0.index < $1.index }
        let media = ordered.compactMap { result -> ShareStagedMedia? in
            guard case .success(let staged) = result.outcome else { return nil }
            return staged
        }
        let failures = ordered.compactMap { result -> ShareMediaStagingError? in
            guard case .failure(let error) = result.outcome else { return nil }
            return error
        }
        return (media, failures)
    }
}
