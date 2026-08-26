import Foundation
import UniformTypeIdentifiers
import AVFoundation
import MeeshySDK
import os

// Couche pure d'ingestion du composer : résolution des `NSItemProvider`
// déposés sur la bande, routage MIME → pipeline, et détection des URLs
// `file://` collées. Aucune UI ici — la barre émet des intentions, l'hôte
// orchestre (même règle que le reste de `UniversalComposerBar`).
//
// Tous les types sont des `enum` `nonisolated` : les complétions de
// `NSItemProvider` rappellent hors du main, et une classe aurait une `deinit`
// isolée implicite (SE-0466) qui double-libère sur iOS < 26.

/// Contenu résolu d'un dépôt ou d'un collage dans la bande du composer.
nonisolated enum ComposerIngest: Equatable, Sendable {
    /// L'URL pointe un fichier DÉJÀ copié dans notre conteneur ;
    /// l'appelant en devient propriétaire (il le déplace ou le supprime).
    case file(url: URL, name: String, mime: String)
    case text(String)
}

/// Pipeline de préparation vers lequel un hôte route un `ComposerIngest.file`.
nonisolated enum ComposerIngestPipeline: Equatable {
    case image, video, audio, file
}

/// Décision de routage MIME → pipeline, partagée par les quatre hôtes du
/// composer au lieu d'être recopiée quatre fois.
nonisolated enum ComposerIngestRouter {

    /// `image/*` → `.image`, `video/*` → `.video`, `audio/*` → `.audio` ;
    /// tout le reste — MIME vide et `application/octet-stream` compris —
    /// tombe sur le pipeline fichier générique. Insensible à la casse.
    static func route(mime: String) -> ComposerIngestPipeline {
        let normalized = mime.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if normalized.hasPrefix("image/") { return .image }
        if normalized.hasPrefix("video/") { return .video }
        if normalized.hasPrefix("audio/") { return .audio }
        return .file
    }
}

/// **Sonde des métadonnées d'un fichier LOCAL fraîchement ingéré (T2.3,
/// revue Opus, correctifs 1 et 3)** — durée pour une vidéo/un audio, mime à
/// PORTER quand le système ne sait pas toujours en donner un pour un
/// `UTType` pourtant bien identifié.
///
/// `nonisolated enum`, même patron que le reste de ce fichier : les deux
/// méthodes n'ont aucune affinité avec le MainActor.
nonisolated enum ComposerMediaProbe {

    /// La durée RÉELLE d'un fichier vidéo/audio, en millisecondes — `nil`
    /// pour une image ou un fichier générique, dont la durée n'a pas de sens.
    ///
    /// **Correctif 1.** Sans elle, un `ComposerDocumentMedia` de vidéo
    /// partait avec `durationMs: nil`, et `ReelComposition.defaultType` — qui
    /// exige >= 3 s pour qu'une SEULE vidéo qualifie un RÉEL — traite une
    /// durée inconnue comme NON qualifiante (`meetsMinDuration(nil) ==
    /// false`) : une vidéo de 10 s composée dans le meuble partait donc en
    /// `POST`, jamais en `REEL`.
    ///
    /// `ComposerIngestRouter.route(mime:)` reste le SEUL classement
    /// image/vidéo/audio : cette sonde ne réimplémente aucun `hasPrefix`, et
    /// court-circuite AVANT de toucher `AVFoundation` pour tout ce qui n'est
    /// ni vidéo ni audio.
    static func durationMs(forURL url: URL, mime: String) async -> Int? {
        switch ComposerIngestRouter.route(mime: mime) {
        case .video, .audio:
            let asset = AVURLAsset(url: url)
            do {
                let duration = try await asset.load(.duration)
                guard duration.isValid, !duration.isIndefinite else { return nil }
                let seconds = CMTimeGetSeconds(duration)
                guard seconds > 0 else { return nil }
                return Int((seconds * 1000).rounded())
            } catch {
                return nil
            }
        case .image, .file:
            return nil
        }
    }

    /// Le mime à porter jusqu'au brouillon — le `UTType` DÉCLARÉ quand il en
    /// donne un, et SEULEMENT alors un repli sur la table connue par
    /// EXTENSION (`MimeTypeResolver`), jamais `application/octet-stream`
    /// directement.
    ///
    /// **Correctif 3.** `UTType.preferredMIMEType` rend `nil` pour des types
    /// pourtant bien identifiés — `.caf` (`com.apple.coreaudio-format`),
    /// `.opus` — et retomber directement sur `application/octet-stream` y
    /// ferait perdre EXACTEMENT le défaut que ce lot prétend fermer : la
    /// passerelle ne reconnaît un média audio qu'à
    /// `mimeType.startsWith('audio/')` (`PublishIntent.swift:64-75`), et
    /// n'y lance donc jamais Whisper.
    static func mime(forURL url: URL, declaredType: UTType?) -> String {
        declaredType?.preferredMIMEType ?? MimeTypeResolver.mimeType(forURL: url)
    }
}

