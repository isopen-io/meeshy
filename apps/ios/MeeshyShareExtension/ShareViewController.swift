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

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        extractContent { [weak self] content in
            guard let self else { return }
            self.extractAttachments { media, failure in
                self.installInterface(content: content, media: media, failure: failure)
            }
        }
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
                self.handOffToStudio(subject: model.subject, media: dispatcher.keptMedia(of: model.subject))
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
    private func handOffToStudio(subject: ShareSubject, media: [ShareStagedMedia]) {
        let fiche = ShareComposeHandoff(shareId: shareId, createdAt: Date(), text: subject.composedText(caption: ""), media: media)
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
        completionGate.fireOnce { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
        }
    }

    private func discardStagedMedia() {
        guard let mediaRoot = ShareMediaStaging.mediaRootURL() else { return }
        ShareMediaStaging.discard(shareId: shareId, in: mediaRoot)
    }

    // MARK: - Extraction

    /// Accumulateur protégé par verrou : `loadItem` rappelle sur une file
    /// arbitraire, et plusieurs pièces jointes peuvent répondre en parallèle.
    private final class ExtractionBox: @unchecked Sendable {
        private let lock = NSLock()
        // `nonisolated(unsafe)` : mutated only under `lock`, from `offer`/
        // `snapshot` below — the lock IS the synchronization the compiler
        // can't see across actor isolation.
        nonisolated(unsafe) private var text: String?
        nonisolated(unsafe) private var url: URL?

        // `nonisolated` : called from `loadItem`'s completion, which runs on
        // an arbitrary queue (same rationale as `asURL`/`asText` below). The
        // `NSLock` is this type's own synchronization — it doesn't need (and
        // must not wait for) the main actor.
        nonisolated func offer(text value: String?) {
            guard let value, !value.isEmpty else { return }
            lock.lock(); defer { lock.unlock() }
            if text == nil { text = value }
        }

        nonisolated func offer(url value: URL?) {
            guard let value else { return }
            lock.lock(); defer { lock.unlock() }
            if url == nil { url = value }
        }

        nonisolated var snapshot: (text: String?, url: URL?) {
            lock.lock(); defer { lock.unlock() }
            return (text, url)
        }
    }

    private func extractContent(completion: @escaping (String?) -> Void) {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
            completion(nil)
            return
        }

        let box = ExtractionBox()
        let group = DispatchGroup()

        for item in items {
            for attachment in item.attachments ?? [] {
                if attachment.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    group.enter()
                    attachment.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { data, _ in
                        box.offer(url: Self.asURL(data))
                        group.leave()
                    }
                } else if attachment.hasItemConformingToTypeIdentifier(UTType.text.identifier) {
                    group.enter()
                    attachment.loadItem(forTypeIdentifier: UTType.text.identifier, options: nil) { data, _ in
                        box.offer(text: Self.asText(data))
                        group.leave()
                    }
                }
            }
        }

        group.notify(queue: .main) {
            let (text, url) = box.snapshot
            completion(ShareSender.composeContent(text: text, url: url))
        }
    }

    /// `nonisolated` : appelées depuis la complétion de `loadItem`, qui
    /// s'exécute sur une file arbitraire. Sans l'annotation, elles héritent du
    /// MainActor de `UIViewController` et le compilateur refuse de leur « faire
    /// traverser » une valeur non-Sendable.
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

    /// Accumulateur des fichiers copiés — même verrou que `ExtractionBox` :
    /// `loadFileRepresentation` rappelle sur une file arbitraire, et plusieurs
    /// pièces jointes répondent en parallèle.
    private final class StagingBox: @unchecked Sendable {
        private let lock = NSLock()
        nonisolated(unsafe) private var staged: [Int: ShareStagedMedia] = [:]
        nonisolated(unsafe) private var failure: ShareMediaStagingError?

        nonisolated func offer(index: Int, media: ShareStagedMedia) {
            lock.lock(); defer { lock.unlock() }
            staged[index] = media
        }

        nonisolated func offer(failure value: ShareMediaStagingError) {
            lock.lock(); defer { lock.unlock() }
            if failure == nil { failure = value }
        }

        nonisolated var snapshot: (media: [ShareStagedMedia], failure: ShareMediaStagingError?) {
            lock.lock(); defer { lock.unlock() }
            return (staged.sorted { $0.key < $1.key }.map(\.value), failure)
        }
    }

    /// Copie chaque fichier reçu DANS la closure de `loadFileRepresentation`,
    /// de façon synchrone : l'URL fournie est SUPPRIMÉE au retour de cette
    /// closure. La copier plus tard, ou l'ouvrir en asynchrone, ne trouverait
    /// plus rien.
    /// Round 1 de revue (fuite Important) : `prepareMediaRoot` crée
    /// `share_pending_media/<shareId>/` sur disque. L'appeler avant de savoir
    /// s'il y a le moindre fichier à copier — comme c'était le cas ici —
    /// crée ce dossier pour TOUT partage, y compris un partage de texte pur,
    /// et rien ne l'efface jamais. Il ne doit donc être appelé qu'une fois
    /// tous les gardes d'absence/plafond franchis, jamais avant.
    private func extractAttachments(
        completion: @escaping ([ShareStagedMedia], ShareMediaStagingError?) -> Void
    ) {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
            completion([], nil)
            return
        }

        let fileProviders: [NSItemProvider] = items
            .flatMap { $0.attachments ?? [] }
            .filter { provider in
                !provider.hasItemConformingToTypeIdentifier(UTType.url.identifier)
                    && !provider.hasItemConformingToTypeIdentifier(UTType.text.identifier)
            }

        guard !fileProviders.isEmpty else {
            completion([], nil)
            return
        }

        guard let mediaRoot = ShareMediaStaging.prepareMediaRoot(shareId: shareId) else {
            completion([], nil)
            return
        }

        let box = StagingBox()
        let group = DispatchGroup()
        let shareId = shareId

        for (index, provider) in fileProviders.enumerated() {
            guard let typeIdentifier = provider.registeredTypeIdentifiers.first else { continue }
            group.enter()
            provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { url, error in
                defer { group.leave() }
                guard let url else {
                    box.offer(failure: .copyFailed(error?.localizedDescription ?? "aucune URL fournie"))
                    return
                }
                // Une URL issue de Fichiers/iCloud est security-scoped :
                // sans la paire start/stop, la lecture échoue en silence.
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                do {
                    let media = try ShareMediaStaging.stage(
                        source: url,
                        into: mediaRoot,
                        shareId: shareId,
                        index: index,
                        mime: ShareMediaStaging.mimeType(
                            typeIdentifier: typeIdentifier,
                            fileExtension: url.pathExtension),
                        freeBytes: ShareMediaStaging.availableCapacityBytes(at: mediaRoot)
                    )
                    box.offer(index: index, media: media)
                } catch let error as ShareMediaStagingError {
                    box.offer(failure: error)
                } catch {
                    box.offer(failure: .copyFailed(error.localizedDescription))
                }
            }
        }

        // Les plafonds communs (D10 : 20 fichiers, 500 Mo) ne refusent plus rien
        // ici : l'écran unique les DIT, marque ce qui dépasse et propose de le
        // retirer d'un geste (V9). La copie elle-même reste gardée par l'espace
        // libre, fichier par fichier (`ShareMediaStaging.stage`).
        group.notify(queue: .main) {
            let (media, failure) = box.snapshot
            completion(media, failure)
        }
    }
}
