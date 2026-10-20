import UIKit
import UniformTypeIdentifiers
import SwiftUI
import MeeshySDK

/// **« Envoyer avec Meeshy » — l'extension de partage monte L'ÉCRAN UNIQUE**
/// (#10947, planche `docs/product/partage-unique/planche-partage-unique.html`,
/// V1, V9, fragment 3).
///
/// La même vue que l'app (`ShareSheetView`, compilée dans cette cible), avec
/// les coutures de l'extension : ses destinataires (`ExtensionShareDirectory` —
/// le cliché App Group d'abord, le serveur ensuite), son envoi
/// (`ExtensionShareDispatcher` — une fiche durable, reprise par l'app), et le
/// relais au studio (`ShareComposeHandoff`).
///
/// **L'extension COPIE les fichiers et DÉCRIT l'envoi ; elle ne garantit
/// jamais l'upload.** Elle est tuable à tout instant, plafonnée en mémoire, et
/// n'a pas droit à `beginBackgroundTask`. Ce que la feuille n'a pas eu le temps
/// de faire, `SharePendingSendConsumer` le reprend à la prochaine ouverture de
/// l'app.
final class ShareViewController: UIViewController {

    private var hostingController: UIHostingController<ShareSheetView>?
    private let shareId = ShareSender.makeClientMessageId()
    /// `complete()` peut être atteint par plusieurs chemins (fermeture, studio,
    /// ouverture de l'app) — un seul atteint `completeRequest`.
    private let completionGate = ShareCompletionGate()
    private var dispatcher: ExtensionShareDispatcher?
    /// Une fiche de studio ou de relais référence les fichiers copiés.
    private var handedOff = false
    /// Le relais D7 n'est tenté qu'une fois : une fiche qui ne s'écrit pas
    /// laisse la feuille se fermer.
    private var relayAttempted = false

