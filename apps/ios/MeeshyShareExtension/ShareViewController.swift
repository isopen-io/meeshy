import UIKit
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

        // Les chargements partent ICI, sur le MainActor : aucun fournisseur
        // (non `Sendable`) ne traverse de fil, seul ce qu'ils rendent (#11064).
        let loads = ShareItemLoader.start(inputProviders, shareId: shareId)
        loading = Task { @MainActor [weak self] in
            let gathered = await loads.gather()
            self?.installInterface(content: gathered.content, media: gathered.media, failure: gathered.failure)
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
}
