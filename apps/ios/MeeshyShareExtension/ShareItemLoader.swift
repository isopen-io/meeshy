import Foundation
import UniformTypeIdentifiers

/// Les chargements lancés, un par fournisseur, dans l'ordre des fournisseurs.
nonisolated struct ShareItemLoads: Sendable {
    let tasks: [Task<ShareLoadOutcome, Never>]

    func gather() async -> ShareGathered {
        var outcomes: [ShareLoadOutcome] = []
        for task in tasks { outcomes.append(await task.value) }
        return ShareExtractionReduction.gathered(from: outcomes)
    }
}

/// Charge ce que la feuille système a remis (#11134, #11064).
///
/// **Le fournisseur ne quitte jamais l'appelant.** `NSItemProvider` n'est pas
/// `Sendable` : chaque chargement est LANCÉ ici, de façon synchrone, et seul
/// ce qui en sort traverse les fils — l'URL d'un fichier déjà copié, un texte,
/// un lien. Les chargements courent en parallèle (le système les sert sur ses
/// propres files) ; `ShareItemLoads.gather()` les relit dans l'ordre.
///
/// Chaque fichier est copié DANS la complétion de `loadFileRepresentation` :
/// l'URL fournie est supprimée à son retour. Le dossier du partage n'est créé
/// qu'au premier fichier à copier, sinon un partage de texte laisserait un
/// dossier que rien n'efface. Les plafonds communs (D10 : 20 fichiers,
/// 500 Mo) ne refusent rien ici : l'écran unique les DIT (V9) ; la copie
/// reste gardée par l'espace libre, fichier par fichier.
nonisolated enum ShareItemLoader {
    typealias PrepareMediaRoot = @Sendable (String) -> URL?
    typealias Deliver = @Sendable (ShareLoadOutcome) -> Void
    typealias ItemHandler = @Sendable ((any NSSecureCoding)?, (any Error)?) -> Void

    static func start(
        _ providers: [NSItemProvider],
        shareId: String,
        prepareMediaRoot: @escaping PrepareMediaRoot = { ShareMediaStaging.prepareMediaRoot(shareId: $0) }
    ) -> ShareItemLoads {
        let context = ShareStagingContext(shareId: shareId, prepareMediaRoot: prepareMediaRoot)
        return ShareItemLoads(tasks: providers.enumerated().map { index, provider in
            awaiting { deliver in load(provider, index: index, context: context, deliver: deliver) }
        })
    }

    private static func awaiting(_ start: (@escaping Deliver) -> Void) -> Task<ShareLoadOutcome, Never> {
        let (stream, continuation) = AsyncStream<ShareLoadOutcome>.makeStream(bufferingPolicy: .bufferingNewest(1))
        start { outcome in
            continuation.yield(outcome)
            continuation.finish()
        }
        return Task {
            for await outcome in stream { return outcome }
            return .nothing
        }
    }

    private static func load(_ provider: NSItemProvider, index: Int, context: ShareStagingContext, deliver: @escaping Deliver) {
        switch ShareItemRepresentation.choose(from: provider.registeredTypeIdentifiers) {
        case .media(let typeIdentifier), .file(let typeIdentifier):
            _ = provider.loadFileRepresentation(
                forTypeIdentifier: typeIdentifier,
                completionHandler: fileHandler(typeIdentifier: typeIdentifier, index: index, context: context, deliver: deliver)
            )
        case .fileURL:
            provider.loadItem(
                forTypeIdentifier: ShareItemRepresentation.fileURLTypeIdentifier, options: nil,
                completionHandler: urlHandler(expectsFile: true, index: index, context: context, deliver: deliver)
            )
        case .link:
            provider.loadItem(
                forTypeIdentifier: UTType.url.identifier, options: nil,
                completionHandler: urlHandler(expectsFile: false, index: index, context: context, deliver: deliver)
            )
        case .text:
            provider.loadItem(forTypeIdentifier: UTType.text.identifier, options: nil) { item, _ in
                deliver(.payload(.text(asText(item))))
            }
        case .unsupported:
            deliver(.nothing)
        }
    }

    private static func fileHandler(
        typeIdentifier: String,
        index: Int,
        context: ShareStagingContext,
        deliver: @escaping Deliver
    ) -> @Sendable (URL?, (any Error)?) -> Void {
        { url, error in
            deliver(.staged(context.stage(url, error: error, typeIdentifier: typeIdentifier, index: index)))
        }
    }

    /// Une URL de FICHIER se copie, jamais ne part en texte : c'est son chemin
    /// que le destinataire recevait (#11134).
    private static func urlHandler(
        expectsFile: Bool,
        index: Int,
        context: ShareStagingContext,
        deliver: @escaping Deliver
    ) -> ItemHandler {
        { item, error in
            let url = asURL(item)
            if url?.isFileURL == true || (url == nil && expectsFile) {
                deliver(.staged(context.stage(url, error: error, typeIdentifier: nil, index: index)))
                return
            }
            deliver(.payload(.url(url)))
        }
    }

    /// Hors process, le système remet un `NSURL` ; dans le même process, la
    /// représentation sérialisée d'`NSURL` (une liste de propriétés, que seul
    /// `NSURL` sait relire) ou ses octets UTF-8.
    static func asURL(_ item: (any NSSecureCoding)?) -> URL? {
        if let url = item as? URL { return url }
        if let raw = item as? Data { return decodedURL(raw) }
        if let string = item as? String { return URL(string: string) }
        return nil
    }

    private static func decodedURL(_ raw: Data) -> URL? {
        if let url = try? NSURL.object(withItemProviderData: raw, typeIdentifier: UTType.url.identifier) {
            return url as URL
        }
        return String(data: raw, encoding: .utf8).flatMap { URL(string: $0) }
    }

    static func asText(_ item: (any NSSecureCoding)?) -> String? {
        if let string = item as? String { return string }
        if let raw = item as? Data { return String(data: raw, encoding: .utf8) }
        return nil
    }
}

/// Ce dont une copie a besoin, et rien d'autre : tout est `Sendable`.
nonisolated struct ShareStagingContext: Sendable {
    let shareId: String
    let prepareMediaRoot: ShareItemLoader.PrepareMediaRoot

    func stage(_ url: URL?, error: (any Error)?, typeIdentifier: String?, index: Int) -> ShareStagingResult {
        ShareStagingResult(index: index, outcome: copy(url, error: error, typeIdentifier: typeIdentifier, index: index))
    }

    private func copy(
        _ url: URL?,
        error: (any Error)?,
        typeIdentifier: String?,
        index: Int
    ) -> Result<ShareStagedMedia, ShareMediaStagingError> {
        guard let url else { return .failure(.copyFailed(error?.localizedDescription ?? "aucune URL fournie")) }
        guard let mediaRoot = prepareMediaRoot(shareId) else { return .failure(.appGroupUnavailable) }
        // Une URL issue de Fichiers/iCloud est security-scoped : sans la paire
        // start/stop, la lecture échoue en silence.
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            return .success(try ShareMediaStaging.stage(
                source: url,
                into: mediaRoot,
                shareId: shareId,
                index: index,
                mime: ShareMediaStaging.mimeType(typeIdentifier: typeIdentifier, fileExtension: url.pathExtension),
                freeBytes: ShareMediaStaging.availableCapacityBytes(at: mediaRoot)
            ))
        } catch let error as ShareMediaStagingError {
            return .failure(error)
        } catch {
            return .failure(.copyFailed(error.localizedDescription))
        }
    }
}
