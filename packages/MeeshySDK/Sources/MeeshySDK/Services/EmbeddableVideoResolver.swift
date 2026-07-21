import Foundation

public enum VideoEmbedProvider: String, Sendable, Codable, Equatable {
    case youtube
}

public enum YouTubeThumbnailQuality: String, Sendable {
    case standard = "hqdefault"
    case high = "maxresdefault"
}

public struct EmbeddedVideo: Sendable, Codable, Equatable, Identifiable {
    public let provider: VideoEmbedProvider
    public let videoId: String
    public let startSeconds: Int?

    public init(provider: VideoEmbedProvider, videoId: String, startSeconds: Int? = nil) {
        self.provider = provider
        self.videoId = videoId
        self.startSeconds = startSeconds
    }

    public var id: String { "\(provider.rawValue):\(videoId)" }

    /// `videoId` peut provenir directement de l'initialiseur public (donc potentiellement
    /// non-ASCII) même si `EmbeddableVideoResolver.make` filtre déjà à l'ASCII en amont —
    /// on repercent-encode systématiquement avant toute interpolation dans une URL pour
    /// ne jamais dépendre d'un force-unwrap sur une valeur dérivée d'un texte distant.
    private var pathEncodedVideoId: String {
        videoId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? ""
    }

    private static let fallbackURL = URL(string: "https://www.youtube.com/")!

    public func thumbnailURL(_ quality: YouTubeThumbnailQuality = .standard) -> URL {
        URL(string: "https://img.youtube.com/vi/\(pathEncodedVideoId)/\(quality.rawValue).jpg")
            ?? EmbeddedVideo.fallbackURL
    }

    public var embedURL: URL {
        URL(string: "https://www.youtube.com/embed/\(pathEncodedVideoId)")
            ?? EmbeddedVideo.fallbackURL
    }

    /// URL canonique « watch » reconstruite depuis le `videoId` (+ start éventuel).
    /// Atome agnostique : la façade vidéo ouvre cette URL (ou un lien tracké `/l/token`
    /// qui y redirige) au tap, plutôt que de tenter une lecture inline en WKWebView
    /// (bloquée par la vérification d'origine YouTube, erreurs 15x).
    public var watchURL: URL {
        var comps = URLComponents()
        comps.scheme = "https"
        comps.host = "www.youtube.com"
        comps.path = "/watch"
        var items = [URLQueryItem(name: "v", value: videoId)]
        if let startSeconds, startSeconds > 0 {
            items.append(URLQueryItem(name: "t", value: "\(startSeconds)s"))
        }
        comps.queryItems = items
        return comps.url ?? EmbeddedVideo.fallbackURL
    }
}

public enum EmbeddableVideoResolver {

    private static let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)

    public static func resolve(in text: String) -> EmbeddedVideo? {
        guard let detector else { return nil }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        for match in detector.matches(in: text, options: [], range: range) {
            guard let url = match.url, let video = resolve(url: url) else { continue }
            return video
        }
        return nil
    }

    public static func resolve(urlString: String) -> EmbeddedVideo? {
        guard let url = URL(string: urlString) else { return nil }
        return resolve(url: url)
    }

    public static func resolve(url: URL) -> EmbeddedVideo? {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { return nil }
        guard let host = url.host?.lowercased() else { return nil }
        let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let start = parseStart(comps: comps, fragment: url.fragment)

        if host == "youtu.be" {
            return make(String(url.path.dropFirst()), start)
        }
        if host == "youtube.com" || host.hasSuffix(".youtube.com")
            || host == "youtube-nocookie.com" || host.hasSuffix(".youtube-nocookie.com") {
            if url.path == "/watch", let value = comps?.queryItems?.first(where: { $0.name == "v" })?.value {
                return make(value, start)
            }
            let parts = url.path.split(separator: "/").map(String.init)
            if parts.count >= 2, ["shorts", "embed", "v", "live"].contains(parts[0]) {
                return make(parts[1], start)
            }
        }
        return nil
    }

    private static func make(_ rawId: String, _ start: Int?) -> EmbeddedVideo? {
        let id = rawId.prefix { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_" || $0 == "-") }
        guard id.count >= 6, id.count <= 20 else { return nil }
        return EmbeddedVideo(provider: .youtube, videoId: String(id), startSeconds: start)
    }

    private static func parseStart(comps: URLComponents?, fragment: String?) -> Int? {
        let raw = comps?.queryItems?.first(where: { $0.name == "t" || $0.name == "start" })?.value
            ?? fragmentValue(fragment, key: "t")
        guard let raw else { return nil }
        return parseDuration(raw)
    }

    private static func fragmentValue(_ fragment: String?, key: String) -> String? {
        guard let fragment else { return nil }
        for pair in fragment.split(separator: "&") {
            let kv = pair.split(separator: "=", maxSplits: 1)
            if kv.count == 2, kv[0] == key { return String(kv[1]) }
        }
        return nil
    }

    private static func parseDuration(_ s: String) -> Int? {
        if let plain = Int(s) { return plain }
        var total = 0
        var number = ""
        var matched = false
        for ch in s {
            if ch.isNumber { number.append(ch); continue }
            guard let n = Int(number) else { return matched ? total : nil }
            switch ch {
            case "h", "H": total += n * 3600; matched = true
            case "m", "M": total += n * 60; matched = true
            case "s", "S": total += n; matched = true
            default: return matched ? total : nil
            }
            number = ""
        }
        if let n = Int(number) { total += n; matched = true }
        return matched ? total : nil
    }
}