/// Détection pure des URLs `file://` dans un texte collé — sans UIKit.
nonisolated enum FileURLPasteDetector {

    /// Une occurrence `file://` suivie d'au moins un caractère non blanc.
    /// Le motif est un littéral prouvé par `FileURLPasteDetectorTests`.
    private static let fileURLRegex: NSRegularExpression = {
        // swiftlint:disable:next force_try
        try! NSRegularExpression(pattern: "file://[^\\s]+")
    }()

    /// Extrait les occurrences `file://…` du texte, décode leur
    /// pourcentage-encodage, et rend le texte débarrassé de ces occurrences
    /// (espaces résiduels normalisés).
    ///
    /// Un `file://` isolé sans chemin (phrase tapée à la main, hôte sans
    /// chemin) ne produit PAS d'URL et laisse le texte intact.
    static func detect(in text: String) -> (cleaned: String, urls: [URL]) {
        guard text.contains("file://") else { return (text, []) }

        let ns = text as NSString
        var urls: [URL] = []
        var removals: [NSRange] = []
        let fullRange = NSRange(location: 0, length: ns.length)
        for match in fileURLRegex.matches(in: text, options: [], range: fullRange) {
            let raw = ns.substring(with: match.range)
            guard let candidate = URL(string: raw),
                  candidate.isFileURL,
                  !candidate.path.isEmpty,
                  candidate.path != "/" else {
                // Pas de chemin exploitable : faux positif, on n'y touche pas.
                continue
            }
            // `URL.path` décode le pourcentage ; on reconstruit une URL de
            // fichier propre depuis le chemin décodé.
            urls.append(URL(fileURLWithPath: candidate.path))
            removals.append(match.range)
        }
        guard !removals.isEmpty else { return (text, []) }

        let mutable = NSMutableString(string: text)
        for range in removals.reversed() {
            mutable.replaceCharacters(in: range, with: "")
        }
        var cleaned = mutable as String
        cleaned = cleaned.replacingOccurrences(
            of: "[ \\t]{2,}",
            with: " ",
            options: .regularExpression
        )
        cleaned = cleaned.trimmingCharacters(in: .whitespacesAndNewlines)
        return (cleaned, urls)
    }
}

