import Foundation
import UIKit
import MeeshySDK
import MeeshyUI

/// **L'aller et le retour entre l'état du meuble et le brouillon sur disque**
/// (#8848) — deux fonctions pures, pour qu'un témoin prouve l'aller-retour sans
/// monter la vue.
///
/// Chaque URL de l'état devient un nom de fichier à l'aller et redevient une
/// URL (celle de la copie de session) au retour, par la MÊME table : c'est ce
/// qui garde les huit porteurs cohérents entre eux, clés par URL. Un porteur
/// remappé à part d'un autre rouvrirait le composer avec un média posé deux
/// fois — `syncPostMediaIntoSlides` ne reconnaît un média déjà posé qu'à son URL.
nonisolated enum ComposerAutosaveCodec {

    static func write(from state: ComposerAutosaveState, now: Date = Date()) -> ComposerAutosaveWrite {
        var files: [String: URL] = [:]
        var aliases: [String: String] = [:]
        let copies = sceneCopies(state)
        func name(_ url: URL) -> String {
            let fichier = ComposerAutosaveFileName.forSource(url)
            guard let source = copies[url.standardizedFileURL] else {
                files[fichier] = url
                return fichier
            }
            let canon = ComposerAutosaveFileName.forSource(source)
            files[canon] = source
            if canon != fichier { aliases[fichier] = canon }
            return fichier
        }
        func names<V>(_ map: [URL: V]) -> [String: V] {
            Dictionary(map.map { (name($0.key), $0.value) }, uniquingKeysWith: { premier, _ in premier })
        }
        let porters = state.porters
        let media = porters.localMedia.map {
            ComposerAutosaveSnapshot.Media(file: name($0.url), mimeType: $0.mimeType, durationMs: $0.durationMs)
        }
        var blobs: [String: Data] = [:]
        let stickers: [String: String] = state.stickerAnimations.reduce(into: [:]) { carte, entree in
            let fichier = ComposerAutosaveFileName.forBlob(key: entree.key)
            blobs[fichier] = entree.value
            carte[entree.key] = fichier
        }
        let slides = portable(state.slides, adopted: state.adoptedLocalMedia, name: name)
        let table = bitmapTable(images: state.images, slideImages: state.slideImages,
                                sources: plainImageSources(slides).mapValues { aliases[$0] ?? $0 })
        let snapshot = ComposerAutosaveSnapshot(
            savedAt: now,
            format: ComposerAutosaveFormatCode.code(state.format),
            text: state.text,
            background: state.background,
            visibility: state.visibility,
            visibilityUserIds: state.visibilityUserIds,
            language: state.language,
            location: state.location,
            references: state.references.map {
                .init(username: $0.username, userId: $0.userId, display: $0.display,
                      publicationKey: $0.publicationKey)
            },
            editingPostId: state.editingPostId,
            slides: slides,
            currentSlideIndex: state.currentSlideIndex,
            localMedia: media,
            roleByFile: names(porters.roleByURL).mapValues(\.rawValue),
            slideIdByFile: names(porters.slideIdByMediaURL),
            objectIdByFile: names(porters.objectIdBySource),
            captionByFile: names(porters.captions),
            altsByObjectId: porters.altsByObjectId,
            transcriptionByFile: names(porters.transcriptions),
            railPosedFiles: porters.railPosedURLs.map(name).sorted(),
            images: table.images,
            slideImages: table.slideImages,
            videos: state.videos.mapValues(name),
            audios: state.audios.mapValues(name),
            stickerAnimations: stickers,
            publishChoice: state.publishChoice.map {
                .init(format: ComposerAutosaveFormatCode.code($0.format), layout: $0.layout?.rawValue)
            },
            fileAliases: aliases.isEmpty ? nil : aliases
        )
        return ComposerAutosaveWrite(snapshot: snapshot, files: files, bitmaps: table.bitmaps, blobs: blobs)
    }

    /// Le retour. Une matière perdue (fichier purgé, copie ratée) fait tomber
    /// sa seule entrée, jamais le brouillon entier : le reste de la création
    /// revient.
    static func state(from restored: ComposerAutosaveRestored) -> ComposerAutosaveState? {
        let snapshot = restored.snapshot
        guard snapshot.version == ComposerAutosaveSnapshot.currentVersion,
              let format = ComposerAutosaveFormatCode.format(snapshot.format) else { return nil }
        let urls = restored.urlByFile
        func byURL<V>(_ map: [String: V]) -> [URL: V] {
            map.reduce(into: [:]) { carte, entree in
                guard let url = urls[entree.key] else { return }
                carte[url] = entree.value
            }
        }
        func bitmaps(_ map: [String: String]) -> [String: UIImage] {
            map.compactMapValues { restored.bitmapByFile[$0] }
        }
        let localMedia = snapshot.localMedia.compactMap { media -> ComposerDocumentMedia? in
            guard let url = urls[media.file] else { return nil }
            return ComposerDocumentMedia(url: url, mimeType: media.mimeType, durationMs: media.durationMs)
        }
        let porters = ComposerMediaPorters(
            localMedia: localMedia,
            roleByURL: byURL(snapshot.roleByFile).compactMapValues(ComposerMediaRole.init(rawValue:)),
            slideIdByMediaURL: byURL(snapshot.slideIdByFile),
            objectIdBySource: byURL(snapshot.objectIdByFile),
            captions: byURL(snapshot.captionByFile),
            altsByObjectId: snapshot.altsByObjectId,
            transcriptions: byURL(snapshot.transcriptionByFile),
            railPosedURLs: Set(snapshot.railPosedFiles.compactMap { urls[$0] })
        )
        let relues = rehydrated(snapshot.slides, urls: urls)
        let slides = relues.isEmpty ? [StorySlide()] : relues
        return ComposerAutosaveState(
            format: format,
            text: snapshot.text,
            background: snapshot.background,
            visibility: snapshot.visibility,
            visibilityUserIds: snapshot.visibilityUserIds,
            language: snapshot.language,
            location: snapshot.location,
            references: snapshot.references.map {
                ComposerReference(username: $0.username, userId: $0.userId, display: $0.display,
                                  publicationKey: $0.publicationKey)
            },
            editingPostId: snapshot.editingPostId,
            slides: slides,
            currentSlideIndex: min(max(0, snapshot.currentSlideIndex), slides.count - 1),
            porters: porters,
            images: bitmaps(snapshot.images),
            slideImages: bitmaps(snapshot.slideImages),
            videos: snapshot.videos.compactMapValues { urls[$0] },
            audios: snapshot.audios.compactMapValues { urls[$0] },
            stickerAnimations: snapshot.stickerAnimations.compactMapValues { restored.blobByFile[$0] },
            publishChoice: snapshot.publishChoice.flatMap { choix in
                ComposerAutosaveFormatCode.format(choix.format).map {
                    ComposerPublishChoice(format: $0, layout: choix.layout.flatMap(MosaicLayoutMode.init(rawValue:)))
                }
            }
        )
    }

    // MARK: - Une photo, une adresse dans le brouillon (#9420)

    /// **La copie de POSE d'un média, rendue à sa pièce jointe.**
    ///
    /// Un média importé a DEUX adresses : la pièce jointe du document garde le
    /// fichier du sélecteur (`localMedia` et les porteurs), et la pose
    /// (`applyContentMedia`) le COPIE octet pour octet sous
    /// `tmp/<objectId>.<ext>` — la convention qui relie le bitmap de la scène à
    /// son objet. L'objet de scène désigne la copie (`mediaURL`, puis
    /// `adoptedLocalMedia` une fois pré-monté). Nommés par adresse, les deux
    /// s'écrivaient : 6 fichiers pour 3 photos (recette #9420).
    ///
    /// L'identité vient du pont `objectIdBySource` — la pose est le seul site
    /// qui connaisse les deux bouts, et elle l'a rendu. La taille, lue par un
    /// `stat`, écarte une copie que l'objet aurait remplacée depuis ; aucun
    /// octet n'est relu.
    ///
    /// - Returns: copie → pièce jointe, clé normalisée (`standardizedFileURL`).
    static func sceneCopies(_ state: ComposerAutosaveState) -> [URL: URL] {
        let sourceParObjet = state.porters.objectIdBySource.reduce(into: [String: URL]()) { carte, entree in
            carte[entree.value] = entree.key
        }
        guard !sourceParObjet.isEmpty else { return [:] }
        let adopted = state.adoptedLocalMedia
        return state.slides.flatMap { $0.effects.mediaObjects ?? [] }.reduce(into: [:]) { carte, objet in
            guard let source = sourceParObjet[objet.id] else { return }
            let fichier: URL? = objet.mediaURL.flatMap(URL.init(string:)).flatMap { $0.isFileURL ? $0 : nil }
                ?? (objet.postMediaId.isEmpty ? nil : adopted[objet.postMediaId])
                ?? objet.mediaURL.flatMap { adopted[$0] }
            guard let copie = fichier?.standardizedFileURL,
                  copie != source.standardizedFileURL,
                  let taille = fileSize(copie), taille == fileSize(source) else { return }
            carte[copie] = source
        }
    }

    private static func fileSize(_ url: URL) -> Int? {
        (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.intValue
    }

    // MARK: - Une copie par image (#9420)

    /// **Une image de scène = UN fichier du brouillon.**
    ///
    /// Un même bitmap est rangé sous plusieurs clés : l'id de l'objet, puis,
    /// une fois l'objet pré-monté, son `postMediaId` et son adresse distante
    /// (`relayLoadedImage`) — parfois aussi comme fond de sa slide. Nommé par
    /// clé, il s'écrivait autant de fois : 15 fichiers pour 3 photos (recette
    /// #6922). Les clés se regroupent donc par IMAGE, et chaque groupe désigne
    /// un seul fichier :
    /// - le fichier SOURCE de l'objet quand le bitmap n'en est que le décodage
    ///   (image non recadrée) — la relecture le décode à la taille publiée,
    ///   exactement comme la pose ;
    /// - sinon un JPEG unique, nommé par la plus petite de ses clés : stable
    ///   d'une sauvegarde à l'autre, et identique au nom d'avant quand l'image
    ///   n'a qu'une clé.
    static func bitmapTable(images: [String: UIImage],
                            slideImages: [String: UIImage],
                            sources: [String: String])
        -> (images: [String: String], slideImages: [String: String], bitmaps: [String: UIImage]) {
        let entrees = images.map { BitmapEntry(family: "i", key: $0.key, image: $0.value) }
            + slideImages.map { BitmapEntry(family: "b", key: $0.key, image: $0.value) }
        let groupes = Dictionary(grouping: entrees) { ObjectIdentifier($0.image) }
        let fichiers = groupes.mapValues { membres -> (file: String, bitmap: UIImage?) in
            let source = membres.filter { $0.family == "i" }.compactMap { sources[$0.key] }.min()
            if let source { return (source, nil) }
            let canon = membres.min { ($0.family, $0.key) < ($1.family, $1.key) } ?? membres[0]
            return (ComposerAutosaveFileName.forBitmap(key: canon.key, family: canon.family), canon.image)
        }
        func noms(_ map: [String: UIImage]) -> [String: String] {
            map.compactMapValues { fichiers[ObjectIdentifier($0)]?.file }
        }
        let bitmaps = fichiers.values.reduce(into: [String: UIImage]()) { carte, entree in
            if let image = entree.bitmap { carte[entree.file] = image }
        }
        return (noms(images), noms(slideImages), bitmaps)
    }

    private struct BitmapEntry {
        let family: String
        let key: String
        let image: UIImage
    }

    /// Les objets IMAGE non recadrés dont le fichier est dans le brouillon :
    /// leur bitmap se relit depuis ce fichier. Un recadrage (ou une vidéo,
    /// dont le bitmap est une vignette) garde sa propre copie.
    static func plainImageSources(_ slides: [StorySlide]) -> [String: String] {
        slides.flatMap { $0.effects.mediaObjects ?? [] }.reduce(into: [:]) { carte, objet in
            guard objet.kind == .image, objet.crop.map(\.isFull) ?? true,
                  let reference = objet.mediaURL, reference.hasPrefix(fileReferencePrefix) else { return }
            carte[objet.id] = String(reference.dropFirst(fileReferencePrefix.count))
        }
    }

    // MARK: - Des scènes qui ne dépendent d'aucun serveur

    /// Le préfixe d'un fichier du brouillon dans les scènes écrites sur disque.
    static let fileReferencePrefix = "meeshy-autosave:"

    /// **Une scène sauvegardée ne désigne QUE des fichiers du brouillon.**
    ///
    /// Un objet PRÉ-MONTÉ porte un `postMediaId` et une URL distante ; le
    /// serveur balaie à 24 h tout média qu'aucune publication ne cite. Relu le
    /// lendemain, un tel objet publierait un identifiant mort. Il redevient donc
    /// LOCAL à l'écriture — son fichier (`adoptedLocalMedia`) rejoint le
    /// brouillon, et la publication le fera monter de nouveau.
    static func portable(_ slides: [StorySlide], adopted: [String: URL],
                         name: (URL) -> String) -> [StorySlide] {
        func reference(_ postMediaId: String, _ mediaURL: String?) -> (String, String?) {
            if !postMediaId.isEmpty, let local = adopted[postMediaId] ?? mediaURL.flatMap({ adopted[$0] }) {
                return ("", fileReferencePrefix + name(local))
            }
            guard let brut = mediaURL, let url = URL(string: brut), url.isFileURL else {
                return (postMediaId, mediaURL)
            }
            return (postMediaId, fileReferencePrefix + name(url))
        }
        return slides.map { slide in
            var copie = slide
            copie.effects.mediaObjects = slide.effects.mediaObjects?.map { objet in
                var local = objet
                (local.postMediaId, local.mediaURL) = reference(objet.postMediaId, objet.mediaURL)
                return local
            }
            copie.effects.audioPlayerObjects = slide.effects.audioPlayerObjects?.map { objet in
                var local = objet
                (local.postMediaId, local.mediaURL) = reference(objet.postMediaId, objet.mediaURL)
                return local
            }
            return copie
        }
    }

    /// Le retour : chaque référence de brouillon redevient l'URL de sa copie de
    /// session. Une référence dont le fichier est perdu reste sans URL — l'objet
    /// garde sa place, et la publication le signalera plutôt que d'envoyer un
    /// chemin mort.
    static func rehydrated(_ slides: [StorySlide], urls: [String: URL]) -> [StorySlide] {
        func url(_ mediaURL: String?) -> String? {
            guard let brut = mediaURL, brut.hasPrefix(fileReferencePrefix) else { return mediaURL }
            return urls[String(brut.dropFirst(fileReferencePrefix.count))]?.absoluteString
        }
        return slides.map { slide in
            var copie = slide
            copie.effects.mediaObjects = slide.effects.mediaObjects?.map { objet in
                var local = objet
                local.mediaURL = url(objet.mediaURL)
                return local
            }
            copie.effects.audioPlayerObjects = slide.effects.audioPlayerObjects?.map { objet in
                var local = objet
                local.mediaURL = url(objet.mediaURL)
                return local
            }
            return copie
        }
    }
}
