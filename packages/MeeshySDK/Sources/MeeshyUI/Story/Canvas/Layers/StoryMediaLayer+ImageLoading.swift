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

        if applyComposerCachedImage(media, cacheKey: cacheKey, imageCache: imageCache) { return }

        if let url = resolvedURL, url.isFileURL {
            loadFileImage(media, url: url, decodeTiming: decodeTiming)
            return
        }
        scheduleCachedOrRemoteImageLoad(media, cacheKey: cacheKey, resolvedURL: resolvedURL, imageCache: imageCache)
    }

    @MainActor
    private func applyComposerCachedImage(_ media: StoryMediaObject,
                                          cacheKey: String,
                                          imageCache: ImageCacheReader?) -> Bool {
        guard let reader = imageCache as? ComposerImageCacheReader,
              let cached = CanvasImageOrientation.displayCGImage(Self.filtered(reader.images[cacheKey], for: media)) else {
            return false
        }
        contents = cached
        return true
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
        guard let data = try? Data(contentsOf: url),
              let cgImage = CanvasImageOrientation.displayCGImage(Self.filtered(UIImage(data: data), for: media)) else {
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
