import Foundation
import os

/// Metadata extracted from a URL's OpenGraph / Twitter-card / HTML fallback
/// headers. Persisted in the unified cache so every bubble referencing the
/// same URL renders instantly on subsequent scrolls.
public struct LinkMetadata: Codable, Sendable, Identifiable, Equatable {
    public let id: String           // absolute URL string, canonical key
    public let title: String?
    public let description: String?
    public let imageURL: String?
    public let siteName: String?
    public let fetchedAt: Date

    public init(
        id: String,
        title: String?,
        description: String?,
        imageURL: String?,
        siteName: String?,
        fetchedAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.description = description
        self.imageURL = imageURL
        self.siteName = siteName
        self.fetchedAt = fetchedAt
    }

    public var host: String? {
        URL(string: id)?.host
    }

    public var hasAnyVisibleField: Bool {
        title?.isEmpty == false || description?.isEmpty == false || imageURL?.isEmpty == false
    }
}

/// Fetches OpenGraph / meta-based preview data for the first HTTP(S) URL in
/// a message. Dedupes concurrent fetches of the same URL, enforces a 4s
/// network timeout so a hung site never stalls the message flow, and
/// gracefully returns `nil` for anything it can't parse — the caller then
/// falls back to showing the raw link.
public actor LinkPreviewFetcher {
    public static let shared = LinkPreviewFetcher()

    private static let fetchTimeout: TimeInterval = 4
    private static let maxBodyBytes = 512 * 1024 // Reject pages larger than 512 KB
    private static let userAgent = "Meeshy/1.0 (Link preview; +https://meeshy.me)"

    private var inFlight: [String: Task<LinkMetadata?, Never>] = [:]
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "link-preview")
    private let session: URLSession

    private init(session: URLSession? = nil) {
        if let session {
            self.session = session
        } else {
            let config = URLSessionConfiguration.ephemeral
            config.timeoutIntervalForRequest = LinkPreviewFetcher.fetchTimeout
            config.timeoutIntervalForResource = LinkPreviewFetcher.fetchTimeout
            config.httpAdditionalHeaders = [
                "User-Agent": LinkPreviewFetcher.userAgent,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            ]
            self.session = URLSession(configuration: config)
        }
    }

    /// Main entry point: returns cached metadata if available, otherwise
    /// dispatches a single network fetch per URL (dedup across concurrent
    /// callers).
    public func metadata(for urlString: String) async -> LinkMetadata? {
        let canonical = Self.canonicalize(urlString)
        if let task = inFlight[canonical] {
            return await task.value
        }
        let task = Task<LinkMetadata?, Never> { [weak self] in
            await self?.fetch(urlString: canonical)
        }
        inFlight[canonical] = task
        let result = await task.value
        inFlight[canonical] = nil
        return result
    }

    /// Pull the first HTTP(S) URL out of a message body. Returns `nil` when
    /// the text has no URL or only mailto/tel/mentions.
    /// Shared link detector. `NSDataDetector` is documented as thread-safe, and
    /// building one is expensive (it compiles the link-detection rules), so
    /// creating one per `firstURL` call — i.e. per text bubble's `BubbleContent`
    /// build, which runs per cell on scroll — was real CPU. Build it once.
    private nonisolated static let linkDetector: NSDataDetector? =
        try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)

    public nonisolated static func firstURL(in text: String) -> String? {
        guard !text.isEmpty, let detector = Self.linkDetector else {
            return nil
        }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        let matches = detector.matches(in: text, range: range)
        for match in matches {
            guard let url = match.url else { continue }
            guard let scheme = url.scheme?.lowercased(),
                  scheme == "http" || scheme == "https" else { continue }
            return url.absoluteString
        }
        return nil
    }

    // MARK: - Internal

    private func fetch(urlString: String) async -> LinkMetadata? {
        guard let url = URL(string: urlString) else { return nil }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.cachePolicy = .reloadIgnoringLocalCacheData
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                return nil
            }
            // Clamp body to avoid pulling a whole PDF/html file into memory.
            let truncated = data.count > Self.maxBodyBytes ? data.prefix(Self.maxBodyBytes) : data
            // Prefer content-type declared charset, fall back to UTF-8.
            let encoding = Self.encoding(from: http) ?? .utf8
            guard let html = String(data: truncated, encoding: encoding)
                ?? String(data: truncated, encoding: .isoLatin1) else {
                return nil
            }
            let parsed = Self.parse(html: html, for: urlString)
            if parsed.hasAnyVisibleField {
                return parsed
            }
            return nil
        } catch {
            logger.debug("Link preview fetch failed for \(urlString, privacy: .public): \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    private static func encoding(from response: HTTPURLResponse) -> String.Encoding? {
        guard let header = response.value(forHTTPHeaderField: "Content-Type"),
              let match = header.range(of: #"charset=([\w-]+)"#, options: .regularExpression) else {
            return nil
        }
        let name = String(header[match]).replacingOccurrences(of: "charset=", with: "")
        let cfEncoding = CFStringConvertIANACharSetNameToEncoding(name as CFString)
        guard cfEncoding != kCFStringEncodingInvalidId else { return nil }
        return String.Encoding(rawValue: CFStringConvertEncodingToNSStringEncoding(cfEncoding))
    }

    private static func canonicalize(_ urlString: String) -> String {
        guard var components = URLComponents(string: urlString) else { return urlString }
        // Strip trackers that are irrelevant to preview content; keeps the
        // cache hot even when the same URL arrives with different UTM tags.
        let stripNames: Set<String> = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"]
        components.queryItems = components.queryItems?.filter { !stripNames.contains($0.name.lowercased()) }
        if components.queryItems?.isEmpty == true { components.queryItems = nil }
        if components.fragment == "" { components.fragment = nil }
        return components.url?.absoluteString ?? urlString
    }

    // MARK: - HTML Parsing

    private static func parse(html: String, for urlString: String) -> LinkMetadata {
        let title = firstMeta(in: html, properties: ["og:title", "twitter:title"])
            ?? firstTitleTag(in: html)
        let description = firstMeta(in: html, properties: ["og:description", "twitter:description", "description"])
        let image = firstMeta(in: html, properties: ["og:image", "twitter:image", "twitter:image:src"])
            .flatMap { Self.resolveImageURL($0, against: urlString) }
        let siteName = firstMeta(in: html, properties: ["og:site_name", "application-name"])
            ?? URL(string: urlString)?.host

        return LinkMetadata(
            id: urlString,
            title: title?.trimmedDecoded,
            description: description?.trimmedDecoded,
            imageURL: image,
            siteName: siteName?.trimmedDecoded
        )
    }

    private static func resolveImageURL(_ candidate: String, against base: String) -> String? {
        let trimmed = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if let absolute = URL(string: trimmed), absolute.scheme != nil {
            return absolute.absoluteString
        }
        if let baseURL = URL(string: base),
           let resolved = URL(string: trimmed, relativeTo: baseURL)?.absoluteURL {
            return resolved.absoluteString
        }
        return trimmed
    }

    private static func firstMeta(in html: String, properties: [String]) -> String? {
        for prop in properties {
            // <meta property="og:title" content="..."> and name="..." variants
            let patterns = [
                #"<meta[^>]+property=['\"]"# + prop + #"['\"][^>]+content=['\"]([^'\"]+)['\"]"#,
                #"<meta[^>]+content=['\"]([^'\"]+)['\"][^>]+property=['\"]"# + prop + #"['\"]"#,
                #"<meta[^>]+name=['\"]"# + prop + #"['\"][^>]+content=['\"]([^'\"]+)['\"]"#,
                #"<meta[^>]+content=['\"]([^'\"]+)['\"][^>]+name=['\"]"# + prop + #"['\"]"#
            ]
            for pattern in patterns {
                if let value = regexFirstCapture(in: html, pattern: pattern) {
                    return value
                }
            }
        }
        return nil
    }

    private static func firstTitleTag(in html: String) -> String? {
        regexFirstCapture(in: html, pattern: #"<title[^>]*>([^<]+)</title>"#)
    }

    /// Compiled HTML-metadata regexes, keyed by pattern. The set of patterns is
    /// fixed (title / og:* tags) yet `regexFirstCapture` recompiled each one on
    /// every link-preview fetch — wasted (off-main) CPU. Compile each once.
    private nonisolated(unsafe) static let htmlMetaRegexCache: NSCache<NSString, NSRegularExpression> = {
        let c = NSCache<NSString, NSRegularExpression>()
        c.countLimit = 50
        return c
    }()

    private static func regexFirstCapture(in html: String, pattern: String) -> String? {
        let regex: NSRegularExpression
        if let cached = htmlMetaRegexCache.object(forKey: pattern as NSString) {
            regex = cached
        } else {
            guard let built = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive, .dotMatchesLineSeparators]) else {
                return nil
            }
            htmlMetaRegexCache.setObject(built, forKey: pattern as NSString)
            regex = built
        }
        let range = NSRange(html.startIndex..<html.endIndex, in: html)
        guard let match = regex.firstMatch(in: html, range: range),
              match.numberOfRanges > 1,
              let captureRange = Range(match.range(at: 1), in: html) else {
            return nil
        }
        return String(html[captureRange])
    }
}