    private var loading: Task<Void, Never>?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        let providers = inputProviders.map(ShareProviderHandoff.init(provider:))
        let shareId = shareId
        loading = Task { @MainActor [weak self] in
            let content = await Self.extractContent(providers)
            let staged = await Self.stageAttachments(providers, shareId: shareId)
            self?.installInterface(content: content, media: staged.media, failure: staged.failure)
        }
    }

    private var inputProviders: [NSItemProvider] {
        (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
    }

    // MARK: - Composition de l'écran

    private func installInterface(
        content: String?,
        media: [ShareStagedMedia],
        failure: ShareMediaStagingError?
    ) {
        let session = ShareSession.resolveLive()
        let mediaRoot = ShareMediaStaging.mediaRootURL()
        let incoming = ShareExtensionIncoming.make(text: content, media: media, mediaRoot: mediaRoot, preparationFailed: failure != nil)
        let dispatcher = ExtensionShareDispatcher(shareId: shareId, session: session, staged: media)
        self.dispatcher = dispatcher
        let model = ShareSheetViewModel(
            subject: .incoming(incoming),
            directory: ExtensionShareDirectory(session: session),
            dispatcher: dispatcher,
            currentUserId: { session?.userId ?? "" },
            presence: { _ in nil }
        )

        var actions = ShareSheetHostActions()
        actions.navigationTitle = ShareSheetCopy.sendWithMeeshy
        // « Modifier dans le studio » (#5056, vue `2a`) : l'extension ne compose
        // pas — elle DÉCRIT (les fichiers sont déjà copiés) et rend la main.
        // Une préparation échouée le retire : composer une pièce qui n'a pas été
        // copiée ouvrirait un studio vide.
        if failure == nil {
            actions.onCompose = { [weak self, weak model] in
                guard let self, let model else { return }
                self.handOffToStudio(subject: model.subject, media: dispatcher.keptMedia(of: model.subject), ownerUserId: session?.userId)
            }
        }
        if session == nil {
            // Fragment 3 : rien ne se perd — la fiche de relais garde le partage,
            // l'écran de l'app le rouvre après la connexion.
            actions.signIn = ShareSignInPrompt(onOpenApp: { [weak self, weak model] in
                guard let self, let model else { return }
                self.relayToApp(ShareRelayHandoff(
                    shareId: self.shareId, createdAt: Date(), text: model.subject.composedText(caption: ""),
                    media: dispatcher.keptMedia(of: model.subject).map { ShareRelayHandoff.Media(relPath: $0.relPath, mime: $0.mime, bytes: $0.bytes) },
                    conversationIds: []
                ))
            })
        }

        let root = ShareSheetView(model: model, accentColor: "6366F1", actions: actions, onDismiss: { [weak self] in
            self?.finish()
        })
        let controller = UIHostingController(rootView: root)
        addChild(controller)
        view.addSubview(controller.view)
        controller.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            controller.view.topAnchor.constraint(equalTo: view.topAnchor),
            controller.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            controller.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            controller.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        controller.didMove(toParent: self)
        hostingController = controller
    }

    /// La fiche de studio est écrite AVANT d'ouvrir l'app : si l'ouverture
    /// échoue, l'app la balaie quand même à son réveil. Une fiche qui ne
    /// s'écrit pas laisse des fichiers que plus personne ne décrit — on les
    /// efface plutôt.
    private func handOffToStudio(subject: ShareSubject, media: [ShareStagedMedia], ownerUserId: String?) {
        let fiche = ShareComposeHandoff(shareId: shareId, createdAt: Date(), text: subject.composedText(caption: ""), media: media, ownerUserId: ownerUserId)
        do {
            try fiche.write()
        } catch {
            finish()
            return
        }
        handedOff = true
        openApp(fiche.openURL)
    }

    /// Remet le partage à l'écran de l'app (sans session, ou D7 vers une
    /// conversation chiffrée). La fiche est écrite AVANT d'ouvrir l'app ; une
    /// fiche qui ne s'écrit pas laisse la feuille se fermer sans rien effacer
    /// de ce qu'un envoi déjà tenté décrit.
    private func relayToApp(_ fiche: ShareRelayHandoff) {
        guard let directory = ShareRelayHandoff.directoryURL(), (try? fiche.write(in: directory)) != nil else {
            finish()
            return
        }
        handedOff = true
        openApp(fiche.openURL)
    }

    /// **Le RACCOURCI, jamais le chemin.** `extensionContext.open` peut échouer
    /// sans un mot ; ce qui doit arriver est déjà sur le disque. On ferme la
    /// feuille dans les deux cas.
    private func openApp(_ url: URL?) {
        guard let contexte = extensionContext, let target = url ?? URL(string: "meeshy://") else {
            finish()
            return
        }
        contexte.open(target) { [weak self] _ in
            Task { @MainActor in self?.finish() }
        }
    }

    /// Fermer : les fichiers copiés qu'aucune fiche ne référence sont effacés
    /// (un envoi tenté ou une fiche de studio les possède — même différés, ils
    /// restent retrouvables par l'app).
    private func finish() {
        if !handedOff, !relayAttempted, let relay = dispatcher?.relayHandoff(createdAt: Date()) {
            relayAttempted = true
            relayToApp(relay)
            return
        }
        let ownedByAFiche = handedOff || dispatcher?.holdsStagedMedia == true
        if ShareCancelPolicy.isCancelAllowed(sendWasAttempted: ownedByAFiche) { discardStagedMedia() }
        complete()
    }

    private func complete() {
        loading?.cancel()
        completionGate.fireOnce { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
        }
    }

    private func discardStagedMedia() {
        guard let mediaRoot = ShareMediaStaging.mediaRootURL() else { return }
        ShareMediaStaging.discard(shareId: shareId, in: mediaRoot)
    }

    // MARK: - Extraction

    @concurrent
    private static func extractContent(_ providers: [ShareProviderHandoff]) async -> String? {
        let payloads = await withTaskGroup(of: (index: Int, payload: ShareProviderPayload).self) { group in
            for (index, handoff) in providers.enumerated() {
                let provider = handoff.provider
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    group.addTask { (index, .url(await loadURL(from: handoff.provider))) }
                } else if provider.hasItemConformingToTypeIdentifier(UTType.text.identifier) {
                    group.addTask { (index, .text(await loadText(from: handoff.provider))) }
                }
            }
            var collected: [(index: Int, payload: ShareProviderPayload)] = []
            for await entry in group { collected.append(entry) }
            return collected.sorted { $0.index < $1.index }.map(\.payload)
        }
        let reduced = ShareExtractionReduction.content(from: payloads)
        return ShareSender.composeContent(text: reduced.text, url: reduced.url)
    }

    nonisolated private static func loadURL(from provider: NSItemProvider) async -> URL? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { data, _ in
                continuation.resume(returning: asURL(data))
            }
        }
    }

    nonisolated private static func loadText(from provider: NSItemProvider) async -> String? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: UTType.text.identifier, options: nil) { data, _ in
                continuation.resume(returning: asText(data))
            }
        }
    }

    /// `nonisolated` : appelées depuis la complétion de `loadItem`, qui
    /// s'exécute sur une file arbitraire.
    nonisolated private static func asURL(_ data: (any NSSecureCoding)?) -> URL? {
        if let url = data as? URL { return url }
        if let raw = data as? Data, let string = String(data: raw, encoding: .utf8) {
            return URL(string: string)
        }
        if let string = data as? String { return URL(string: string) }
        return nil
    }

    nonisolated private static func asText(_ data: (any NSSecureCoding)?) -> String? {
        if let string = data as? String { return string }
        if let raw = data as? Data { return String(data: raw, encoding: .utf8) }
        return nil
    }

    /// Copie chaque fichier reçu DANS la closure de `loadFileRepresentation`,
    /// de façon synchrone : l'URL fournie est SUPPRIMÉE au retour de cette
    /// closure. `prepareMediaRoot` crée `share_pending_media/<shareId>/` : il
    /// n'est appelé qu'une fois certain qu'il y a un fichier à copier, sinon un
    /// partage de texte pur laisserait un dossier que rien n'efface.
    ///
    /// Les plafonds communs (D10 : 20 fichiers, 500 Mo) ne refusent plus rien
    /// ici : l'écran unique les DIT (V9). La copie reste gardée par l'espace
    /// libre, fichier par fichier (`ShareMediaStaging.stage`).
    @concurrent
    private static func stageAttachments(
        _ providers: [ShareProviderHandoff],
        shareId: String
    ) async -> (media: [ShareStagedMedia], failure: ShareMediaStagingError?) {
        let fileProviders = providers.filter { handoff in
            !handoff.provider.hasItemConformingToTypeIdentifier(UTType.url.identifier)
                && !handoff.provider.hasItemConformingToTypeIdentifier(UTType.text.identifier)
        }
        guard !fileProviders.isEmpty,
              let mediaRoot = ShareMediaStaging.prepareMediaRoot(shareId: shareId) else { return ([], nil) }

        let results = await withTaskGroup(of: ShareStagingResult.self) { group in
            for (index, handoff) in fileProviders.enumerated() {
                guard let typeIdentifier = handoff.provider.registeredTypeIdentifiers.first else { continue }
                group.addTask {
                    await stage(handoff.provider, typeIdentifier: typeIdentifier, index: index, mediaRoot: mediaRoot, shareId: shareId)
                }
            }
            var collected: [ShareStagingResult] = []
            for await result in group { collected.append(result) }
            return collected
        }
        return ShareExtractionReduction.staging(from: results)
    }

    nonisolated private static func stage(
        _ provider: NSItemProvider,
        typeIdentifier: String,
        index: Int,
        mediaRoot: URL,
        shareId: String
    ) async -> ShareStagingResult {
        await withCheckedContinuation { continuation in
            provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { url, error in
                let outcome = copyProvidedFile(
                    url, error: error, typeIdentifier: typeIdentifier,
                    index: index, mediaRoot: mediaRoot, shareId: shareId
                )
                continuation.resume(returning: ShareStagingResult(index: index, outcome: outcome))
            }
        }
    }

    nonisolated private static func copyProvidedFile(
        _ url: URL?,
        error: (any Error)?,
        typeIdentifier: String,
        index: Int,
        mediaRoot: URL,
        shareId: String
    ) -> Result<ShareStagedMedia, ShareMediaStagingError> {
        guard let url else {
            return .failure(.copyFailed(error?.localizedDescription ?? "aucune URL fournie"))
        }
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

/// `NSItemProvider` n'est pas `Sendable`, mais son chargement (`loadItem`) se fait
/// depuis n'importe quel fil. Les fournisseurs quittent le MainActor emballés, et
/// chaque tâche du groupe reçoit SON fournisseur, que rien d'autre ne touche
/// pendant le chargement : le transfert ne partage rien.
private nonisolated struct ShareProviderHandoff: @unchecked Sendable {
    let provider: NSItemProvider
}
