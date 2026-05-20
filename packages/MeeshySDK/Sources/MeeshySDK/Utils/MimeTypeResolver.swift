import Foundation

/// Single source of truth pour les conversions extension de fichier ↔ mimeType.
///
/// Avant ce type, trois sites au moins dupliquaient cette table :
/// `ConversationView+AttachmentHandlers.swift` (la version complète),
/// `FeedView+Attachments.swift:468` (un sous-ensemble réduit avec un bug `docx`
/// mappé sur `application/msword`), et `FeedView+Attachments.swift:1225` (un
/// sous-ensemble encore plus restreint). Le résolveur unifie ces tables et
/// fournit aussi la direction inverse (`mimeType → preferred extension`) pour
/// les services qui doivent matérialiser un fichier à partir d'un mime
/// (notification rich push, partage UTI, etc.).
///
/// La table est volontairement statique : les mimes "à la mode" évoluent peu,
/// pas de raison de pousser ça en config dynamique.
public enum MimeTypeResolver {

    /// Convertit une extension de fichier (avec ou sans `.` initial,
    /// case-insensitive) vers son mime type canonique. Retourne
    /// `application/octet-stream` pour les extensions inconnues — ce qui est
    /// la valeur RFC-compliant pour "bytes opaques".
    public static func mimeType(forExtension ext: String) -> String {
        let normalized = normalizeExtension(ext)
        return forwardTable[normalized] ?? "application/octet-stream"
    }

    /// Convertit l'extension du `pathExtension` d'une URL vers son mime type.
    /// Raccourci pour les sites qui ont une URL sous la main (file picker,
    /// upload depuis le caméra, etc.).
    public static func mimeType(forURL url: URL) -> String {
        mimeType(forExtension: url.pathExtension)
    }

    /// Convertit l'extension d'un nom de fichier vers son mime type.
    /// `report.xlsx` → `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
    /// Un nom sans extension renvoie le fallback `application/octet-stream`.
    public static func mimeType(forFilename filename: String) -> String {
        guard let lastDot = filename.lastIndex(of: "."),
              lastDot != filename.index(before: filename.endIndex) else {
            return "application/octet-stream"
        }
        let ext = filename[filename.index(after: lastDot)...]
        return mimeType(forExtension: String(ext))
    }

    /// Direction inverse : depuis un mime type, propose l'extension la plus
    /// naturelle pour matérialiser un fichier (sans le `.`). Retourne `nil`
    /// pour les mimes non couverts par la table (le caller décide alors d'un
    /// fallback générique, p.ex. `m4a` pour un audio inconnu).
    ///
    /// Cas-insensitive sur l'input.
    public static func preferredExtension(for mimeType: String) -> String? {
        let normalized = mimeType.lowercased()
        return reverseTable[normalized]
    }

    // MARK: - Tables

    private static func normalizeExtension(_ ext: String) -> String {
        var trimmed = ext.lowercased()
        if trimmed.hasPrefix(".") { trimmed.removeFirst() }
        return trimmed
    }

    /// Table extension → mime. Toute extension absente tombe sur le fallback.
    /// Les couples synonymes (jpg/jpeg, mp4/m4v, heic/heif, ogg/oga, etc.)
    /// pointent vers le même mime canonique.
    private static let forwardTable: [String: String] = [
        // Images
        "jpg":  "image/jpeg",
        "jpeg": "image/jpeg",
        "png":  "image/png",
        "gif":  "image/gif",
        "webp": "image/webp",
        "heic": "image/heic",
        "heif": "image/heic",
        "svg":  "image/svg+xml",
        "bmp":  "image/bmp",
        "tiff": "image/tiff",
        "tif":  "image/tiff",
        // Video
        "mp4":  "video/mp4",
        "m4v":  "video/mp4",
        "mov":  "video/quicktime",
        "avi":  "video/x-msvideo",
        "mkv":  "video/x-matroska",
        "webm": "video/webm",
        // Audio
        "mp3":  "audio/mpeg",
        "m4a":  "audio/mp4",
        "aac":  "audio/mp4",
        "wav":  "audio/wav",
        "ogg":  "audio/ogg",
        "oga":  "audio/ogg",
        "flac": "audio/flac",
        "wma":  "audio/x-ms-wma",
        // Documents
        "pdf":  "application/pdf",
        "doc":  "application/msword",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls":  "application/vnd.ms-excel",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt":  "application/vnd.ms-powerpoint",
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "rtf":  "application/rtf",
        // iWork
        "pages":   "application/x-iwork-pages-sffpages",
        "numbers": "application/x-iwork-numbers-sffnumbers",
        "keynote": "application/x-iwork-keynote-sffkey",
        // Text & Code
        "txt":      "text/plain",
        "log":      "text/plain",
        "csv":      "text/csv",
        "html":     "text/html",
        "htm":      "text/html",
        "css":      "text/css",
        "md":       "text/markdown",
        "markdown": "text/markdown",
        "json":     "application/json",
        "xml":      "application/xml",
        "js":       "application/javascript",
        "ts":       "application/typescript",
        "py":       "text/x-python",
        "swift":    "text/x-swift",
        // Archives
        "zip":  "application/zip",
        "rar":  "application/x-rar-compressed",
        "7z":   "application/x-7z-compressed",
        "tar":  "application/x-tar",
        "gz":   "application/gzip",
        "gzip": "application/gzip",
    ]

    /// Table inverse mime → extension préférée. Pour les mimes ayant plusieurs
    /// extensions (jpeg : jpg/jpeg, mp4 : mp4/m4v, etc.) on retient la plus
    /// courante (jpg, mp4, m4a, ogg, tiff, md, gz).
    private static let reverseTable: [String: String] = [
        "image/jpeg": "jpg",
        "image/png":  "png",
        "image/gif":  "gif",
        "image/webp": "webp",
        "image/heic": "heic",
        "image/svg+xml": "svg",
        "image/bmp":  "bmp",
        "image/tiff": "tiff",
        "video/mp4":         "mp4",
        "video/quicktime":   "mov",
        "video/x-msvideo":   "avi",
        "video/x-matroska":  "mkv",
        "video/webm":        "webm",
        "audio/mpeg":     "mp3",
        "audio/mp4":      "m4a",
        "audio/wav":      "wav",
        "audio/ogg":      "ogg",
        "audio/flac":     "flac",
        "audio/x-ms-wma": "wma",
        "application/pdf":     "pdf",
        "application/msword":  "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        "application/vnd.ms-excel":  "xls",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
        "application/vnd.ms-powerpoint": "ppt",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
        "application/rtf": "rtf",
        "application/x-iwork-pages-sffpages":     "pages",
        "application/x-iwork-numbers-sffnumbers": "numbers",
        "application/x-iwork-keynote-sffkey":     "keynote",
        "text/plain":      "txt",
        "text/csv":        "csv",
        "text/html":       "html",
        "text/css":        "css",
        "text/markdown":   "md",
        "text/x-python":   "py",
        "text/x-swift":    "swift",
        "application/json":       "json",
        "application/xml":        "xml",
        "application/javascript": "js",
        "application/typescript": "ts",
        "application/zip":              "zip",
        "application/x-rar-compressed": "rar",
        "application/x-7z-compressed":  "7z",
        "application/x-tar":            "tar",
        "application/gzip":             "gz",
    ]
}