/// Résolution d'un `NSItemProvider` (dépôt ou collage) en `ComposerIngest`.
///
/// Ordre, premier succès gagnant :
/// 1. représentation FICHIER — copie synchrone DANS la closure de
///    `loadFileRepresentation` : c'est la seule fenêtre où le système accorde
///    l'accès, le fichier source disparaît au retour de la closure ;
/// 2. représentation DONNÉES pour une image sans fichier (capture, contenu
///    d'une page web) ;
/// 3. texte ou URL — une URL web devient du texte inséré dans le champ.
///
/// Refusés (nil) : un dossier, un fichier de 0 octet, un provider vide.
/// Aucun plafond de taille : consigné hors périmètre par la spec.
nonisolated enum ComposerDropResolver {

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "composer-drop")

    static func resolve(_ provider: NSItemProvider) async -> ComposerIngest? {
        let registeredTypes = provider.registeredTypeIdentifiers.compactMap(UTType.init)

        // Un dossier déposé est refusé d'emblée — jamais ingéré comme
        // fichier, jamais rendu comme texte de chemin.
        if registeredTypes.contains(where: { $0.conforms(to: .directory) }) {
            logger.info("Dépôt refusé : le provider représente un dossier")
            return nil
        }

        // 1. Représentation fichier — premier identifiant enregistré qui
        // conforme à un type de fichier (des octets concrets, ni texte ni URL).
        if let fileTypeIdentifier = provider.registeredTypeIdentifiers.first(where: { identifier in
            guard let type = UTType(identifier) else { return false }
            return isFileLike(type)
        }) {
            let originalName = await originalFileName(of: provider)
            if let copied = await copyFileRepresentation(
                of: provider,
                typeIdentifier: fileTypeIdentifier,
                originalName: originalName
            ) {
                return .file(
                    url: copied.url,
                    name: copied.name,
                    mime: MimeTypeResolver.mimeType(forURL: copied.url)
                )
            }
        }

        // 2. Représentation données — image sans fichier sous-jacent.
        if let imageTypeIdentifier = provider.registeredTypeIdentifiers.first(where: {
            UTType($0)?.conforms(to: .image) == true
        }) {
            if let written = await writeDataRepresentation(of: provider, typeIdentifier: imageTypeIdentifier) {
                return .file(
                    url: written.url,
                    name: written.name,
                    mime: MimeTypeResolver.mimeType(forURL: written.url)
                )
            }
        }

        // 3. Texte, puis URL. Une URL web devient du texte ; une URL de
        // fichier sans représentation fichier est une lecture morte — on ne
        // fabrique pas de repli, on refuse.
        //
        // Le filtre `looksLikeFileURL` n'est pas une précaution de style :
        // un provider construit sur un DOSSIER, ou sur un fichier de 0 octet,
        // sait aussi se charger en `NSString` et rend alors son chemin
        // `file://…`. Sans ce filtre, un dossier refusé plus haut ressortait
        // en `.text("file:///…/Dossier/")` — l'utilisateur voyait un chemin
        // brut atterrir dans son champ de saisie au lieu d'un toast d'échec.
        if provider.canLoadObject(ofClass: NSString.self),
           let text = await loadString(from: provider),
           !text.isEmpty,
           !looksLikeFileURL(text) {
            return .text(text)
        }
        if provider.canLoadObject(ofClass: NSURL.self),
           let url = await loadURL(from: provider) {
            guard !url.isFileURL else {
                logger.info("Dépôt refusé : URL de fichier sans représentation fichier exploitable")
                return nil
            }
            return .text(url.absoluteString)
        }

        return nil
    }

    // MARK: - Détail des étapes

    /// `true` quand la chaîne chargée n'est en réalité que le CHEMIN d'un
    /// fichier que les étapes 1 et 2 n'ont pas su lire. Rendre ce chemin comme
    /// texte serait un repli fabriqué qui masque une lecture morte.
    private static func looksLikeFileURL(_ text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.lowercased().hasPrefix("file://") else { return false }
        return URL(string: trimmed)?.isFileURL == true
    }

    /// Un type « fichier » : des octets concrets (`.data`), mais ni du texte
    /// ni une URL — ceux-là passent par l'étape 3 et finissent dans le champ.
    private static func isFileLike(_ type: UTType) -> Bool {
        guard type.conforms(to: .data) else { return false }
        if type.conforms(to: .text) || type.conforms(to: .url) { return false }
        return true
    }

    /// Copie SYNCHRONE, dans la closure de `loadFileRepresentation`, vers
    /// `temporaryDirectory/drop_<uuid>_<nom>`. Après le retour de la closure
    /// le fichier source du système disparaît — c'est la seule fenêtre.
    private static func copyFileRepresentation(
        of provider: NSItemProvider,
        typeIdentifier: String,
        originalName: String?
    ) async -> (url: URL, name: String)? {
        let suggestedName = provider.suggestedName
        return await withCheckedContinuation { continuation in
            _ = provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { sourceURL, error in
                guard let sourceURL else {
                    if let error {
                        logger.error("loadFileRepresentation(\(typeIdentifier, privacy: .public)) a échoué : \(error.localizedDescription, privacy: .public)")
                    }
                    continuation.resume(returning: nil)
                    return
                }
                do {
                    let values = try sourceURL.resourceValues(forKeys: [.isDirectoryKey, .fileSizeKey])
                    if values.isDirectory == true {
                        logger.info("Dépôt refusé : la représentation fichier est un dossier")
                        continuation.resume(returning: nil)
                        return
                    }
                    guard (values.fileSize ?? 0) > 0 else {
                        logger.info("Dépôt refusé : fichier de 0 octet")
                        continuation.resume(returning: nil)
                        return
                    }
                    let name = resolvedName(
                        original: originalName,
                        suggested: suggestedName,
                        sourceURL: sourceURL
                    )
                    let destination = FileManager.default.temporaryDirectory
                        .appendingPathComponent("drop_\(UUID().uuidString)_\(name)")
                    try FileManager.default.copyItem(at: sourceURL, to: destination)
                    continuation.resume(returning: (destination, name))
                } catch {
                    logger.error("Copie du fichier déposé impossible : \(error.localizedDescription, privacy: .public)")
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    /// Écrit une représentation données (image sans fichier) en temporaire,
    /// avec l'extension dérivée du type.
    private static func writeDataRepresentation(
        of provider: NSItemProvider,
        typeIdentifier: String
    ) async -> (url: URL, name: String)? {
        let suggestedName = provider.suggestedName
        let ext = UTType(typeIdentifier)?.preferredFilenameExtension ?? "bin"
        return await withCheckedContinuation { continuation in
            _ = provider.loadDataRepresentation(forTypeIdentifier: typeIdentifier) { data, error in
                guard let data, !data.isEmpty else {
                    if let error {
                        logger.error("loadDataRepresentation(\(typeIdentifier, privacy: .public)) a échoué : \(error.localizedDescription, privacy: .public)")
                    } else {
                        logger.info("Dépôt refusé : représentation données vide")
                    }
                    continuation.resume(returning: nil)
                    return
                }
                var name: String
                if let suggested = suggestedName?.trimmingCharacters(in: .whitespacesAndNewlines),
                   !suggested.isEmpty {
                    name = suggested.replacingOccurrences(of: "/", with: "_")
                    if (name as NSString).pathExtension.isEmpty {
                        name += ".\(ext)"
                    }
                } else {
                    name = "image.\(ext)"
                }
                let destination = FileManager.default.temporaryDirectory
                    .appendingPathComponent("drop_\(UUID().uuidString)_\(name)")
                do {
                    try data.write(to: destination)
                    continuation.resume(returning: (destination, name))
                } catch {
                    logger.error("Écriture des données déposées impossible : \(error.localizedDescription, privacy: .public)")
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    private static func loadString(from provider: NSItemProvider) async -> String? {
        await withCheckedContinuation { continuation in
            _ = provider.loadObject(ofClass: NSString.self) { object, error in
                if let error {
                    logger.error("loadObject(NSString) a échoué : \(error.localizedDescription, privacy: .public)")
                }
                continuation.resume(returning: (object as? NSString).map { $0 as String })
            }
        }
    }

    private static func loadURL(from provider: NSItemProvider) async -> URL? {
        await withCheckedContinuation { continuation in
            _ = provider.loadObject(ofClass: NSURL.self) { object, error in
                if let error {
                    logger.error("loadObject(NSURL) a échoué : \(error.localizedDescription, privacy: .public)")
                }
                continuation.resume(returning: (object as? NSURL).map { $0 as URL })
            }
        }
    }

    /// Nom du fichier d'ORIGINE, lu sur la représentation `public.file-url`.
    ///
    /// C'est le seul endroit où le vrai nom survit. Ni `suggestedName` ni le
    /// fichier temporaire de `loadFileRepresentation` ne sont fiables : quand
    /// le provider n'expose pas de nom propre, le système les fabrique tous
    /// deux à partir de la description LOCALISÉE du type. Un PDF nommé
    /// « rapport final.pdf » ressortait ainsi « PDF document.pdf » en anglais
    /// — et « document PDF.pdf » sur un appareil en français. Le nom de la
    /// pièce jointe reçue dépendait donc de la langue de l'expéditeur.
    ///
    /// Seul le NOM est lu ; les octets passent par `loadFileRepresentation`.
    /// Aucun `startAccessingSecurityScopedResource` n'est demandé : lire
    /// `lastPathComponent` n'ouvre pas le fichier.
    private static func originalFileName(of provider: NSItemProvider) async -> String? {
        guard provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier),
              let url = await loadURL(from: provider),
              url.isFileURL else { return nil }
        let name = url.lastPathComponent
        return name.isEmpty ? nil : name
    }

    /// Nom retenu, du plus fiable au moins fiable : le nom d'origine, puis
    /// celui du fichier livré, puis `provider.suggestedName`.
    ///
    /// Si le nom retenu n'a pas d'extension mais qu'une des autres sources en
    /// a une, elle est rattachée — le MIME en dépend.
    private static func resolvedName(
        original: String?,
        suggested: String?,
        sourceURL: URL
    ) -> String {
        let candidates = [original, sourceURL.lastPathComponent, suggested]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard var name = candidates.first else { return "fichier" }
        name = name.replacingOccurrences(of: "/", with: "_")
        if (name as NSString).pathExtension.isEmpty {
            let fallbackExtension = candidates
                .lazy
                .map { ($0 as NSString).pathExtension }
                .first { !$0.isEmpty } ?? sourceURL.pathExtension
            if !fallbackExtension.isEmpty { name += ".\(fallbackExtension)" }
        }
        return name
    }
}
