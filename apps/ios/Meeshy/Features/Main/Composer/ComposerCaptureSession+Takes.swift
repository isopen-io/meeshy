import Combine
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
/// Brut ET rendu partent TOUJOURS ensemble en galerie (décision porteur) : le
/// brut, à la prise, par `CameraModel` ; le rendu — filtre et cadre combinés,
/// sur le canevas 9:16 qu'on voyait — ici. « Enregistré » ne se dit que quand
/// les DEUX ont réussi ; un refus se dit, lui, par `reportPhotoLibraryRefusal`.
extension ComposerCaptureSession {

    /// Les IDENTIFIANTS, jamais les valeurs : deux prises identiques d'affilée
    /// ne changeraient pas `capturedPhoto`. Un enregistrement qui ne rendra aucun
    /// fichier libère son intention.
    func subscribeToTakes() {
        camera.$capturedPhotoId.compactMap { $0 }
            .sink { [weak self] _ in self?.photoArrived() }
            .store(in: &takeSubscriptions)
        camera.$capturedVideoId.compactMap { $0 }
            .sink { [weak self] _ in self?.videoArrived() }
            .store(in: &takeSubscriptions)
        camera.$abandonedRecordingId.compactMap { $0 }
            .sink { [weak self] id in self?.filmIntents[id] = nil }
            .store(in: &takeSubscriptions)
    }

    /// Armer ou fermer le viseur oublie toute intention en attente.
    func resetIntents() {
        photoIntent = .edit
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

    /// La demande pose son intention ; l'obturateur la fige en partant.
    func shootPhoto(intent: ComposerTakeIntent) {
        photographWhenReady()
        photoIntent = intent
    }

    /// L'obturateur PART : l'intention devient celle de CETTE photo.
    func freezePhotoIntent() {
        photoInFlightIntent = photoIntent
        photoIntent = .edit
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

    /// L'intention suit SON enregistrement — `nil` : il n'a pas démarré.
    func bindRecording(_ intent: ComposerTakeIntent, to id: String?) {
        guard let id else { return }
        filmIntents[id] = intent
    }

    func photoArrived() {
        guard stage != .off, let image = camera.capturedPhoto else { return }
        let intent = photoInFlightIntent
        photoInFlightIntent = .edit
        switch intent {
        case .gallery:
            saveRenderedPhoto(image, data: camera.capturedPhotoData)
        case .edit:
            guard !deliversRawPhoto else {
                onDeliver?(.photo(image, data: camera.capturedPhotoData))
                return
            }
            lookedPhoto(image, data: camera.capturedPhotoData) { [weak self] resultat in
                self?.onDeliver?(resultat)
            }
        }
    }

    /// Une vidéo arrivée APRÈS la fermeture ne devient rien : son brut est déjà en
    /// galerie, son fichier temporaire part.
    func videoArrived() {
        guard let url = camera.capturedVideoURL else { return }
        let intent = camera.capturedVideoId.flatMap { filmIntents.removeValue(forKey: $0) } ?? .edit
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
                  let octets = await Self.renderedPhotoBytes(image, data: data, look: regard, person: auteur,
                                                             date: date, scenes: cache),
                  await galerie.saveImage(octets) else { return }
            FeedbackToastManager.shared.showSuccess(ComposerCaptureCopy.savedToPhotos)
        }
    }

    /// Peindre et encoder dans une portée à part : la toile pleine définition est
    /// relâchée avant que Photos ne fasse attendre.
    @concurrent
    nonisolated static func renderedPhotoBytes(_ image: UIImage, data: Data?, look: ComposerPhotoLook,
                                               person: CallFramePerson, date: Date,
                                               scenes: any ComposerLookSceneProviding) async -> Data? {
        guard let debout = ComposerPhotoLookSource.upright(image),
              let rendu = await ComposerLookPainter.renderPhoto(debout, look: look, framing: .identity,
                                                                person: person, date: date, scenes: scenes)
        else { return nil }
        return await ComposerPhotoEncoding.encode(rendu, like: data)
    }

    /// Le RENDU de la vidéo part en galerie, à côté du brut. **Sans effet, UN seul
    /// fichier** (décision #9351) : la vidéo brute est déjà sur le canevas qu'on
    /// voyait, et son rendu lui serait identique au pixel près — l'export rend
    /// alors le brut lui-même, et aucune copie ne part.
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
    private func discardTake(_ url: URL, context: String) {
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
