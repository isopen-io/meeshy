import UIKit
import UniformTypeIdentifiers
import SwiftUI

/// Feuille « Partager vers Meeshy ».
///
/// L'extension est AUTONOME : elle lit la session et les conversations dans
/// l'App Group, décrit l'envoi dans une fiche de reprise durable, et n'ouvre
/// jamais l'app.
///
/// Portée : texte, URL, images, vidéos, GIFs et documents (`Info.plist`,
/// 20 fichiers max), vers 10 destinataires au plus.
///
/// **L'extension COPIE les fichiers et DÉCRIT l'envoi ; elle ne garantit
/// jamais l'upload.** Elle est tuable à tout instant, plafonnée à ~120 Mo, et
/// n'a pas droit à `beginBackgroundTask`. Ce que la feuille n'a pas eu le temps
/// de faire, `SharePendingSendConsumer` le reprend à la prochaine ouverture de
/// l'app.
class ShareViewController: UIViewController {

    private var hostingController: UIHostingController<ShareContentView>?
    private let shareId = ShareSender.makeClientMessageId()
    /// Round 2 de revue (Critical, effet secondaire) : `complete()` peut être
    /// atteint par DEUX chemins (`onCancel`, `onFinish`) — ce verrou garantit
    /// qu'un seul appel atteint réellement `extensionContext?.completeRequest`.
    private let completionGate = ShareCompletionGate()

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
        let state = ShareScreenState.resolve(
            session: session,
            targets: ShareConversationStore.liveTargets()
        )
        let shareId = shareId

        let root = ShareContentView(
            content: content,
            media: media,
            stagingFailure: failure,
            state: state,
            onSend: { session, conversationIds, content, media in
                await ShareSender.send(
                    share: SharePendingShare.make(
                        shareId: shareId,
                        createdAt: Date(),
                        content: content,
                        media: media,
                        conversationIds: conversationIds
                    ),
                    session: session
                )
            },
            // **Vue `2a` — composer plutôt qu'envoyer tel quel** (#5056).
            //
            // L'extension ne compose PAS : elle est sans dépendance SDK et le
            // composer vit dans l'app. Elle DÉCRIT (les fichiers sont déjà
            // copiés) et rend la main. `ShareComposeHandoffConsumer` reprend la
            // fiche au réveil de l'app.
            //
            // Aucun `discardStagedMedia()` ici, et c'est la même raison qu'à
            // `onFinish` : la fiche référence désormais ces fichiers, donc ils
            // ne sont plus orphelins — les effacer perdrait la pièce.
            onCompose: { [weak self] media, texte in
                guard let self else { return }
                let fiche = ShareComposeHandoff(
                    shareId: shareId,
                    createdAt: Date(),
                    text: texte,
                    media: media
                )
                do {
                    try fiche.write()
                } catch {
                    // La fiche n'a pas pu s'écrire : rien à reprendre côté app.
                    // On efface plutôt que de laisser des fichiers que plus
                    // personne ne décrit — exactement le cas qui a coûté 500 Mio
                    // orphelins au round 1 de revue.
                    self.discardStagedMedia()
                    self.complete()
                    return
                }
                self.openApp(fiche.openURL)
            },
            onCancel: { [weak self] in
                self?.discardStagedMedia()
                self?.complete()
            },
            onFinish: { [weak self] in self?.complete() }
        )

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

    /// **Le RACCOURCI, jamais le chemin.** `extensionContext.open` peut échouer
    /// sans un mot ; la fiche est déjà sur le disque et l'app la balaie à chaque
    /// réveil, donc la pièce arrive de toute façon. On ferme la feuille dans les
    /// DEUX cas — laisser l'auteur devant une feuille qui ne réagit pas serait
    /// pire que l'ouverture manquée.
    private func openApp(_ url: URL?) {
        guard let url, let contexte = extensionContext else {
            complete()
            return
        }
        contexte.open(url) { [weak self] _ in
            self?.complete()
        }
    }

    private func complete() {
        completionGate.fireOnce { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
        }
    }

