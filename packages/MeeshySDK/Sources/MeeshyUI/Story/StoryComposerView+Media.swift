import SwiftUI
import UIKit
import os
import PhotosUI
import UniformTypeIdentifiers
import AVFoundation
import MeeshySDK

// MARK: - StoryComposerView + Media

/// Sources d'audio alternatives proposées DANS la feuille d'enregistrement
/// (directive user 2026-08-02) : le panneau Son ouvre cette feuille
/// directement sur une slide vierge (`ComposerToolPanelHost.audioPanel`),
/// donc l'import Fichiers et la bibliothèque de sons doivent rester
/// joignables depuis elle.
nonisolated enum StoryRecorderFollowUp: Equatable {
    case audioFiles
    case soundLibrary
}

extension StoryComposerView {
    // Sheets and full-screen covers are extracted here to keep `body` small
    // enough for the SwiftUI type-checker to handle within its time budget.
    var sheetModifiers: some View {
        mainContent
        .fileImporter(isPresented: $showAudioDocumentPicker, allowedContentTypes: [.audio], allowsMultipleSelection: false) { result in
            if case .success(let urls) = result, let url = urls.first {
                mediaAudioEditorItem = AudioEditorItemWrapper(url: url)
            }
        }
        .fullScreenCover(item: $audioEditorItem) { item in
            MeeshyAudioEditorView(
                url: item.url,
                onConfirm: { url, transcriptions, _, _ in
                    viewModel.attachVoiceTranscriptions(transcriptions)
                    addRecordingToBackground(url: url)
                    audioEditorItem = nil
                },
                onCancel: { audioEditorItem = nil }
            )
        }
        .fullScreenCover(item: $mediaAudioEditorItem) { item in
            MeeshyAudioEditorView(
                url: item.url,
                preferredLanguage: item.language ?? "fr",
                onConfirm: { url, transcriptions, _, _ in
                    viewModel.attachVoiceTranscriptions(transcriptions)
                    confirmedMediaAudioURL = url
                    mediaAudioEditorItem = nil
                    addVocalToForeground()
                },
                onCancel: { mediaAudioEditorItem = nil }
            )
        }
        .sheet(isPresented: $showVoiceRecorderSheet, onDismiss: {
            // Séquencement sheet → sheet : la porte demandée par une chip ne
            // s'ouvre qu'APRÈS le démontage de la feuille recorder — levée
            // pendant qu'elle est encore présentée, la présentation se perd.
            let doors = Self.recorderFollowUpDoors(recorderFollowUp)
            recorderFollowUp = nil
            if doors.audioFiles { showAudioDocumentPicker = true }
            if doors.soundLibrary { showSoundLibrary = true }
        }) {
            NavigationStack {
                AudioRecorderSheet(
                    onImportAudioFile: {
                        recorderFollowUp = .audioFiles
                        showVoiceRecorderSheet = false
                    },
                    onOpenSoundLibrary: {
                        recorderFollowUp = .soundLibrary
                        showVoiceRecorderSheet = false
                    },
                    onRecordComplete: { recordedURL, language in
                        mediaAudioEditorItem = AudioEditorItemWrapper(url: recordedURL, language: language)
                        showVoiceRecorderSheet = false
                    }
                )
                .navigationTitle(String(localized: "story.composer.recordVocal", defaultValue: "Enregistrer un vocal", bundle: .module))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button(String(localized: "story.composer.cancel", defaultValue: "Annuler", bundle: .module)) { showVoiceRecorderSheet = false }
                    }
                }
            }
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $showSoundLibrary) {
            SoundLibraryPicker(
                onPick: { sound in
                    viewModel.addBorrowedSound(sound)
                    showSoundLibrary = false
                },
                onCancel: { showSoundLibrary = false }
            )
        }
        .sheet(isPresented: $showStickerPicker) {
            // C8 — le picker existait, complet, sans AUCUN call site. Sheet
            // medium, dismiss gestuel natif ; reste ouverte après un ajout
            // (poser plusieurs stickers d'affilée, fermer par swipe-down).
            StickerPickerView(onStickerSelected: { emoji in
                // C13 — chemin VM unique (currentEffects source de vérité).
                viewModel.addSticker(emoji: emoji)
                HapticFeedback.light()
            }, onLibraryStickerSelected: { item in
                // S2 — le bitmap suffit à la pose : il vit en local sous l'id
                // de l'élément jusqu'à ce que la publication le téléverse et
                // remplisse `postMediaId`.
                viewModel.addSticker(image: item.thumbnail,
                                     provider: StoryStickerLibraryItem.provider)
                HapticFeedback.light()
            }, onTemplateSelected: { gabarit, emplacements in
                // L'échelle vient du GABARIT — `addSticker(template:slots:)` la
                // lit lui-même. `StorySticker.posedScale` agrandit un glyphe NU
                // et ferait déborder un cartouche qui mesure son contenu.
                viewModel.addSticker(template: gabarit, slots: emplacements)
                HapticFeedback.light()
            }, onLocationTemplateSelected: { lieu, gabarit in
                // Un lieu décoré reste un `StoryLocationObject` : lui seul porte
                // les coordonnées que la plateforme LIT. Le gabarit n'en décore
                // que l'apparence.
                viewModel.addLocation(place: lieu, styleId: gabarit.id)
                HapticFeedback.light()
            })
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showLocationPicker) {
            // T20 — la pastille de lieu se pose depuis le composer. Le picker
            // vient de l'app (MapKit + CoreLocation + permissions) via
            // `\.storyLocationPicker` ; le SDK ne fait que le présenter et
            // poser la pastille sur la slide courante.
            if let provider = storyLocationPicker {
                provider.makeView { place in
                    viewModel.addLocation(place: place)
                    HapticFeedback.light()
                    showLocationPicker = false
                }
            }
        }
        .sheet(isPresented: $showMentionPicker) {
            // Nommer quelqu'un sans l'écrire dans une phrase (directive user
            // 2026-08-18). Contrairement au lieu, rien n'est injecté : le picker
            // vit au SDK, à côté de celui d'audience, dont il partage les deux
            // coutures de recherche.
            //
            // Une story a un canevas : les QUATRE modes y ont un sens, badge
            // compris. La feuille pilote l'ensemble et rend l'ensemble mis à
            // jour ; le composer, lui, décide de ce qui se pose sur la slide.
            StoryMentionPickerSheet(references: viewModel.references) { updated in
                viewModel.applyReferences(updated)
            }
        }
        // S5 — l'amorce « Caméra » de la page blanche. Même doctrine que le
        // picker de lieu : AVCaptureSession, permissions et écran de refus sont
        // app-side ; le SDK présente et pose le média rendu.
        //
        // `item:` et non `isPresented:` — cf. `PresentedCameraCapture` : sans
        // fournisseur injecté, il n'y a rien à présenter, et surtout pas un
        // plein écran sans sortie.
        .fullScreenCover(item: Binding(
            get: { Self.presentedCameraCapture(
                isRequested: showCameraCapture, provider: storyCameraCapture) },
            set: { if $0 == nil { showCameraCapture = false } }
        )) { presented in
            presented.provider.makeView { capture in
                showCameraCapture = false
                addCapturedMedia(capture)
            }
            .ignoresSafeArea()
        }
        // S5 — repli de l'amorce « Galerie » quand l'accès en lecture est
        // refusé : le picker système ne consomme AUCUNE permission, donc un
        // refus ne ferme aucune porte. Présenté par code (et non par un
        // `PhotosPicker` inline) parce que la décision n'est connue qu'APRÈS
        // la réponse de l'utilisateur à l'alerte d'autorisation.
        .photosPicker(isPresented: $showGalleryPicker,
                      selection: $fgMediaItem,
                      matching: .any(of: [.images, .videos]))
        .sheet(isPresented: $showTransitionSheet) {
            NavigationStack {
                transitionPicker
                    .navigationTitle(String(localized: "story.composer.transitions", defaultValue: "Transitions", bundle: .module))
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button(String(localized: "story.composer.done", defaultValue: "OK", bundle: .module)) { showTransitionSheet = false }
                        }
                    }
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .fullScreenCover(item: Binding(
            get: { editingBgImage.map { PendingImageWrapper(image: $0) } },
            set: { if $0 == nil { editingBgImage = nil } }
        )) { wrapper in
            MeeshyImageEditorView(
                image: wrapper.image,
                context: .story,
                onAccept: { edited in
                    selectedImage = edited
                    viewModel.hasBackgroundImage = true
                    viewModel.setImage(edited, for: viewModel.currentSlide.id)
                    editingBgImage = nil
                },
                onCancel: { editingBgImage = nil }
            )
        }
        .fullScreenCover(item: $editingElementImage) { item in
            MeeshyImageEditorView(
                image: item.image,
                context: .story,
                onAccept: { edited in
                    viewModel.loadedImages[item.elementId] = edited
                    // Un recadrage change le ratio de l'image : sans réécrire
                    // `mediaAspectRatios`, la layer ré-affichait le NOUVEAU bitmap
                    // mais étiré au ratio d'ORIGINE → la modification (crop)
                    // n'apparaissait pas géométriquement dans le canvas (#1).
                    let editedSize = edited.size
                    if editedSize.width > 0, editedSize.height > 0 {
                        viewModel.setMediaAspectRatio(
                            id: item.elementId,
                            aspectRatio: Double(editedSize.width / editedSize.height),
                            slideId: viewModel.currentSlide.id
                        )
                    }
                    // Bump version pour signaler au `StoryComposerCanvasView`
                    // qu'un bitmap intra-clé a muté. SwiftUI ne peut pas
                    // détecter ce genre de mutation sur un `[String: UIImage]`
                    // (UIImage non Equatable). Sans ce bump, le main canvas
                    // ne re-stampait jamais l'image éditée et restait stale
                    // (bug 2026-05-27). Cf. `StoryComposerCanvasView.Coordinator`.
                    viewModel.loadedImagesVersion &+= 1
                    editingElementImage = nil
                },
                onCancel: { editingElementImage = nil }
            )
        }
        .fullScreenCover(item: $editingElementVideo) { item in
            MeeshyVideoEditorView(
                url: item.url,
                context: .story,
                onComplete: { result in
                    // 1. **Écrase le fichier cache** par la version éditée.
                    //    Le caller a stocké `item.url` (path original cached
                    //    dans le composer tmp) → on remplace son contenu par
                    //    `result.url` (output du `VideoExportPipeline`).
                    //    Bénéfices :
                    //    - L'URL reste **identique** : AVPlayer items, thumb
                    //      caches keyés par URL n'invalident pas → 0 reload.
                    //    - Pas d'orphelin temp : `result.url` est consommé.
                    //    Fallback : si le move échoue (cross-volume, perm),
                    //    on garde simplement `result.url` (le comportement
                    //    pré-fix).
                    let destinationURL = item.url
                    let cachedURL: URL
                    if result.url != destinationURL {
                        do {
                            try? FileManager.default.removeItem(at: destinationURL)
                            try FileManager.default.moveItem(at: result.url, to: destinationURL)
                            cachedURL = destinationURL
                        } catch {
                            // Move impossible → on conserve result.url tel
                            // quel. Le map pointera dessus, le contenu sera
                            // valide. L'ancien item.url reste sur disque
                            // jusqu'à l'éviction tmp système.
                            cachedURL = result.url
                        }
                    } else {
                        cachedURL = destinationURL
                    }
                    viewModel.loadedVideoURLs[item.elementId] = cachedURL

                    // 2. Refresh la vignette pour qu'elle reflète la frame
                    //    courante du clip édité (utilisée par le composer
                    //    tray, l'export et le placeholder).
                    let thumbnail = Self.generateVideoThumbnail(url: cachedURL)
                    if let thumbnail {
                        viewModel.loadedImages[item.elementId] = thumbnail
                        // Un recadrage vidéo change le ratio : on le réécrit
                        // depuis la frame éditée (sinon la vidéo s'affiche au
                        // ratio d'origine après crop). Même rationale que le
                        // bloc image editor (#1).
                        let thumbSize = thumbnail.size
                        if thumbSize.width > 0, thumbSize.height > 0 {
                            viewModel.setMediaAspectRatio(
                                id: item.elementId,
                                aspectRatio: Double(thumbSize.width / thumbSize.height),
                                slideId: viewModel.currentSlide.id
                            )
                        }
                    }

                    // 3. Si l'utilisateur a transcrit la piste audio, on
                    //    propage les sous-titres comme **metadata** de la
                    //    vidéo cached (cf. spec : « sauvegardé comme une
                    //    metadata de la vidéo lors de la validation pour
                    //    remplacer la vidéo originellement chargé »).
                    //    Le renderer story peut les overlay au rendu sans
                    //    avoir besoin de re-transcrire.
                    if !result.captions.isEmpty || result.transcriptionText != nil {
                        viewModel.loadedVideoCaptions[item.elementId] = StoryVideoCaptionMetadata(
                            captions: result.captions,
                            transcriptionText: result.transcriptionText,
                            languageCode: result.captionLanguageCode
                        )
                    } else {
                        // L'utilisateur a effacé / pas transcrit — purge la
                        // metadata pour ne pas réutiliser celle d'un
                        // précédent edit du même element.
                        viewModel.loadedVideoCaptions.removeValue(forKey: item.elementId)
                    }

                    // Bump version INCONDITIONNEL : toute édition vidéo (URL du
                    // clip, filtre, sous-titres/transcription, ratio) doit se
                    // refléter sur le canvas même quand aucune nouvelle vignette
                    // n'est générée. L'ancien bump était gaté sur `if let thumbnail`
                    // → une transcription/filtre seul restait invisible jusqu'au
                    // prochain rebuild. `loadedVideoURLs`/`loadedVideoCaptions`/
                    // `mediaAspectRatios` vivent HORS du JSON du slide, donc SwiftUI
                    // ne peut pas détecter leur mutation sans ce cookie.
                    viewModel.loadedImagesVersion &+= 1

                    editingElementVideo = nil
                },
                onCancel: { editingElementVideo = nil }
            )
        }
    }

    func handleForegroundMediaSelection(from item: PhotosPickerItem?) {
        guard let item else { return }
        let isVideo = item.supportedContentTypes.contains { $0.conforms(to: .movie) || $0.conforms(to: .video) }
        addForegroundMedia(from: item, kind: isVideo ? .video : .image)
    }

    func addForegroundMedia(from item: PhotosPickerItem?, kind: StoryMediaKind) {
        guard let item else { return }
        // Capture the slide ID at the START of the picker flow. PhotosPicker's
        // `loadTransferable` is async (1-3s for a video) and the user can switch
        // slides mid-load — without this pin, the media gets appended to whichever
        // slide happens to be active when the awaits resolve, which is a silent
        // data-loss race (audit F2).
        let targetSlideId = viewModel.currentSlide.id
        isLoadingMedia = true
        mediaLoadProgress = 0
        mediaLoadLabel = kind == .video
            ? String(localized: "story.composer.loadingVideo", defaultValue: "Chargement de la video...", bundle: .module)
            : String(localized: "story.composer.loadingImage", defaultValue: "Chargement de l'image...", bundle: .module)
        Task {
            defer {
                isLoadingMedia = false
                mediaLoadProgress = 0
                mediaLoadLabel = ""
            }
            let objectId = UUID().uuidString
            if kind == .video {
                guard let data = try? await item.loadTransferable(type: Data.self) else {
                    mediaLoadFailed = true  // C16 — l'échec parle
                    return
                }
                mediaLoadProgress = 0.3
                let ext = item.supportedContentTypes
                    .first { $0.conforms(to: .audiovisualContent) }?
                    .preferredFilenameExtension ?? "mp4"
                let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(objectId + "." + ext)
                do {
                    try data.write(to: tempURL)
                    mediaLoadProgress = 0.5
                    // Async thumbnail extraction via StoryMediaLoader (cached, off main thread)
                    let thumbnail = await StoryMediaLoader.shared.videoThumbnail(url: tempURL, maxDimension: 400)
                    mediaLoadProgress = 0.7
                    let asset = AVURLAsset(url: tempURL)
                    var mediaDuration: Float?
                    if let cmDur = try? await asset.load(.duration) {
                        let secs = CMTimeGetSeconds(cmDur)
                        if secs > 0, secs.isFinite { mediaDuration = Float(secs) }
                    }
                    // Mesure de l'aspectRatio natural de la vidéo via le
                    // track vidéo (naturalSize × preferredTransform). Sans
                    // ça, la layer rend la vidéo en carré 540×540 (cf. fix
                    // B1 review Opus 2026-05-20).
                    var videoAspectRatio: Double?
                    if let track = try? await asset.loadTracks(withMediaType: .video).first,
                       let natural = try? await track.load(.naturalSize),
                       let transform = try? await track.load(.preferredTransform) {
                        let effective = natural.applying(transform)
                        let w = abs(effective.width)
                        let h = abs(effective.height)
                        if w > 0, h > 0 { videoAspectRatio = Double(w / h) }
                    }
                    mediaLoadProgress = 1.0
                    await MainActor.run { () -> Void in
                        // `id: objectId` : aligne `obj.id` sur le fichier `{objectId}.<ext>`
                        // (même raison que le chemin image — cf. addMediaObject(id:)).
                        // Toute la pose (vignette, mediaURL, ratio, durée native +
                        // extension de slide) vit désormais dans le ViewModel : le
                        // chemin caméra emprunte le MÊME code, pas un jumeau.
                        viewModel.insertForegroundVideo(
                            url: tempURL,
                            thumbnail: thumbnail,
                            aspectRatio: videoAspectRatio,
                            duration: mediaDuration,
                            intoSlideId: targetSlideId,
                            objectId: objectId
                        )
                    }
                } catch {
                    Logger.media.error("[StoryComposer] Video write error: \(error.localizedDescription)")
                    mediaLoadFailed = true  // C16 — l'échec parle
                }
            } else {
                // ImageIO downsample for foreground images (max 1080px)
                mediaLoadProgress = 0.3
                guard let data = try? await item.loadTransferable(type: Data.self),
                      let image = await StoryMediaLoader.shared.loadImage(data: data, maxDimension: 1080) else {
                    mediaLoadFailed = true  // C16 — l'échec parle
                    return
                }
                mediaLoadProgress = 0.7
                // Persist the image to a temp file so StoryMediaLayer.configureImage
                // can load it via its file:// URL. Without this, media.mediaURL stays
                // nil and the CALayer canvas renders a black rectangle.
                let tempImageURL = FileManager.default.temporaryDirectory
                    .appendingPathComponent(objectId + ".jpg")
                let jpegData = image.jpegData(compressionQuality: 0.92)
                try? jpegData?.write(to: tempImageURL)
                let imageFileURL = jpegData != nil ? tempImageURL : nil
                mediaLoadProgress = 1.0
                await MainActor.run { () -> Void in
                    // `id: objectId` aligne `obj.id` sur le nom du fichier temp
                    // `{objectId}.jpg` → le `composerKey` du StoryBackgroundLayer
                    // (dérivé du fichier) retrouve le bitmap sous `loadedImages[obj.id]`.
                    viewModel.insertForegroundImage(
                        image,
                        fileURL: imageFileURL,
                        intoSlideId: targetSlideId,
                        objectId: objectId
                    )
                }
            }
            await MainActor.run {
                fgMediaItem = nil
            }
        }
    }

    /// Ce que le cover caméra présente : le fournisseur injecté, et rien sinon.
    ///
    /// Pure et testable sans UI. Deux conditions, jamais une seule — le drapeau
    /// reste la demande d'ouverture, l'injection la capacité d'y répondre. La
    /// combinaison « demandé sans fournisseur » est aujourd'hui inatteignable
    /// (la capsule est gatée `storyCameraCapture != nil`), mais c'était une
    /// garantie de call site ; elle devient une garantie de type.
    nonisolated static func presentedCameraCapture(
        isRequested: Bool,
        provider: StoryCameraCaptureProvider?
    ) -> PresentedCameraCapture? {
        guard isRequested, let provider else { return nil }
        return PresentedCameraCapture(provider: provider)
    }

    /// Quelle porte ouvrir après la fermeture de la feuille d'enregistrement.
    ///
    /// Pure et testable — une seule porte par follow-up, aucune sur un dismiss
    /// ordinaire (annulation, vocal terminé) : deux sheets levées ensemble sur
    /// le même hôte se voleraient la présentation.
    nonisolated static func recorderFollowUpDoors(
        _ followUp: StoryRecorderFollowUp?
    ) -> (audioFiles: Bool, soundLibrary: Bool) {
        (followUp == .audioFiles, followUp == .soundLibrary)
    }

    /// S5 — pose un média venu de la CAMÉRA ou de la dernière photo de la
    /// pellicule. Même épinglage de slide que le chemin picker (audit F2 : la
    /// résolution est asynchrone, l'utilisateur peut changer de slide entre
    /// temps), même downsample 1080, même insertion ViewModel.
    ///
    /// UN SEUL encodage JPEG : la caméra livre un `UIImage` déjà décodé, donc
    /// on downsample l'image telle quelle et on n'écrit qu'un fichier — le
    /// chemin picker, lui, part d'une `Data` brute et n'encode aussi qu'une
    /// fois. Encoder → décoder → redimensionner → ré-encoder coûterait deux
    /// générations de perte pour rien.
    func addCapturedMedia(_ capture: StoryCameraCapture) {
        let targetSlideId = viewModel.currentSlide.id
        let objectId = UUID().uuidString
        isLoadingMedia = true
        mediaLoadProgress = 0
        Task {
            defer {
                isLoadingMedia = false
                mediaLoadProgress = 0
                mediaLoadLabel = ""
            }
            switch capture {
            case .photo(let image):
                mediaLoadLabel = String(localized: "story.composer.loadingImage",
                                        defaultValue: "Chargement de l'image...", bundle: .module)
                mediaLoadProgress = 0.4
                // Redimensionnement ET encodage hors MainActor, en un seul
                // aller : sur une photo 12 Mpx, les faire ici gèlerait l'UI au
                // retour de la caméra.
                let tempURL = FileManager.default.temporaryDirectory
                    .appendingPathComponent(objectId + ".jpg")
                guard let encoded = await StoryMediaLoader.shared.downsampledJPEG(
                        image: image, maxDimension: 1080, compressionQuality: 0.92),
                      (try? encoded.data.write(to: tempURL)) != nil else {
                    mediaLoadFailed = true  // C16 — l'échec parle
                    return
                }
                mediaLoadProgress = 1.0
                viewModel.insertForegroundImage(
                    encoded.image, fileURL: tempURL,
                    intoSlideId: targetSlideId, objectId: objectId)

            case .video(let sourceURL):
                mediaLoadLabel = String(localized: "story.composer.loadingVideo",
                                        defaultValue: "Chargement de la video...", bundle: .module)
                mediaLoadProgress = 0.3
                let ext = sourceURL.pathExtension.isEmpty ? "mov" : sourceURL.pathExtension
                let tempURL = FileManager.default.temporaryDirectory
                    .appendingPathComponent(objectId + "." + ext)
                // La convention « `obj.id` == nom du fichier » est STRUCTURANTE
                // (elle relie le bitmap au `composerKey` dérivé du fichier) :
                // on copie donc, on ne référence pas la source telle quelle.
                do {
                    try? FileManager.default.removeItem(at: tempURL)
                    try FileManager.default.copyItem(at: sourceURL, to: tempURL)
                } catch {
                    Logger.media.error("[StoryComposer] Capture copy error: \(error.localizedDescription)")
                    mediaLoadFailed = true  // C16 — l'échec parle
                    return
                }
                // La source ne nous appartient PAS : on ne la supprime pas.
                // `CameraView` lance `PhotoLibraryManager.saveVideo(at:)` sur ce
                // même fichier EN PARALLÈLE de la remise au composer, et ce save
                // peut s'interrompre sur l'alerte « Ajouter aux photos » — il ne
                // lit le fichier qu'APRÈS la réponse de l'utilisateur. La copie
                // ci-dessus est rapide, l'alerte ne l'est pas : la course était
                // gagnée par le composer, la vidéo arrivait dans la story mais
                // jamais dans Photos, sans un mot. C'est le cycle de vie du
                // répertoire temporaire qui reprend la place (comportement
                // documenté par l'`onDisappear` du canvas : les fichiers de
                // capture survivent tant qu'un upload peut en avoir besoin).
                mediaLoadProgress = 0.6
                let thumbnail = await StoryMediaLoader.shared.videoThumbnail(url: tempURL, maxDimension: 400)
                let asset = AVURLAsset(url: tempURL)
                var mediaDuration: Float?
                if let cmDur = try? await asset.load(.duration) {
                    let secs = CMTimeGetSeconds(cmDur)
                    if secs > 0, secs.isFinite { mediaDuration = Float(secs) }
                }
                var videoAspectRatio: Double?
                if let track = try? await asset.loadTracks(withMediaType: .video).first,
                   let natural = try? await track.load(.naturalSize),
                   let transform = try? await track.load(.preferredTransform) {
                    let effective = natural.applying(transform)
                    let w = abs(effective.width)
                    let h = abs(effective.height)
                    if w > 0, h > 0 { videoAspectRatio = Double(w / h) }
                }
                mediaLoadProgress = 1.0
                viewModel.insertForegroundVideo(
                    url: tempURL, thumbnail: thumbnail,
                    aspectRatio: videoAspectRatio, duration: mediaDuration,
                    intoSlideId: targetSlideId, objectId: objectId)
            }
            HapticFeedback.light()
        }
    }

    /// S5 — résout la vignette de la dernière photo de la pellicule. Une seule
    /// fois, à l'ouverture : elle n'a d'usage que sur une page blanche, et
    /// l'observer en continu réveillerait PhotoKit à chaque frappe.
    func loadRecentCameraRollAsset() {
        guard let provider = storyRecentCameraRollAsset, recentCameraRollAsset == nil else { return }
        Task { recentCameraRollAsset = await provider.latest() }
    }

    /// S5 — tap sur la capsule « Galerie ». C'est le geste EXPLICITE qui
    /// autorise la demande d'accès en lecture : le composer n'a rien demandé à
    /// son ouverture (`latest()` rend `nil` en silence tant que l'accès n'est
    /// pas accordé), et une alerte système non provoquée est le meilleur moyen
    /// d'obtenir un refus définitif. L'issue est arbitrée par la règle pure
    /// `galleryAccessOutcome` — accordé : la dernière photo entre directement,
    /// le geste reste unique ; refusé : le `PhotosPicker` système prend le
    /// relais, aucune impasse.
    func requestRecentCameraRollAccess() {
        guard let provider = storyRecentCameraRollAsset else { return }
        Task {
            switch Self.galleryAccessOutcome(resolved: await provider.requestAccess()) {
            case .insertRecentAsset(let asset):
                recentCameraRollAsset = asset
                addRecentCameraRollAsset(asset)
            case .presentSystemPicker:
                showGalleryPicker = true
            }
        }
    }

    /// S5 — insère la dernière photo de la pellicule en UN geste (ancre A4 de la
    /// grille : « dernière photo accessible en 1 geste »). L'app résout le
    /// bitmap plein format derrière son identifiant opaque ; le SDK ne connaît
    /// pas PhotoKit.
    func addRecentCameraRollAsset(_ asset: StoryRecentCameraRollAsset) {
        guard let provider = storyRecentCameraRollAsset else { return }
        // La résolution plein format autorise le rapatriement iCloud : elle peut
        // durer plusieurs secondes. Sans indicateur, la partie la plus LENTE du
        // geste vendu comme « 1 geste » se déroulait sans le moindre retour
        // visuel — au mieux l'utilisateur re-tape, au pire il croit l'amorce
        // morte. Mêmes drapeaux que le chemin picker, posés AVANT le premier await.
        isLoadingMedia = true
        mediaLoadProgress = 0
        mediaLoadLabel = String(localized: "story.composer.loadingImage",
                                defaultValue: "Chargement de l'image...", bundle: .module)
        Task {
            guard let full = await provider.fullImage(for: asset.identifier) else {
                isLoadingMedia = false
                mediaLoadProgress = 0
                mediaLoadLabel = ""
                mediaLoadFailed = true  // C16 — l'échec parle
                return
            }
            // Passage de relais : `addCapturedMedia` relève les mêmes drapeaux
            // et les abaisse dans son propre `defer`. Les remettre à plat ici
            // ferait clignoter l'indicateur entre les deux phases.
            addCapturedMedia(.photo(full))
        }
    }

    func addVocalToForeground() {
        guard let url = confirmedMediaAudioURL else { return }
        Task {
            let samples: [Float]
            do {
                samples = try await WaveformCache.shared.samples(from: url)
            } catch {
                samples = []  // waveform cosmétique : barres plates si l'analyse échoue
            }
            let asset = AVURLAsset(url: url)
            var mediaDuration: Float?
            if let cmDur = try? await asset.load(.duration) {
                let secs = CMTimeGetSeconds(cmDur)
                if secs > 0, secs.isFinite { mediaDuration = Float(secs) }
            }
            await MainActor.run {
                if let obj = viewModel.addAudioObject() {
                    viewModel.loadedAudioURLs[obj.id] = url
                    // Waveform + durée native de l'audio dans le MÊME slice : sans
                    // `duration`, la donnée audio n'était pas comptée par
                    // `contentDerivedDuration()` (la timeline ignorait la voix).
                    var effects = viewModel.currentEffects
                    if let idx = effects.audioPlayerObjects?.firstIndex(where: { $0.id == obj.id }) {
                        effects.audioPlayerObjects?[idx].waveformSamples = samples
                        if let dur = mediaDuration {
                            effects.audioPlayerObjects?[idx].duration = dur
                        }
                        viewModel.currentEffects = effects
                    }
                    if let dur = mediaDuration {
                        viewModel.autoExtendDuration(forElementEnd: dur)
                    }
                }
                confirmedMediaAudioURL = nil
            }
        }
    }

    func openMediaEditor(elementId: String) {
        let mediaObj = viewModel.currentEffects.mediaObjects?.first(where: { $0.id == elementId })
        guard let mediaObj else { return }

        if mediaObj.kind == .video, let url = viewModel.loadedVideoURLs[elementId] {
            editingElementVideo = EditingMediaVideo(elementId: elementId, url: url)
        } else if let image = viewModel.loadedImages[elementId] {
            editingElementImage = EditingMediaImage(elementId: elementId, image: image)
        }
    }

    /// **Le corps a migré sur le MODÈLE** (#4092,
    /// `StoryComposerViewModel.attachPastedAudio`) : ses quatre gestes sont des
    /// mutations, et sa place dans cette vue était le seul obstacle à coller un
    /// son depuis le composer unifié.
    ///
    /// Ce nom reste — c'est celui que ses appelants connaissent, et le renommer
    /// aurait mêlé un déplacement à une réécriture.
    func addRecordingToBackground(url: URL) {
        viewModel.attachPastedAudio(url: url)
    }
}
