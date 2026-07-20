/// Pure source-selection helper for `MyStoryRow` thumbnails. The row's
/// `thumbnailUrl` only ever reflects the raw background media — it never
/// includes text, drawing, or stickers baked on top. `storyEffects.thumbHash`
/// is a composite of every layer (cf. StoryReaderLoadingOverlay, which
/// already decodes it the same way for the reader's loading placeholder) and
/// is the only client-available representation of what the author actually
/// composed, short of a server-baked cover (out of scope — RAW-publish rule).
enum MyStoryThumbnailSource: Equatable {
    case composite(thumbHash: String)
    case remoteURL(String)
    case placeholder
}

enum MyStoryThumbnailResolver {
    static func resolve(thumbHash: String?, remoteURL: String?) -> MyStoryThumbnailSource {
        if let hash = thumbHash, !hash.isEmpty {
            return .composite(thumbHash: hash)
        }
        if let url = remoteURL, !url.isEmpty {
            return .remoteURL(url)
        }
        return .placeholder
    }
}
