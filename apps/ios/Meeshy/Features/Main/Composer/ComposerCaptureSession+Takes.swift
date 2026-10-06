import Combine
import ImageIO
import MeeshySDK
import UIKit

/// Où part une prise (#9351).
nonisolated enum ComposerTakeIntent: Equatable, Sendable {
    /// La scène : la prise mène à l'édition (puis à l'hôte).
    case edit
    /// La miniature choisie : brut ET rendu partent en galerie, on reste en capture.
    case gallery
}

extension ComposerCaptureCopy {
    static var savedToPhotos: String {
        String(localized: "composer.capture.savedToPhotos", defaultValue: "Enregistré dans Photos", bundle: .main)
    }
}

/// **Les prises arrivent à la session, une fois** (#9351) — plus aux hôtes.
///
/// Brut ET rendu partent ensemble en galerie (décision porteur) : le brut, à la
/// prise, par `CameraModel` ; le rendu — filtre et cadre combinés, sur le canevas
/// 9:16 qu'on voyait — ici. Une vidéo sans effet n'en fait qu'UN, son rendu
/// étant identique au brut. « Enregistré » ne se dit que quand tout a réussi ;
/// un refus se dit, lui, par `reportPhotoLibraryRefusal`.
extension ComposerCaptureSession {

    /// Les IDENTIFIANTS, jamais les valeurs : deux prises identiques d'affilée
    /// ne changeraient pas `capturedPhoto`. Un enregistrement qui ne rendra aucun
    /// fichier libère son intention.
    func subscribeToTakes() {
        camera.$capturedPhotoId.compactMap { $0 }
            .sink { [weak self] _ in self?.photoArrived() }
            .store(in: &takeSubscriptions)
        camera.$capturedVideoId.compactMap { $0 }
            .sink { [weak self] id in self?.videoArrived(id) }
            .store(in: &takeSubscriptions)
        camera.$abandonedRecordingId.compactMap { $0 }
            .sink { [weak self] id in self?.filmIntents[id] = nil }
            .store(in: &takeSubscriptions)
    }

    /// Armer ou fermer le viseur oublie toute intention en attente.
    func resetIntents() {
        filmIntent = .edit
        photoInFlightIntent = .edit
        filmIntents = [:]
    }

    /// **Le geste décidé par la table, exécuté.** Mise au point, zoom, rangement et
    /// cadrage ont besoin d'une géométrie : la vue les fait elle-même.
    func perform(_ action: ComposerCaptureAction, item: ComposerLookStripItem?) {
        switch action {
        case .photoToEdit:
            shootPhoto(intent: .edit)
        case .photoToGallery:
            shootPhoto(intent: .gallery)
        case .filmSegment:
            beginHold()
        case .filmToGallery:
            holdToFilmForGallery()
        case .stopTake:
            closeTake()
        case .select:
            guard let item else { return }
            look = ComposerLookStripRule.look(of: item, combinedWith: look)
            HapticFeedback.light()
        case .none, .focus, .zoom, .steerTake, .close, .openFamily, .reframe:
            return
        }
    }

    /// **VoiceOver ne TIENT pas un doigt** : la prise demandée part verrouillée
    /// (`ComposerCaptureHold.release` garde une prise verrouillée), puis la tenue
    /// se relâche — sans quoi `holdStartedAt` bloquerait toute demande suivante.
    func lockPendingTake() {
        guard holdStartedAt != nil else { return }
        holdPhase = .locked
        lockProgress = 1
        endHold()
    }

    /// L'intention voyage avec la demande ; l'obturateur la fige en partant.
    func shootPhoto(intent: ComposerTakeIntent) {
        photographWhenReady(intent: intent)
    }

    /// L'appui long de la miniature : la tenue de la scène, vers la galerie —
    /// une tenue refusée ne lègue pas son intention.
    func holdToFilmForGallery() {
        guard holdStartedAt == nil else { return }
        beginHold()
        if holdStartedAt != nil { filmIntent = .gallery }
    }

    /// L'enregistrement part : son intention est figée.
    func noteRecordingStarted() -> ComposerTakeIntent {
        let intent = filmIntent
        filmIntent = .edit
        return intent
    }

    /// L'intention suit SON enregistrement — `nil` : il n'a pas démarré (la prise
    /// précédente n'est pas encore livrée, ou l'objectif refuse), et le viseur
    /// revient à l'armé plutôt que d'afficher une prise que rien n'écrit.
    func bindRecording(_ intent: ComposerTakeIntent, to id: String?) {
        guard let id else { return recordingDidNotStart() }
        filmIntents[id] = intent
    }

    func recordingDidNotStart() {
        guard stage == .recording else { return }
        stage = .armed
        holdStartedAt = nil
        holdPhase = nil
        lockProgress = 0
        extinguishFlash()
    }

    /// Au plus ce délai d'attente de la prise précédente (sa finalisation, une
    /// fusion de bascule) avant de renoncer.
    static let previousTakeTimeout: TimeInterval = 1.5