    /// Round 1 de revue (fuite Important) : annuler APRÈS la copie mais AVANT
    /// `onSend` laissait jusqu'à 500 Mio orphelins — la fiche qui les décrit
    /// n'existe qu'après un envoi lancé (`installInterface`'s `onSend`), donc
    /// personne ne pouvait plus retrouver ces fichiers pour les effacer.
    /// Appelé UNIQUEMENT par le bouton Annuler, jamais par la fin d'un envoi
    /// (`onFinish`) : une fois `send()` lancé, `ShareSender.send` a déjà écrit
    /// la fiche qui décrit ces mêmes fichiers, donc ils ne sont plus orphelins
    /// — même différés, ils restent retrouvables.
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

        guard ShareLimits.fitsFileCount(fileProviders.count) else {
            completion([], .fileCountExceeded(count: fileProviders.count, limit: ShareLimits.maxFiles))
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

        group.notify(queue: .main) {
            let (media, failure) = box.snapshot
            let total = media.reduce(0) { $0 + $1.bytes }
            guard ShareLimits.fitsByteBudget(total) else {
                ShareMediaStaging.discard(shareId: shareId, in: mediaRoot)
                completion([], .byteBudgetExceeded(total: total, limit: ShareLimits.maxTotalBytes))
                return
            }
            completion(media, failure)
        }
    }
}

// MARK: - Interface

struct ShareContentView: View {
    let content: String?
    let media: [ShareStagedMedia]
    let stagingFailure: ShareMediaStagingError?
    let state: ShareScreenState
    let onSend: (ShareSession, [String], String?, [ShareStagedMedia]) async -> SharePendingShare
    /// **Composer au lieu d'envoyer** (#5056, vue `2a`). Reçoit ce qui a été
    /// préparé ; c'est l'appelant qui écrit la fiche et rend la main.
    let onCompose: ([ShareStagedMedia], String?) -> Void
    /// Distinct de `onFinish` : appelé UNIQUEMENT par le bouton Annuler, pour
    /// que l'appelant sache qu'aucun envoi n'a été tenté et puisse effacer
    /// les fichiers déjà copiés (round 1 de revue, fuite Important).
    let onCancel: () -> Void
    let onFinish: () -> Void

    @State private var model = ForwardPickerModel()
    @State private var isSending = false
    /// Round 2 de revue (Critical) : verrou à SENS UNIQUE — armé au tout
    /// début d'un envoi tenté, jamais réarmé à `false` ensuite. `isSending`
    /// ne suffit pas : il redevient `false` avant le délai d'affichage qui
    /// précède `onFinish()`, c'est exactement la fenêtre qui laissait le
    /// bouton Annuler redevenir actif pendant que la fiche référençait déjà
    /// les fichiers copiés. Voir `ShareCancelPolicy`.
    @State private var sendWasAttempted = false
    @State private var resultMessage: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Round 1 de revue (écart au brief) : `contentPreview` doit
                // rester un `if` AUTONOME, pas chaîné dans ce `else if`. Un
                // partage portant à la fois du texte et des fichiers (page
                // Safari + son image, sélection Photos + un lien) envoie bien
                // les deux (`send()` transmet `content` ET `media`) — masquer
                // l'aperçu texte dès qu'un média est présent empêchait
                // l'utilisateur de vérifier ce qu'il s'apprêtait à envoyer.
                if stagingFailure != nil {
                    message(
                        systemImage: "exclamationmark.icloud",
                        text: String(
                            localized: "share.media.unavailable",
                            defaultValue: "Some files could not be prepared. Download them first, then try again."
                        )
                    )
                    Divider()
                } else if !media.isEmpty {
                    mediaPreview(media)
                    Divider()
                }

                if let content {
                    contentPreview(content)
                    Divider()
                }

