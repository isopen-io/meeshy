import UIKit
import MeeshySDK

extension StoryMediaLayer {

    @MainActor
    func configureImage(_ media: StoryMediaObject,
                        resolver: (@Sendable (String) -> URL?)?,
                        imageCache: ImageCacheReader?,
                        decodeTiming: StoryImageDecodeTiming) {
        currentLoadTask?.cancel()
        currentLoadTask = nil

        contentsGravity = .resizeAspectFill
        masksToBounds = true

        let resolvedURL = StoryMediaLayerRules.resolvedMediaURL(for: media, resolver: resolver)
        let cacheKey = media.postMediaId.isEmpty ? media.id : media.postMediaId

        if applyComposerCachedImage(media, cacheKey: cacheKey, imageCache: imageCache,
                                    decodeTiming: decodeTiming) { return }
        liveLookStorage?.supersede()
        lookSource = nil

        if let url = resolvedURL, url.isFileURL {
            loadFileImage(media, url: url, decodeTiming: decodeTiming)
            return
        }
        scheduleCachedOrRemoteImageLoad(media, cacheKey: cacheKey, resolvedURL: resolvedURL, imageCache: imageCache)
    }

    /// L'image du composer, look cuit. **Repeinte en place** — la couche
    /// montre déjà le look de CETTE image, le canvas décode hors du fil
    /// principal et ce look n'est pas encore cuit —, la cuisson quitte le
    /// MainActor (#9873) : le bitmap affiché reste jusqu'au suivant, et un
    /// curseur de réglage de l'objet ne cuit plus rien dans l'image où le doigt
    /// bouge. La première pose, comme une image REMPLACÉE (recadrage, retouche),
    /// reste synchrone : la couche ne montre jamais un trou, ni l'ancienne image.
    @MainActor
    private func applyComposerCachedImage(_ media: StoryMediaObject,
                                          cacheKey: String,
                                          imageCache: ImageCacheReader?,
                                          decodeTiming: StoryImageDecodeTiming) -> Bool {
        guard let reader = imageCache as? ComposerImageCacheReader,
              let image = reader.images[cacheKey] else { return false }
        let request = StoryMediaLayerRules.lookRequest(image, for: media)
        if decodeTiming == .offMainActor, lookSource === image, contents != nil,
           StoryLookBake.ready(request) == nil {
            repaintLookOffMainThread(request, mediaId: media.id)
            return true
        }
        liveLookStorage?.supersede()
        guard let cached = CanvasImageOrientation.displayCGImage(Self.filtered(image, for: media)) else {
            return false
        }
        contents = cached
        lookSource = image
        return true
    }

    @MainActor
    private func repaintLookOffMainThread(_ request: StoryLookBakeRequest, mediaId: String) {
        let outil = liveLookStorage ?? StoryLiveLook()
        liveLookStorage = outil
        outil.bake(request) { [weak self] cuit in
            guard let self, self.media?.id == mediaId, self.lookSource === request.image,
                  let cg = CanvasImageOrientation.displayCGImage(cuit) else { return }
            StoryBackgroundLayer.withDisabledCAActions { self.contents = cg }
        }
    }

    @MainActor
    private func loadFileImage(_ media: StoryMediaObject, url: URL, decodeTiming: StoryImageDecodeTiming) {
        switch decodeTiming {
        case .immediate:
            loadFileImageImmediately(media, url: url)
        case .offMainActor:
            scheduleFileImageDecode(media, url: url)
        }
    }

    @MainActor
    private func loadFileImageImmediately(_ media: StoryMediaObject, url: URL) {
        guard let cgImage = CanvasImageOrientation.displayCGImage(
            Self.filtered(StoryLayerImageDecoding.decodedImageNow(fileAt: url), for: media)) else {
            return
        }
        contents = cgImage
    }

    @MainActor
    private func scheduleFileImageDecode(_ media: StoryMediaObject, url: URL) {
        guard let request = StoryMediaImageRequest(media: media, resolvedURL: url) else { return }
        currentLoadTask = Task { @MainActor in
            guard !Task.isCancelled else { return }
            let decoded = await StoryLayerImageDecoding.decodedImage(fileAt: request.url)
            guard !Task.isCancelled,
                  StoryMediaImageRequest(media: self.media, resolvedURL: request.url) == request,
                  let cgImage = CanvasImageOrientation.displayCGImage(Self.filtered(decoded, for: media)) else { return }
            self.contents = cgImage
        }
    }

    @MainActor
    private func scheduleCachedOrRemoteImageLoad(_ media: StoryMediaObject,
                                                 cacheKey: String,
                                                 resolvedURL: URL?,
                                                 imageCache: ImageCacheReader?) {
        let loader = imageLoader
        currentLoadTask = Task { @MainActor in
            guard !Task.isCancelled else { return }
            if let imageCache,
               let cached = CanvasImageOrientation.displayCGImage(Self.filtered(await imageCache.cachedImage(for: cacheKey), for: media)) {
                guard !Task.isCancelled else { return }
                self.contents = cached
                return
            }
            guard let url = resolvedURL else { return }
            let loaded = await loader.image(for: url.absoluteString)
            guard !Task.isCancelled,
                  let cgImage = CanvasImageOrientation.displayCGImage(Self.filtered(loaded, for: media)) else { return }
            self.contents = cgImage
        }
    }
}
