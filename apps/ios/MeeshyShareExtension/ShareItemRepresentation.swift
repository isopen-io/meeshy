import Foundation
import UniformTypeIdentifiers

/// Quelle représentation d'un fournisseur la feuille de partage charge (#11134).
///
/// **Le média d'abord, son chemin jamais.** Google Photos remet, pour chaque
/// photo ou vidéo, une URL de FICHIER (`public.file-url`) à côté de la
/// représentation média. Or `public.file-url` est conforme à `public.url` :
/// l'extension la prenait pour un lien, et le destinataire recevait un chemin.
///
/// **Le lien d'abord quand il est le sujet** (#11430). Safari, YouTube et les
/// réseaux sociaux mettent dans le MÊME fournisseur le lien d'une page et sa
/// vignette : c'est le lien qu'on partage, la vignette n'est pas jointe. Un
/// lien WEB s'annonce par `public.url` sans `public.file-url` (mesuré : une
/// `NSURL` web n'enregistre que `public.url`, une `NSURL` de fichier les deux).
///
/// L'ordre : lien web > média (image, vidéo) > fichier (un document, ou l'URL
/// d'un fichier qu'on COPIE) > lien > texte > donnée nue. Un document ne prime
/// sur un lien que s'il vient avec son URL de fichier : Safari peut remettre
/// une archive web à côté du lien d'une page, et c'est le lien qu'on partage.
nonisolated enum ShareItemRepresentation: Equatable, Sendable {
    case media(typeIdentifier: String)
    case file(typeIdentifier: String)
    case fileURL
    case link
    case text
    case unsupported

    static let fileURLTypeIdentifier = UTType.fileURL.identifier

    /// Les identifiants usuels, nommés pour qu'aucun ne dépende de la base de
    /// types de l'appareil ; tout autre type conforme à `public.image` ou
    /// `public.movie` est aussi un média.
    static let usualMediaTypeIdentifiers: Set<String> = [
        "public.image", "public.jpeg", "public.heic", "public.heif", "public.png",
        "com.compuserve.gif", "org.webmproject.webp", "public.tiff",
        "public.movie", "public.video", "public.mpeg-4", "com.apple.quicktime-movie",
        "com.apple.m4v-video", "public.3gpp", "public.avi",
    ]

    /// Les types ABSTRAITS : ils ne cèdent qu'à défaut d'un type concret, qui
    /// nomme mieux le fichier et son MIME.
    static let abstractMediaTypeIdentifiers: Set<String> = [
        "public.image", "public.movie", "public.video", "public.audiovisual-content",
    ]

    static func choose(from typeIdentifiers: [String]) -> ShareItemRepresentation {
        if carriesWebLink(typeIdentifiers) { return .link }
        if let media = preferredMedia(in: typeIdentifiers) { return .media(typeIdentifier: media) }
        if typeIdentifiers.contains(fileURLTypeIdentifier) {
            return typeIdentifiers.first(where: isDocument).map { .file(typeIdentifier: $0) } ?? .fileURL
        }
        if typeIdentifiers.contains(where: { conforms($0, to: .url) }) { return .link }
        if typeIdentifiers.contains(where: { conforms($0, to: .text) }) { return .text }
        return typeIdentifiers.first.map { .file(typeIdentifier: $0) } ?? .unsupported
    }

    static func isMedia(_ identifier: String) -> Bool {
        usualMediaTypeIdentifiers.contains(identifier)
            || conforms(identifier, to: .image)
            || conforms(identifier, to: .movie)
    }

    private static func carriesWebLink(_ identifiers: [String]) -> Bool {
        identifiers.contains(UTType.url.identifier) && !identifiers.contains(fileURLTypeIdentifier)
    }

    private static func preferredMedia(in identifiers: [String]) -> String? {
        let media = identifiers.filter(isMedia)
        return media.first { !abstractMediaTypeIdentifiers.contains($0) } ?? media.first
    }

    /// Ce qui n'est ni une URL ni un média : un document dont on charge le
    /// FICHIER.
    private static func isDocument(_ identifier: String) -> Bool {
        !conforms(identifier, to: .url) && !isMedia(identifier)
    }

    private static func conforms(_ identifier: String, to type: UTType) -> Bool {
        UTType(identifier)?.conforms(to: type) ?? false
    }
}
