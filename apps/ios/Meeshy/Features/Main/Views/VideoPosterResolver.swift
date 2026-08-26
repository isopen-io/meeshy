import SwiftUI
import MeeshySDK
import MeeshyUI
import os

// MARK: - Plan (pur)

/// D'où vient la première image NETTE d'une vidéo — l'ordre d'essai, décidé
/// sur des faits déjà collectés (feature 3 : « pour une vidéo, une image nette
/// AVANT le play »).
///
/// Le fichier sur l'appareil gagne toujours : sa première image se décode en
/// matériel (< 100 ms), sans réseau. Sinon, si la politique média autorise le
/// téléchargement, on ATTEND le fichier (la page l'a de toute façon lancé —
/// le store coalesce les deux appels sur UN téléchargement) puis on décode ;
/// en dernier recours, l'extraction distante par `Range` (le premier Mo, où
/// vit la première keyframe — un GESTE sur ce média autorise ce Mo, même en
/// data-saver ; un simple préchauffage, jamais). Sans réseau — hors ligne, ou
/// préchauffage local — rien : le repli vignette/thumbHash s'affiche sans
/// attendre.
enum VideoPosterPlan {
    enum Step: Equatable {
        case decodeLocalFile(URL)
        case downloadThenDecode(URL)
        case rangeExtract(URL)
    }

    /// QUI demande cette image — le seul fait qui autorise un octet lorsque la
    /// politique média REFUSE le téléchargement.
    ///
    /// Sans cette distinction, `policyAllowsDownload` ne choisissait que le
    /// TYPE de réseau (fichier complet vs. premier Mo par `Range`), jamais SI
    /// un réseau a lieu : ouvrir la galerie sur une image dont la VOISINE est
    /// une vidéo tirait un Mo de cette vidéo — en « Jamais télécharger », sur
    /// cellulaire, pour une vidéo que personne n'avait touchée.
    nonisolated enum Intent: Equatable {
        /// L'utilisateur a DÉSIGNÉ ce média : tap pour l'ouvrir en plein écran,
        /// page de galerie sur laquelle il s'est arrêté, « Télécharger ? »
        /// pressé. Un geste manuel paie le Mo de l'extraction (§14.1).
        case userOpened
        /// Personne n'a touché CE média : page voisine de la fenêtre de rendu,
        /// préchauffage. Le réseau n'est touché que si la politique média
        /// l'autorise d'elle-même.
        case ambientPrewarm
    }

    nonisolated static func steps(
        localFileURL: URL?,
        remoteURL: URL?,
        policyAllowsDownload: Bool,
        allowsNetwork: Bool,
        intent: Intent
    ) -> [Step] {
        if let localFileURL { return [.decodeLocalFile(localFileURL)] }
        guard allowsNetwork, let remoteURL, !remoteURL.isFileURL else { return [] }
        if policyAllowsDownload { return [.downloadThenDecode(remoteURL), .rangeExtract(remoteURL)] }
        guard intent == .userOpened else { return [] }
        return [.rangeExtract(remoteURL)]
    }
}

// MARK: - Grade (pur)

/// La clé de persistance `thumb:<url>` est PARTAGÉE avec deux écrivains de
/// grade bulle (`MeeshyVideoThumbnail` : 300 px, `StoryMediaLoader` : 400 px).
/// Un poster de ce grade est net dans une bulle et flou en plein écran : il
/// est refusé — et ré-extrait une fois, à ce grade-ci — sauf quand rien de
/// plus grand n'est ATTEIGNABLE : source connue plus petite, ou source
/// inconnue et poster déjà au-dessus du grade bulle.
enum VideoPosterGrade {
    /// Plus grand côté (px) exigé d'un poster plein écran quand la source le permet.
    nonisolated static let fullscreenMinDimension: CGFloat = 1080
    /// Plus grand côté (px) auquel on extrait : 1080p exact, 4K rabattu — un
    /// budget mémoire (≈ 8 Mo décodés au plus), pas une mesure d'écran.
    nonisolated static let extractionMaxDimension: CGFloat = 1920
    /// Plus grand côté (px) qu'un écrivain de grade BULLE peut déposer sous la
    /// clé partagée `thumb:<url>` : `MeeshyVideoThumbnail` extrait à 300 px,
    /// `StoryMediaLoader` à 400. Au-dessus, le poster ne peut venir que de la
    /// cascade plein écran (qui extrait jusqu'à `extractionMaxDimension`).
    nonisolated static let bubbleGradeMaxDimension: CGFloat = 400

