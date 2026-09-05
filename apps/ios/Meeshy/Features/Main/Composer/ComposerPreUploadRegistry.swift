import Foundation
import MeeshySDK
import os

/// **Ce qui monte un asset, vu du registre.**
///
/// Un protocole parce que le registre encode une RÈGLE — quand partir, combien
/// en parallèle, que faire d'un échec — et qu'aucune de ces trois questions ne
/// s'éprouve si elle traîne une session TUS et un jeton derrière elle. Le
/// protocole vit ici, au-dessus du type concret, comme l'exige la convention du
/// dépôt.
protocol ComposerPreUploadProviding: Sendable {
    /// - Returns: l'identifiant serveur et l'URL distante de l'asset.
    func upload(fileURL: URL, mimeType: String) async throws
        -> (postMediaId: String, remoteURL: String)
}

/// **Le registre des pré-montées — indexé par FICHIER** (#5086, vue `4c`).
///
/// > « La composition continue pendant la montée : au moment de publier, il ne
/// > reste qu'un accusé à attendre — pas un envoi entier. »
///
/// ## Pourquoi par fichier
///
/// C'est le fichier qui monte. Un registre indexé par identifiant d'objet
/// devrait suivre les créations, les suppressions et les déplacements du
/// document — c'est-à-dire dupliquer un état dont le modèle est déjà la source,
/// et diverger à la première opération qu'il raterait.
///
/// ## Ce que le registre ne fait PAS
///
/// Il ne publie pas, ne connaît pas les slides, et **ne rapporte aucun échec à
/// l'auteur**. Une pré-montée ratée laisse l'objet local ; la publication le
/// monte comme avant ce lot. Annoncer un échec que l'auteur ne peut ni
/// comprendre ni corriger transformerait une optimisation invisible en
/// inquiétude.
@MainActor
final class ComposerPreUploadRegistry: ObservableObject {

    /// L'état de chaque fichier posé. `@Published` parce que la vue `4c` peint
    /// « MONTÉE EN COURS · 34 % · 4,8 / 14,2 Mo » à partir de lui.
    @Published private(set) var states: [URL: ComposerPreUploadState] = [:]

    /// Le monteur, remis APRÈS l'initialisation : il a besoin de l'origine du
    /// serveur et du jeton, que le meuble ne connaît qu'une fois monté. `nil` ⇒
    /// la pré-montée ne part pas, et la publication monte comme avant ce lot —
    /// le repli est le chemin nominal, ici comme ailleurs.
    private var uploader: ComposerPreUploadProviding?
    private var tasks: [URL: Task<Void, Never>] = [:]
    private var waiting: [(url: URL, mimeType: String)] = []
    private var running = 0
    private let logger = Logger(subsystem: "me.meeshy.app", category: "media")

    /// **L'adoption est remise par l'hôte, pas cherchée par le registre.**
    ///
    /// Le registre ne connaît pas le document ; il rend un couple
    /// identifiant/URL et laisse le meuble décider où le déposer. C'est aussi
    /// ce qui le rend testable sans monter un `StoryComposerViewModel`.
    ///
    /// - Returns: `false` quand l'objet a disparu — l'auteur l'a retiré pendant
    ///   la montée. Le registre l'oublie alors, sans le traiter comme un échec.
    var adopt: ((_ localURL: URL, _ postMediaId: String, _ remoteURL: String) -> Bool)?

    /// **`deinit` NON isolée, et ce n'est pas une précaution** (SE-0466).
    ///
    /// Sous isolation `MainActor` par défaut, la `deinit` synthétisée d'une
    /// classe `@MainActor` est ISOLÉE — et le démontage hors d'une tâche
    /// produit un double-free. Ici le registre tient des `Task` : à la fin d'un
    /// test, une montée suspendue survit au registre, et le processus meurt au
    /// TEARDOWN — « TEST EXECUTE FAILED » après que toutes les suites ont
    /// affiché « passed ». Un verdict qui ne désigne aucun test.
    ///
    /// Garde du dépôt : `MainActorDeinitSourceGuardTests`.
    nonisolated deinit {}

    init(uploader: ComposerPreUploadProviding? = nil) {
        self.uploader = uploader
    }

    /// Remet le monteur. Idempotent : le meuble appelle à chaque apparition, et
    /// en reconstruire un à chaque fois ouvrirait une session TUS par
    /// apparition.
    func configure(_ uploader: ComposerPreUploadProviding) {
        guard self.uploader == nil else { return }
        self.uploader = uploader
    }

    func state(for url: URL) -> ComposerPreUploadState { states[url] ?? .idle }

