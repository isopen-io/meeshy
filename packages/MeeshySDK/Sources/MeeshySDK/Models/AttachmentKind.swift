import Foundation

/// Catégorie sémantique d'un attachment, dérivée de son `mimeType`.
///
/// Single source of truth pour le dispatch par famille de fichier dans toute
/// l'application iOS — utilisé par la liste de conversations (icône + glyphe),
/// le menu d'overlay (split image/video/audio/document), le detail sheet
/// (filtres audio+vidéo pour la transcription), les previews push, etc.
///
/// **Ne pas** réimplémenter `mime.hasPrefix("image/")` etc. au coup par coup :
/// utiliser `AttachmentKind(mimeType:)` ou `attachment.kind`.
public enum AttachmentKind: String, Sendable, Equatable, CaseIterable, Codable {
    case image
    case video
    case audio
    case pdf
    case spreadsheet    // Excel, CSV
    case document       // Word, RTF
    case presentation   // PowerPoint
    case archive        // ZIP, TAR, RAR, 7z, GZ
    case code           // JSON, XML
    case text           // text/plain, markdown, html
    case other

    /// Résout la catégorie à partir d'un mimeType. Retourne `.other` pour les
    /// types non reconnus ou vides.
    ///
    /// **Case-insensitive.** RFC 2045 §5.1 dit que les mimeTypes sont
    /// case-insensitive (`Image/JPEG` ≡ `image/jpeg`). On normalise via
    /// `.lowercased()` pour que cette fonction reste un single-source-of-truth
    /// robuste face à des payloads non-normalisés (gateway tiers, partage
    /// inter-app via UTType, etc.).
    ///
    /// Précédence des règles :
    /// 1. Mimes exacts (Office, archives, code) — match avant les préfixes pour
    ///    que `text/csv` → `.spreadsheet` (pas `.text`), `text/xml` → `.code`.
    /// 2. Préfixes `image/`, `video/`, `audio/`.
    /// 3. Préfixe `text/` (fallback texte).
    /// 4. `.other` sinon.
    public init(mimeType: String) {
        let normalized = mimeType.lowercased()
        // 1. Exact matches first — they would otherwise be shadowed by the
        //    `text/` and `application/` prefixes below.
        switch normalized {
        case "application/pdf":
            self = .pdf; return
        case "application/vnd.ms-excel",
             "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
             "text/csv":
            self = .spreadsheet; return
        case "application/msword",
             "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
             "application/rtf":
            self = .document; return
        case "application/vnd.ms-powerpoint",
             "application/vnd.openxmlformats-officedocument.presentationml.presentation":
            self = .presentation; return
        case "application/zip",
             "application/x-zip-compressed",
             "application/x-tar",
             "application/x-7z-compressed",
             "application/gzip",
             "application/x-rar-compressed":
            self = .archive; return
        case "application/json",
             "application/xml",
             "text/xml":
            self = .code; return
        default:
            break
        }
        // 2. Media prefixes.
        if normalized.hasPrefix("image/") { self = .image; return }
        if normalized.hasPrefix("video/") { self = .video; return }
        if normalized.hasPrefix("audio/") { self = .audio; return }
        // 3. Text fallback (csv / xml already consumed above).
        if normalized.hasPrefix("text/") { self = .text; return }
        // 4. Unknown.
        self = .other
    }

    /// `true` pour les familles multimédia (image, video, audio).
    /// Utile pour les filtres "media-only" dans les overlays + menus.
    public var isMedia: Bool {
        switch self {
        case .image, .video, .audio: return true
        default: return false
        }
    }

    /// `true` pour audio et video — les deux familles qui possèdent une piste
    /// temporelle (durée + transcription possible).
    public var hasTimebasedTrack: Bool {
        self == .audio || self == .video
    }

    // MARK: - UI primitives (pure data, no SwiftUI dependency)

    /// SF Symbol associé à cette famille. Single source of truth pour les
    /// glyphes affichés dans la liste de conversations, le detail sheet, etc.
    public var sfSymbolName: String {
        switch self {
        case .image:        return "camera.fill"
        case .video:        return "video.fill"
        case .audio:        return "waveform"
        case .pdf:          return "doc.fill"
        case .spreadsheet:  return "tablecells.fill"
        case .document:     return "doc.text.fill"
        case .presentation: return "chart.bar.doc.horizontal.fill"
        case .archive:      return "doc.zipper"
        case .code:         return "curlybraces"
        case .text:         return "doc.plaintext.fill"
        case .other:        return "paperclip"
        }
    }

    /// Couleur d'accentuation au format hex 6 chiffres (sans `#`). Utilisée
    /// par les chemins qui sérialisent des couleurs (thumbnailColor sur les
    /// previews, story reader, post models) et par la couche SwiftUI via
    /// `Color(hex:)` (cf. `AttachmentDisplay` dans MeeshyUI).
    public var hexTintColor: String {
        switch self {
        case .image:        return "4ECDC4"  // teal — matches the historical "image" tint
        case .video:        return "FF6B6B"  // red — matches PostModels.swift / StoryReader
        case .audio:        return "9B59B6"  // purple — matches PostModels.swift / StoryReader
        case .pdf:          return "F39C12"
        case .spreadsheet:  return "21803D"
        case .document:     return "2A56B5"
        case .presentation: return "D96921"
        case .archive:      return "808080"
        case .code:         return "6366F1"  // indigo500 — brand primary
        case .text:         return "808080"
        case .other:        return "808080"
        }
    }

    /// Étiquette courte (FR par défaut) — utilisée comme fallback meta dans
    /// les previews quand aucune dimension/durée n'est disponible et que le
    /// nom de fichier d'origine est vide.
    public var shortLabel: String {
        switch self {
        case .image:        return NSLocalizedString("attachment.kind.image", value: "Photo", comment: "")
        case .video:        return NSLocalizedString("attachment.kind.video", value: "Vidéo", comment: "")
        case .audio:        return NSLocalizedString("attachment.kind.audio", value: "Audio", comment: "")
        case .pdf:          return "PDF"
        case .spreadsheet:  return "Excel"
        case .document:     return "Word"
        case .presentation: return "PowerPoint"
        case .archive:      return NSLocalizedString("attachment.kind.archive", value: "Archive", comment: "")
        case .code:         return NSLocalizedString("attachment.kind.code", value: "Code", comment: "")
        case .text:         return NSLocalizedString("attachment.kind.text", value: "Texte", comment: "")
        case .other:        return NSLocalizedString("attachment.kind.file", value: "Fichier", comment: "")
        }
    }
}

// MARK: - Convenience accessor on attachments

extension MeeshyMessageAttachment {
    /// Catégorie sémantique dérivée du `mimeType` de l'attachment.
    /// Préférer `attachment.kind` à `attachment.mimeType.hasPrefix(...)`.
    public var kind: AttachmentKind { AttachmentKind(mimeType: mimeType) }
}