                switch state {
                case .signedOut:
                    message(
                        systemImage: "person.crop.circle.badge.exclamationmark",
                        text: String(
                            localized: "share.signedOut",
                            defaultValue: "Connectez-vous à Meeshy pour partager"
                        )
                    )
                case .noConversations:
                    message(
                        systemImage: "bubble.left.and.bubble.right",
                        text: String(
                            localized: "share.empty",
                            defaultValue: "Ouvrez Meeshy une fois pour retrouver vos conversations ici"
                        )
                    )
                case .ready(_, let targets):
                    conversationList(targets)
                }

                Spacer(minLength: 0)
                actionBar
            }
            .navigationTitle(String(localized: "share.title", defaultValue: "Share to Meeshy"))
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    // MARK: Sous-vues

    private func contentPreview(_ content: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: isLink(content) ? "link" : "doc.text.fill")
                .font(.title2)
                .foregroundStyle(.tint)
            Text(content)
                .font(.callout)
                .lineLimit(3)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding()
        .background(Color.secondary.opacity(0.1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(isLink(content)
            ? String(localized: "share.type.url", defaultValue: "Link")
            : String(localized: "share.type.text", defaultValue: "Text"))
        .accessibilityValue(content)
    }

    private func isLink(_ content: String) -> Bool {
        content.hasPrefix("http://") || content.hasPrefix("https://")
    }

    private func mediaPreview(_ media: [ShareStagedMedia]) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "photo.on.rectangle.angled")
                .font(.title2)
                .foregroundStyle(.tint)
            Text(String(
                localized: "share.media.count",
                defaultValue: "\(media.count) file(s) ready to send"
            ))
            .font(.callout)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding()
        .background(Color.secondary.opacity(0.1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(
            localized: "share.media.count",
            defaultValue: "\(media.count) file(s) ready to send"
        ))
    }

    private func message(systemImage: String, text: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text(text)
                .font(.callout)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 32)
        .padding(.top, 48)
    }

    private func conversationList(_ targets: [ShareTarget]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(
                localized: "share.sendToMany",
                defaultValue: "Send to (up to 10)"
            ))
                .font(.headline)
                .padding(.horizontal)
                .padding(.top)
                .accessibilityAddTraits(.isHeader)

            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(targets) { target in
                        Button {
                            guard ShareLimits.canSelectMore(
                                selectedCount: model.selectedIds.count,
                                isAlreadySelected: model.state(of: target.id) == .selected
                            ) else { return }
                            model.tapRow(target.id)
                        } label: {
                            ShareTargetRow(target: target, isSelected: model.state(of: target.id) == .selected)
                        }
                        .buttonStyle(.plain)
                        .disabled(isSending)
                    }
                }
            }
        }
    }

    /// `.frame`/`.padding` sont À L'INTÉRIEUR du label : la zone tactile d'un
    /// `Button` épouse la forme de son contenu, les poser à l'extérieur
    /// dessinerait une pilule pleine largeur dont seul le texte réagirait.
    private var actionBar: some View {
        VStack(spacing: 12) {
            if let resultMessage {
                Text(resultMessage)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .transition(.opacity)
            }

            HStack(spacing: 16) {
                Button {
                    onCancel()
                } label: {
                    Text(String(localized: "share.cancel", defaultValue: "Cancel"))
                        .frame(maxWidth: .infinity)
                        .padding()
                }
                .background(Color.secondary.opacity(0.2))
                .foregroundStyle(.primary)
                .cornerRadius(12)
                .disabled(!ShareCancelPolicy.isCancelAllowed(sendWasAttempted: sendWasAttempted))

                if canCompose {
                    Button {
                        // Verrou à sens unique, comme l'envoi : une fois la
                        // fiche écrite, les fichiers lui appartiennent et
                        // « Annuler » ne doit plus les effacer.
                        sendWasAttempted = true
                        onCompose(media, content)
                    } label: {
                        // Défaut ANGLAIS, comme `share.cancel` et `share.send`
                        // juste à côté : c'est la convention de cette
                        // extension, et un défaut français ferait rougir le
                        // cliquet du dépôt. La clé est traduite dans les sept
                        // langues du catalogue PROPRE à l'extension.
                        Text(String(localized: "share.compose",
                                    defaultValue: "Compose"))
                            .frame(maxWidth: .infinity)
                            .padding()
                    }
                    .background(Color.secondary.opacity(0.2))
                    .foregroundStyle(.primary)
                    .cornerRadius(12)
                    .disabled(isSending)
                }

                if case .ready = state {
                    Button {
                        send()
                    } label: {
                        Group {
                            if isSending {
                                ProgressView()
                            } else {
                                Text(String(localized: "share.send", defaultValue: "Send"))
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                    }
                    .background(canSend ? Color.accentColor : Color.secondary.opacity(0.2))
                    // Suit l'état actif : un blanc figé sur le fond gris désactivé
                    // tombe à ~1,2:1 et le bouton paraît vide.
                    .foregroundStyle(canSend ? Color.white : Color.secondary)
                    .cornerRadius(12)
                    .disabled(!canSend)
                }
            }
        }
        .padding()
    }

    private var canSend: Bool {
        !model.selectedIds.isEmpty && !isSending && (content?.isEmpty == false || !media.isEmpty)
    }

    /// **Composer ne demande AUCUN destinataire** — c'est ce qui le distingue
    /// d'envoyer, et la raison pour laquelle il est offert dans des états où
    /// « Envoyer » ne l'est pas.
    ///
    /// Il est offert même hors session (`.signedOut`) et sans conversation
    /// (`.noConversations`) : la fiche se dépose sur le disque, l'app la reprend
    /// au réveil, et c'est l'app qui demandera de se connecter si besoin.
    /// L'exiger ici ferait perdre la pièce à quelqu'un qui vient d'installer.
    ///
    /// Une préparation ÉCHOUÉE le retire : composer une pièce qui n'a pas été
    /// copiée ouvrirait un composer vide — le refus est plus honnête.
    private var canCompose: Bool {
        stagingFailure == nil && !isSending && (content?.isEmpty == false || !media.isEmpty)
    }

    private func send() {
        guard case .ready(let session, let targets) = state else { return }
        let selected = model.beginBatch()
        let conversationIds = targets.map(\.id).filter { selected.contains($0) }
        guard !conversationIds.isEmpty else { return }

        sendWasAttempted = true
        isSending = true
        Task {
            let served = await onSend(session, conversationIds, content, media)
            for (index, target) in served.targets.enumerated() {
                model.finishSend(
                    target.conversationId,
                    succeeded: target.state == .sent,
                    reason: target.state == .sent ? nil : "\(index)"
                )
            }
            isSending = false
            resultMessage = ShareSender.outcome(of: served) == .sent
                ? String(localized: "share.status.sent", defaultValue: "Envoyé")
                : String(localized: "share.status.deferred", defaultValue: "Sera envoyé à la reconnexion")
            try? await Task.sleep(nanoseconds: 700_000_000)
            onFinish()
        }
    }
}

// MARK: - Ligne de conversation

struct ShareTargetRow: View {
    let target: ShareTarget
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color(hexString: target.accentColorHex) ?? .gray)
                    .frame(width: 44, height: 44)
                Text(target.initials)
                    .font(.headline)
                    .foregroundStyle(.white)
            }

            Text(target.displayName)
                .font(.body)
                .lineLimit(1)

            Spacer()

            if isSelected {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.tint)
                    .font(.title3)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
        .background(isSelected ? Color.accentColor.opacity(0.12) : Color.clear)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(target.displayName)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : [.isButton])
    }
}

// MARK: - Couleur

extension Color {
    /// L'extension ne lie pas MeeshyUI : ce décodeur hexadécimal minimal évite
    /// d'embarquer tout le target UI pour une pastille d'avatar.
    init?(hexString: String) {
        var hex = hexString.trimmingCharacters(in: .whitespacesAndNewlines)
        if hex.hasPrefix("#") { hex.removeFirst() }
        guard hex.count == 6, let value = UInt32(hex, radix: 16) else { return nil }
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}
