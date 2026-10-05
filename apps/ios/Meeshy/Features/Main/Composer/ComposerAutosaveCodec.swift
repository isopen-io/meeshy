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
        func name(_ url: URL) -> String {
            let fichier = ComposerAutosaveFileName.forSource(url)
            files[fichier] = url
            return fichier
        }
        func names<V>(_ map: [URL: V]) -> [String: V] {
            Dictionary(map.map { (name($0.key), $0.value) }, uniquingKeysWith: { premier, _ in premier })
        }
        let porters = state.porters
        let media = porters.localMedia.map {
            ComposerAutosaveSnapshot.Media(file: name($0.url), mimeType: $0.mimeType, durationMs: $0.durationMs)
        }
        var bitmaps: [String: UIImage] = [:]
        func bitmapNames(_ map: [String: UIImage], family: String) -> [String: String] {
            map.reduce(into: [:]) { carte, entree in
                let fichier = ComposerAutosaveFileName.forBitmap(key: entree.key, family: family)
                bitmaps[fichier] = entree.value
                carte[entree.key] = fichier
            }
        }
        var blobs: [String: Data] = [:]
        let stickers: [String: String] = state.stickerAnimations.reduce(into: [:]) { carte, entree in
            let fichier = ComposerAutosaveFileName.forBlob(key: entree.key)
            blobs[fichier] = entree.value
            carte[entree.key] = fichier
        }
        let slides = portable(state.slides, adopted: state.adoptedLocalMedia, name: name)
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
            images: bitmapNames(state.images, family: "i"),
            slideImages: bitmapNames(state.slideImages, family: "b"),
            videos: state.videos.mapValues(name),
            audios: state.audios.mapValues(name),
            stickerAnimations: stickers
        )
        return ComposerAutosaveWrite(snapshot: snapshot, files: files, bitmaps: bitmaps, blobs: blobs)
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
            stickerAnimations: snapshot.stickerAnimations.compactMapValues { restored.blobByFile[$0] }
        )
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
