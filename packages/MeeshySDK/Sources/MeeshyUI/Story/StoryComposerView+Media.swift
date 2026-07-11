import SwiftUI
import UIKit
import os
import PhotosUI
import UniformTypeIdentifiers
import AVFoundation
import MeeshySDK

// MARK: - StoryComposerView + Media

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
                onConfirm: { url, _, _, _ in
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
                onConfirm: { url, _, _, _ in
                    confirmedMediaAudioURL = url
                    mediaAudioEditorItem = nil
                    addVocalToForeground()
                },
                onCancel: { mediaAudioEditorItem = nil }
            )
        }
        .sheet(isPresented: $showVoiceRecorderSheet) {
            NavigationStack {
                StoryVoiceRecorder { recordedURL, language in
                    mediaAudioEditorItem = AudioEditorItemWrapper(url: recordedURL, language: language)
                    showVoiceRecorderSheet = false
                }
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
        .sheet(isPresented: $showStickerPicker) {
            // C8 — le picker existait, complet, sans AUCUN call site. Sheet
            // medium, dismiss gestuel natif ; reste ouverte après un ajout
            // (poser plusieurs stickers d'affilée, fermer par swipe-down).
            StickerPickerView { emoji in
                // C13 — chemin VM unique (currentEffects source de vérité).
                viewModel.addSticker(emoji: emoji)
                HapticFeedback.light()
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $viewModel.isTimelineVisible,
               onDismiss: {
                   // Ordre : couper le transport engine (audio) AVANT de
                   // rendre le canvas à l'édition, puis committer les édits.
                   if viewModel.timelineViewModel.isPlaying {
                       viewModel.timelineViewModel.togglePlayback()
                   }
                   viewModel.canvasTimelineBridge.end()
                   viewModel.commitTimelineToCurrentSlide()
               }) {
            TimelineSheetContent(composer: viewModel)
                .presentationDetents([.fraction(0.45), .large])
                .presentationDragIndicator(.visible)
                .modifier(StoryTimelinePresentationStyle())
        }
        .adaptiveOnChange(of: viewModel.isTimelineVisible) { _, isVisible in
            if isVisible {
                viewModel.loadCurrentSlideIntoTimeline()
                // Preview vivante : le canvas derrière la sheet rend la slide
                // au playhead timeline dès l'ouverture (sémantique .play).
                viewModel.canvasTimelineBridge.scrub(
                    seconds: Double(viewModel.timelineViewModel.currentTime))
            }
        }
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
                        // Bump version : même rationale que le bloc image
                        // editor — la vignette vidéo est une mutation
                        // intra-clé non détectable par SwiftUI.
                        viewModel.loadedImagesVersion &+= 1
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
                    await MainActor.run {
                        viewModel.loadedVideoURLs[objectId] = tempURL
                        if let thumbnail { viewModel.loadedImages[objectId] = thumbnail }
                        if let obj = viewModel.addMediaObject(kind: .video, toSlideId: targetSlideId) {
                            viewModel.loadedVideoURLs[obj.id] = tempURL
                            if let thumbnail { viewModel.loadedImages[obj.id] = thumbnail }
                            // Set mediaURL so StoryMediaLayer.configureVideo can find
                            // the file. Same bridge as the image path — without this,
                            // media.mediaURL is nil and the video layer has no source.
                            viewModel.setMediaURL(id: obj.id, url: tempURL.absoluteString, slideId: targetSlideId)
                            if let ratio = videoAspectRatio {
                                viewModel.setMediaAspectRatio(id: obj.id, aspectRatio: ratio, slideId: targetSlideId)
                            }
                            if obj.id != objectId {
                                viewModel.loadedVideoURLs.removeValue(forKey: objectId)
                                viewModel.loadedImages.removeValue(forKey: objectId)
                            }
                            if let dur = mediaDuration {
                                // Pin the natural asset duration on the media object so
                                // the reader's visibility window matches the actual
                                // playback length. Without this, `obj.duration` stayed
                                // nil and got overwritten later by timeline-editor
                                // defaults that could be as short as 1s — surfacing as
                                // "video appears 1 second then disappears" while the
                                // audio kept playing.
                                viewModel.setMediaDuration(id: obj.id, duration: dur, slideId: targetSlideId)
                                viewModel.autoExtendDuration(forElementEnd: dur, slideId: targetSlideId)
                            }
                        }
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
                await MainActor.run {
                    if let obj = viewModel.addMediaObject(kind: .image, toSlideId: targetSlideId) {
                        viewModel.loadedImages[obj.id] = image
                        // Set mediaURL on the StoryMediaObject so the canvas renderer
                        // can load the image from disk. This is the critical bridge
                        // between the in-memory UIImage and the CALayer pipeline.
                        if let fileURL = imageFileURL {
                            viewModel.setMediaURL(id: obj.id, url: fileURL.absoluteString, slideId: targetSlideId)
                        }
                        // AspectRatio natural depuis l'UIImage.size — sans
                        // ça la layer rend l'image en carré 540×540 (fix B1).
                        let imgSize = image.size
                        if imgSize.width > 0, imgSize.height > 0 {
                            let ratio = Double(imgSize.width / imgSize.height)
                            viewModel.setMediaAspectRatio(id: obj.id, aspectRatio: ratio, slideId: targetSlideId)
                        }
                    }
                }
            }
            await MainActor.run {
                fgMediaItem = nil
            }
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
                    // Update waveform samples
                    var effects = viewModel.currentEffects
                    if let idx = effects.audioPlayerObjects?.firstIndex(where: { $0.id == obj.id }) {
                        effects.audioPlayerObjects?[idx].waveformSamples = samples
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

    func addRecordingToBackground(url: URL) {
        Task {
            let samples: [Float]
            do {
                samples = try await WaveformCache.shared.samples(from: url)
            } catch {
                samples = []  // waveform cosmétique : barres plates si l'analyse échoue
            }
            await MainActor.run {
                if let obj = viewModel.addAudioObject() {
                    viewModel.loadedAudioURLs[obj.id] = url
                    var effects = viewModel.currentEffects
                    if let idx = effects.audioPlayerObjects?.firstIndex(where: { $0.id == obj.id }) {
                        effects.audioPlayerObjects?[idx].waveformSamples = samples
                        viewModel.currentEffects = effects
                    }
                }
            }
        }
    }
}