    /// La question n'est pas « ce poster fait-il 1080 px ? » mais « une
    /// ré-extraction ferait-elle MIEUX ? ». Source CONNUE : mieux, c'est
    /// `min(1080, source)`. Source INCONNUE — le cas NOMINAL d'une vidéo, Prisma
    /// rangeant `width`/`height` sous les métadonnées d'IMAGE et le chemin
    /// chiffré ne les écrivant jamais — exiger 1080 rejetait perpétuellement ce
    /// que la cascade venait elle-même de produire (854×480 d'une source 480p),
    /// donc ré-extrayait 1 Mo à chaque entrée dans la fenêtre de rendu, sans
    /// jamais se stabiliser. Le seul plancher défendable est alors le plafond
    /// des écrivains de grade BULLE qui partagent la clé `thumb:<url>` : au-delà,
    /// le poster vient forcément de la cascade plein écran, et rien de plus net
    /// n'est atteignable.
    nonisolated static func isFullscreenSharp(posterMaxDimension: CGFloat, sourceMaxDimension: CGFloat?) -> Bool {
        guard let sourceMaxDimension else { return posterMaxDimension > bubbleGradeMaxDimension }
        return posterMaxDimension >= min(fullscreenMinDimension, sourceMaxDimension)
    }
}

// MARK: - Résolution (orchestration app)

/// Cascade du poster net — côté APP (SDK purity : elle lit les singletons
/// nommés du produit et encode « quand faire quoi »), à côté de
/// `VideoAvailabilityResolver` dont elle est le pendant pour l'IMAGE d'attente.
/// Atomes SDK composés : `StoryMediaDecoder.firstFrame` (décodage matériel,
/// tolérances nulles), `CacheCoordinator.videoLocalFileURL(Await)`,
/// `MeeshyVideoThumbnail.extractRemoteFirstFrame` (Range), le store
/// `thumbnails` pour la persistance.
enum VideoPosterResolver {

    /// Clé de persistance — celle que les écrivains existants utilisent déjà.
    nonisolated static func posterKey(for attachment: MessageAttachment) -> String? {
        remoteVideoURL(for: attachment).map { "thumb:\($0.absoluteString)" }
    }

    /// Lecture SYNCHRONE du poster déjà persisté (NSCache, puis disque) — pour
    /// qu'une page qui s'ouvre sur une vidéo déjà vue rende son poster au
    /// premier `body`, sans transition. `nil` si absent ou de grade bulle.
    nonisolated static func persistedPoster(for attachment: MessageAttachment) -> UIImage? {
        guard let key = posterKey(for: attachment),
              let image = CacheCoordinator.warmedThumbnail(for: key)
        else { return nil }
        let posterMax = max(image.size.width, image.size.height) * image.scale
        guard VideoPosterGrade.isFullscreenSharp(
            posterMaxDimension: posterMax,
            sourceMaxDimension: sourceMaxDimension(of: attachment)
        ) else { return nil }
        return image
    }

    /// La cascade complète. `allowsNetwork: false` (préchauffage local, hors
    /// ligne) ne touche jamais le réseau ; `intent` dit si un GESTE porte sur
    /// ce média précis — seul un geste paie le Mo de l'extraction quand la
    /// politique média refuse le téléchargement. Le résultat est persisté sous
    /// `thumb:<url>` et rendu résident pour la lecture synchrone suivante.
    static func resolve(
        attachment: MessageAttachment,
        allowsNetwork: Bool,
        intent: VideoPosterPlan.Intent
    ) async -> UIImage? {
        if let persisted = persistedPoster(for: attachment) { return persisted }
        guard let key = posterKey(for: attachment) else { return nil }

        let condition = NetworkConditionMonitor.shared.condition
        let policyAllows = MediaDownloadPolicyEngine.shouldAutoDownload(
            kind: .video,
            condition: condition,
            prefs: MediaDownloadPreferencesStore.shared.preferences
        )
        let steps = VideoPosterPlan.steps(
            localFileURL: localVideoFileURL(for: attachment),
            remoteURL: remoteVideoURL(for: attachment),
            policyAllowsDownload: policyAllows,
            allowsNetwork: allowsNetwork && condition != .offline,
            intent: intent
        )
        for step in steps {
            guard !Task.isCancelled else { return nil }
            guard let frame = await execute(step) else { continue }
            await persist(frame, key: key)
            return frame
        }
        return nil
    }