    /// **La tenue attend la livraison de la prise précédente** plutôt que d'être
    /// refusée : « tenir, lâcher, retenir » accumule ses segments. Au-delà de la
    /// borne, elle renonce proprement — l'armé, sans cadenas — et le dit : une
    /// haptique d'avertissement, une annonce VoiceOver.
    func awaitPreviousTake() async -> Bool {
        defer { awaitsPreviousTake = false }
        guard controls.recordingIsPending else { return true }
        awaitsPreviousTake = true
        let limite = Date().addingTimeInterval(Self.previousTakeTimeout)
        while controls.recordingIsPending {
            guard !Task.isCancelled else { return false }
            guard Date() < limite else {
                holdStartedAt = nil
                holdPhase = nil
                lockProgress = 0
                HapticFeedback.warning()
                UIAccessibility.post(notification: .announcement,
                                     argument: ComposerSceneCameraCopy.previousTakeStillSaving)
                return false
            }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        return !Task.isCancelled
    }

    /// La photo de la scène s'ouvre en ÉDITION (#9352) : rien ne part vers l'hôte
    /// avant « Terminé ». Celle de la miniature choisie part en galerie.
    func photoArrived() {
        guard stage != .off, let image = camera.capturedPhoto else { return }
        let intent = photoInFlightIntent
        photoInFlightIntent = .edit
        switch intent {
        case .gallery:
            saveRenderedPhoto(image, data: camera.capturedPhotoData)
        case .edit:
            beginEditing(photo: image, data: camera.capturedPhotoData)
        }
    }

    /// Une vidéo arrivée APRÈS la fermeture ne devient rien : son brut est déjà en
    /// galerie, son fichier temporaire part. Le jeton est celui que l'éditeur
    /// PUBLIE : `@Published` émet avant d'écrire, `camera.capturedVideoId` serait
    /// encore l'ancien.
    func videoArrived(_ id: String) {
        guard let url = camera.capturedVideoURL else { return }
        let intent = filmIntents.removeValue(forKey: id) ?? .edit
        guard stage != .off else {
            discardTake(url, context: "prise arrivée après la fermeture du viseur")
            return
        }
        switch intent {
        case .gallery: saveRenderedVideo(url)
        case .edit: collectSegment(url)
        }
    }

    /// Le RENDU part en galerie, encodé avec l'EXIF de la prise, à côté du brut.
    /// Le verdict du brut d'abord : refusé, rien n'est peint (et le refus ne se
    /// dit qu'une fois). Les rendus passent un par un.
    func saveRenderedPhoto(_ image: UIImage, data: Data?) {
        let repli = data == nil ? image : nil
        let regard = look
        let auteur = lookPerson
        let date = lookDate
        let cache = scenes
        let galerie = gallery
        let brut = camera.librarySave
        let precedent = galleryChain
        beginGallerySave()
        galleryChain = Task { @MainActor in
            defer { endGallerySave() }
            await precedent?.value
            guard await brut?.value ?? true,
                  let octets = await Self.renderedPhotoBytes(data, fallback: repli, look: regard, person: auteur,
                                                             date: date, scenes: cache),
                  await galerie.saveImage(octets) else { return }
            FeedbackToastManager.shared.showSuccess(ComposerCaptureCopy.savedToPhotos)
        }
    }

    /// Peindre et encoder dans une portée à part : la file ne retient que les
    /// OCTETS de la prise (quelques Mo), décodés ici, hors du fil principal — la
    /// source et la toile pleine définition sont relâchées avant que Photos ne
    /// fasse attendre. L'image ne sert que sans octets.
    @concurrent
    nonisolated static func renderedPhotoBytes(_ data: Data?, fallback: UIImage?, look: ComposerPhotoLook,
                                               person: CallFramePerson, date: Date,
                                               scenes: any ComposerLookSceneProviding) async -> Data? {
        guard let debout = data.flatMap(uprightImage) ?? fallback.flatMap(ComposerPhotoLookSource.upright),
              let rendu = await ComposerLookPainter.renderPhoto(debout, look: look, framing: .identity,
                                                                person: person, date: date, scenes: scenes)
        else { return nil }
        return await ComposerPhotoEncoding.encode(rendu, like: data)
    }

    /// Les octets décodés DEBOUT, à leur pleine définition.
    nonisolated static func uprightImage(_ data: Data) -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let proprietes = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let largeur = proprietes[kCGImagePropertyPixelWidth] as? Int,
              let hauteur = proprietes[kCGImagePropertyPixelHeight] as? Int else { return nil }
        return CGImageSourceCreateThumbnailAtIndex(source, 0, [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: max(largeur, hauteur),
        ] as CFDictionary)
    }

    /// Le RENDU de la vidéo part en galerie, à côté du brut. **Sans effet, UN seul
    /// fichier** (tranché par le coordinateur, à confirmer par le porteur — #9351) :
    /// la vidéo brute est déjà sur le canevas qu'on voyait, et son rendu lui serait
    /// identique au pixel près — l'export rend alors le brut lui-même.
    func saveRenderedVideo(_ url: URL) {
        let regard = look
        let auteur = lookPerson
        let date = lookDate
        let galerie = gallery
        let espace = camera.liveFeed.declaredSpace?.name as String?
        let brut = camera.librarySave
        let precedent = galleryChain
        beginGallerySave()
        galleryChain = Task { @MainActor in
            defer {
                FileManager.default.removeItemLogging(at: url, context: "brut déjà en galerie", logger: .media)
                endGallerySave()
            }
            await precedent?.value
            guard await brut?.value ?? true else { return }
            let rendue = await ComposerLookVideoExporter.export(url, look: regard, person: auteur, date: date,
                                                                 declaredSpaceName: espace)
            guard let rendue else { return }
            if rendue != url {
                let enregistree = await galerie.saveVideo(at: rendue)
                FileManager.default.removeItemLogging(at: rendue, context: "rendu enregistré en galerie",
                                                      logger: .media)
                guard enregistree else { return }
            }
            FeedbackToastManager.shared.showSuccess(ComposerCaptureCopy.savedToPhotos)
        }
    }

    /// Le fichier temporaire part — une fois le brut lu par la galerie.
    func discardTake(_ url: URL, context: String) {
        guard let brut = camera.librarySave else {
            FileManager.default.removeItemLogging(at: url, context: context, logger: .media)
            return
        }
        Task { @MainActor in
            _ = await brut.value
            FileManager.default.removeItemLogging(at: url, context: context, logger: .media)
        }
    }
}