    /// **Lance la montée d'un asset posé, si elle en vaut la peine.**
    ///
    /// Idempotent par fichier : reposer le même média — un aller-retour dans la
    /// galerie, une slide dupliquée — ne relance rien. Sans cette borne, chaque
    /// passage par la porte d'entrée doublerait les envois en vol.
    func begin(url: URL, mimeType: String, fileSize: Int64, alreadyRemote: Bool) {
        guard uploader != nil else { return }
        guard states[url] == nil else { return }
        guard ComposerPreUploadPolicy.mayBegin(fileSize: fileSize, alreadyRemote: alreadyRemote) else {
            return
        }
        // **Une pré-montée qui part sans le dire est indistinguable d'une
        // pré-montée qui ne part pas.** Tout le lot est INVISIBLE par
        // construction — c'est sa qualité : l'auteur ne doit rien remarquer.
        // Le seul témoin qu'un appareil réel puisse rendre est ce journal, et
        // c'est lui qui sépare « ça marche » de « rien ne rougit ».
        logger.info(
            "pré-montée démarrée: \(url.lastPathComponent, privacy: .public) type=\(mimeType, privacy: .public) octets=\(fileSize, privacy: .public)"
        )
        states[url] = .uploading(sent: 0, total: fileSize)
        waiting.append((url, mimeType))
        drain()
    }

    /// **Oublie un fichier retiré de la composition.**
    ///
    /// L'envoi en vol est ANNULÉ : le laisser finir monterait un asset que rien
    /// ne référencera plus — l'orphelin que le critère de fin de #5086 nomme
    /// explicitement. L'annulation ne le supprime pas côté serveur quand il est
    /// déjà arrivé ; c'est le balayage de la passerelle qui s'en charge, et il
    /// est un lot à part.
    func forget(url: URL) {
        tasks[url]?.cancel()
        tasks[url] = nil
        waiting.removeAll { $0.url == url }
        states[url] = nil
    }

    /// **La publication démarre : plus rien ne part tôt.**
    ///
    /// Ce qui est déjà PRÊT reste prêt — la publication le référencera. Ce qui
    /// est en vol est annulé, parce que la publication va le monter elle-même :
    /// le laisser courir ferait deux envois du même fichier en même temps,
    /// c'est-à-dire la moitié de la bande passante pour l'envoi qui compte.
    func stopForPublication() {
        for (url, task) in tasks {
            task.cancel()
            tasks[url] = nil
            if !state(for: url).isReady { states[url] = nil }
        }
        waiting.removeAll()
        running = 0
    }

    // MARK: - La file

    /// **Deux à la fois, pas plus.** La bande passante est la ressource que la
    /// composition partage avec la pré-montée, et la vue `4a` budgète 60 fps
    /// PENDANT la montée. Le nombre vient de la règle, jamais d'un littéral
    /// écrit ici.
    private func drain() {
        while running < ComposerPreUploadPolicy.maximumConcurrent, !waiting.isEmpty {
            let next = waiting.removeFirst()
            running += 1
            tasks[next.url] = Task { [weak self] in
                await self?.run(url: next.url, mimeType: next.mimeType)
            }
        }
    }

    private func run(url: URL, mimeType: String) async {
        defer {
            running = max(0, running - 1)
            tasks[url] = nil
            drain()
        }
        guard let uploader else { return }
        do {
            let result = try await uploader.upload(fileURL: url, mimeType: mimeType)
            guard !Task.isCancelled else { return }
            // **L'adoption décide de l'état final.** Un objet disparu — l'auteur
            // l'a retiré pendant la montée — n'est pas un succès à afficher : le
            // registre l'oublie, et la vue cesse de peindre une progression pour
            // un média qui n'est plus là.
            let adopte = adopt?(url, result.postMediaId, result.remoteURL) ?? false
            logger.info(
                "pré-montée aboutie: \(url.lastPathComponent, privacy: .public) id=\(result.postMediaId, privacy: .public) adoptée=\(adopte, privacy: .public)"
            )
            states[url] = adopte
                ? .ready(postMediaId: result.postMediaId, remoteURL: result.remoteURL)
                : nil
        } catch is CancellationError {
            states[url] = nil
        } catch {
            // **L'échec se JOURNALISE, il ne se montre pas.** La publication
            // reprendra l'envoi ; l'auteur n'a rien à faire de cette
            // information, et la lui donner transformerait une optimisation
            // invisible en inquiétude.
            logger.info(
                "pré-montée échouée, la publication reprendra: \(url.lastPathComponent, privacy: .public) — \(error.localizedDescription, privacy: .public)"
            )
            states[url] = .failed
        }
    }
}

/// L'implémentation réelle — un mince adaptateur au-dessus du `TusUploadManager`
/// du SDK. Elle ne décide de RIEN : toutes les règles vivent dans
/// `ComposerPreUploadPolicy` et dans le registre.
struct ComposerTusPreUploader: ComposerPreUploadProviding {
    let baseURL: URL
    let token: String

    func upload(fileURL: URL, mimeType: String) async throws
        -> (postMediaId: String, remoteURL: String) {
        let result = try await TusUploadManager(baseURL: baseURL).uploadFile(
            fileURL: fileURL,
            mimeType: mimeType,
            credential: .bearer(token),
            // Le MÊME contexte que la publication : c'est lui qui range l'asset
            // côté serveur, et deux contextes pour un même asset le feraient
            // ranger deux fois.
            uploadContext: "story"
        )
        return (result.id, result.fileUrl)
    }
}