    /// Préchauffage : extrait le poster SEULEMENT si le fichier vidéo est déjà
    /// sur l'appareil — jamais de réseau pour une page que personne ne regarde
    /// encore. Fire-and-forget.
    static func warmIfLocal(_ attachment: MessageAttachment) {
        guard localVideoFileURL(for: attachment) != nil,
              persistedPoster(for: attachment) == nil
        else { return }
        Task { _ = await resolve(attachment: attachment, allowsNetwork: false, intent: .ambientPrewarm) }
    }

    /// Le poster tel que le renderer plein écran du SDK le consomme : lecture
    /// synchrone au montage, cascade sinon.
    static func poster(for attachment: MessageAttachment) -> MeeshyVideoPlayer.Poster {
        MeeshyVideoPlayer.Poster(
            initial: persistedPoster(for: attachment),
            resolve: { await resolve(attachment: attachment, allowsNetwork: true, intent: .userOpened) }
        )
    }

    // MARK: Faits

    nonisolated static func remoteVideoURL(for attachment: MessageAttachment) -> URL? {
        guard !attachment.fileUrl.isEmpty else { return nil }
        return MeeshyConfig.resolveMediaURL(attachment.fileUrl)
    }

    /// Le fichier vidéo sur l'appareil : un `file://` existant (média
    /// optimiste, composer), ou le cache disque du store `video`.
    nonisolated static func localVideoFileURL(for attachment: MessageAttachment) -> URL? {
        if attachment.fileUrl.hasPrefix("file://") {
            guard let url = URL(string: attachment.fileUrl),
                  FileManager.default.fileExists(atPath: url.path) else { return nil }
            return url
        }
        guard let remote = remoteVideoURL(for: attachment) else { return nil }
        return CacheCoordinator.videoLocalFileURL(for: remote.absoluteString)
    }

    nonisolated private static func sourceMaxDimension(of attachment: MessageAttachment) -> CGFloat? {
        guard let width = attachment.width, let height = attachment.height, width > 0, height > 0 else { return nil }
        return CGFloat(max(width, height))
    }

    // MARK: Étapes

    private static func execute(_ step: VideoPosterPlan.Step) async -> UIImage? {
        switch step {
        case .decodeLocalFile(let url):
            return await firstFrame(of: url)
        case .downloadThenDecode(let remote):
            guard let local = await CacheCoordinator.videoLocalFileURLAwait(for: remote) else { return nil }
            return await firstFrame(of: local)
        case .rangeExtract(let remote):
            do {
                return try await MeeshyVideoThumbnail.extractRemoteFirstFrame(
                    from: remote,
                    maxDimension: VideoPosterGrade.extractionMaxDimension,
                    timeout: 8
                )
            } catch {
                Logger.media.error("Video poster range extraction failed: \(error.localizedDescription, privacy: .public)")
                return nil
            }
        }
    }

    private static func firstFrame(of url: URL) async -> UIImage? {
        do {
            return try await StoryMediaDecoder.firstFrame(of: url, maxDimension: VideoPosterGrade.extractionMaxDimension)
        } catch {
            Logger.media.error("Video poster decode failed for \(url.lastPathComponent, privacy: .public): \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    /// Résident d'abord (la lecture synchrone suivante le trouve en NSCache),
    /// disque ensuite (relance à froid) — sous la clé que les bulles lisent aussi.
    private static func persist(_ frame: UIImage, key: String) async {
        DiskCacheStore.cacheImageForPreview(frame, key: key)
        guard let data = frame.jpegData(compressionQuality: 0.8) else { return }
        await CacheCoordinator.shared.thumbnails.store(data, for: key)
    }
}