extension String {
    /// Decode common HTML entities and trim whitespace so preview chrome
    /// reads cleanly. Not exhaustive — we handle the high-value entities
    /// that frequently show up in og:title / og:description.
    var trimmedDecoded: String {
        let entities: [String: String] = [
            "&amp;": "&",
            "&lt;": "<",
            "&gt;": ">",
            "&quot;": "\"",
            "&apos;": "'",
            "&#39;": "'",
            "&nbsp;": " ",
            "&mdash;": "—",
            "&ndash;": "–",
            "&hellip;": "…"
        ]
        var value = self
        for (entity, replacement) in entities {
            value = value.replacingOccurrences(of: entity, with: replacement)
        }
        // Numeric entities: &#1234; and &#x00AE; — decode to actual Unicode characters.
        // Group 1 = hex digits (&#x…;), group 2 = decimal digits (&#…;).
        if let regex = try? NSRegularExpression(pattern: #"&#(?:x([0-9a-fA-F]+)|([0-9]+));"#, options: .caseInsensitive) {
            let nsValue = value as NSString
            let matches = regex.matches(in: value, range: NSRange(location: 0, length: nsValue.length))
            for match in matches.reversed() {
                let decoded: Character?
                if match.range(at: 1).location != NSNotFound,
                   let r = Range(match.range(at: 1), in: value),
                   let cp = UInt32(value[r], radix: 16),
                   let scalar = Unicode.Scalar(cp) {
                    decoded = Character(scalar)
                } else if match.range(at: 2).location != NSNotFound,
                          let r = Range(match.range(at: 2), in: value),
                          let cp = UInt32(value[r]),
                          let scalar = Unicode.Scalar(cp) {
                    decoded = Character(scalar)
                } else {
                    decoded = nil
                }
                if let ch = decoded, let fullRange = Range(match.range, in: value) {
                    value.replaceSubrange(fullRange, with: String(ch))
                }
            }
        }
        return value.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
