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
        prepareMediaRoot: @escaping PrepareMediaRoot = { ShareMediaStaging.prepareMediaRoot(shareId: $0) },
        sourcePolicy: ShareSourcePolicy = .live
    ) -> ShareItemLoads {
        let context = ShareStagingContext(shareId: shareId, prepareMediaRoot: prepareMediaRoot, sourcePolicy: sourcePolicy)
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
            deliver(.staged(ShareStagingResult(index: index, outcome: .failure(.refusedSource))))
        case .link:
            provider.loadItem(
                forTypeIdentifier: UTType.url.identifier, options: nil,
                completionHandler: linkHandler(index: index, deliver: deliver)
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

    /// Une URL de FICHIER n'est ni un lien ni une pièce : ni son chemin ne part
    /// en texte (#11134), ni l'extension ne l'ouvre. Ce chemin est décodé des
    /// données de l'élément, donc choisi par l'app hôte, et l'extension a des
    /// droits qu'elle n'a pas (le conteneur App Group) : l'ouvrir ferait de
    /// Meeshy le député d'une exfiltration. Seul ce que le système remet par
    /// `loadFileRepresentation` se copie.
    private static func linkHandler(index: Int, deliver: @escaping Deliver) -> ItemHandler {
        { item, _ in
            let url = asURL(item)
            guard url?.isFileURL == true else {
                deliver(.payload(.url(url)))
                return
            }
            deliver(.staged(ShareStagingResult(index: index, outcome: .failure(.refusedSource))))
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
    let sourcePolicy: ShareSourcePolicy

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
        guard url.isFileURL, sourcePolicy.admits(url) else { return .failure(.refusedSource) }
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

/// Où une source peut vivre (#11134, défense en profondeur). Le fichier que
/// `loadFileRepresentation` remet est une copie du système, dans le dossier
/// temporaire de l'extension ; rien de ce que l'extension possède par ses
/// propres droits ne doit pouvoir partir en pièce jointe.
///
/// - `sealed` : jamais — le conteneur App Group (session, carnet, fiches) et
///   le bundle de l'app ;
/// - `privateRoots` : jamais, sauf sous une `exemption` — le conteneur de
///   l'extension, dont seuls `tmp` et `Library/Caches` reçoivent les copies
///   du système.
///
/// Chaque chemin se juge symlinks résolus : un lien se juge sur sa cible.
nonisolated struct ShareSourcePolicy: Sendable {
    let sealed: [URL]
    let privateRoots: [URL]
    let exemptions: [URL]

    static var live: ShareSourcePolicy {
        let home = URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true)
        let group = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: ShareSession.appGroupIdentifier)
        return ShareSourcePolicy(
            sealed: [group, appBundleURL()].compactMap { $0 },
            privateRoots: [home],
            exemptions: [
                URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true),
                home.appendingPathComponent("Library/Caches", isDirectory: true),
            ]
        )
    }

    func admits(_ url: URL) -> Bool {
        let path = Self.resolved(url)
        if sealed.contains(where: { Self.isWithin(path, root: $0) }) { return false }
        guard privateRoots.contains(where: { Self.isWithin(path, root: $0) }) else { return true }
        return exemptions.contains { Self.isWithin(path, root: $0) }
    }

    /// L'extension vit dans `Meeshy.app/PlugIns/` : c'est l'app entière qui
    /// est scellée.
    private static func appBundleURL() -> URL {
        let bundle = Bundle.main.bundleURL
        guard bundle.pathExtension == "appex" else { return bundle }
        return bundle.deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func resolved(_ url: URL) -> String {
        url.resolvingSymlinksInPath().standardizedFileURL.path
    }

    private static func isWithin(_ path: String, root: URL) -> Bool {
        let rootPath = resolved(root)
        return path == rootPath || path.hasPrefix(rootPath.hasSuffix("/") ? rootPath : rootPath + "/")
    }
}
