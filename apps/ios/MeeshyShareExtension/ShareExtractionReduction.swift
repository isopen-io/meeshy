import Foundation

nonisolated enum ShareProviderPayload: Sendable, Equatable {
    case text(String?)
    case url(URL?)
}

nonisolated struct ShareStagingResult: Sendable {
    let index: Int
    let outcome: Result<ShareStagedMedia, ShareMediaStagingError>
}

nonisolated enum ShareExtractionReduction {

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

    static func staging(from results: [ShareStagingResult]) -> (media: [ShareStagedMedia], failure: ShareMediaStagingError?) {
        let ordered = results.sorted { $0.index < $1.index }
        let media = ordered.compactMap { result -> ShareStagedMedia? in
            guard case .success(let staged) = result.outcome else { return nil }
            return staged
        }
        let failure = ordered.lazy.compactMap { result -> ShareMediaStagingError? in
            guard case .failure(let error) = result.outcome else { return nil }
            return error
        }.first
        return (media, failure)
    }
}
