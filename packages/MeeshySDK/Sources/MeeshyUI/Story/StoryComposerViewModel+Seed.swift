import SwiftUI
import UIKit
import AVFoundation
import MeeshySDK

// MARK: - La GRAINE du composer

/// **Ce qu'une porte pose dans l'atelier avant qu'il ne s'ouvre.**
///
/// OPAQUE, et c'est la condition de sa pureté : le SDK ne sait pas d'où ce
/// média vient — ni pièce jointe, ni cache, ni la moindre règle « quand
/// semer ». Il reçoit un bitmap ou un fichier, et les pose.
///
/// Ni `Sendable` ni `Equatable` : `UIImage` n'est proprement ni l'un ni
/// l'autre, la graine est construite et consommée sur le main actor, et
/// aucune garde ne les exige — contrairement à `ComposerMoodSeed`, qui
/// voyage, lui, par la file durable.
public struct StoryComposerSeed {

    public enum Payload {
        /// Un bitmap **DÉJÀ DÉCODÉ**. Le décodage appartient à l'appelant, qui
        /// est déjà dans un contexte asynchrone (il vient de matérialiser le
        /// fichier) — et il DOIT l'être, parce que la pose, elle, doit rester
        /// SYNCHRONE : le fond de slide est recopié dans un `@State` de la vue
        /// par `restoreCanvas(from:)`, un INSTANTANÉ qui ne relit jamais ce qui
        /// arrive après lui.
        case image(UIImage)
        /// Un fichier LOCAL **déjà copié sous la convention du composer**
        /// (`{objectId}.{ext}`), et l'identifiant d'objet qui le nomme.
        ///
        /// La copie appartient à la GRAINE, pas à la construction du ViewModel,
        /// et le type le dit : il ne porte plus la source, donc `init(seeding:)`
        /// ne PEUT plus recopier. Ce n'est pas un raffinement de style —
        /// `MeeshyComposerHost.init` construit son ViewModel de manière ÉAGRE,
        /// si bien que chaque réévaluation du `body` de la porte en fabrique un
        /// de plus, dont un seul survit. Une copie de fichier logée là s'exécutait
        /// à chaque passe de rendu, sur le MAIN ACTOR, et rien ne balaie `tmp/`
        /// (`cleanupTempFiles` n'a aucun appelant de production ; `deinit`
        /// n'annule que `preloadTask`).
        case video(fileURL: URL, objectId: String)
    }

    public let payload: Payload

    public init(payload: Payload) {
        self.payload = payload
    }

    /// **La fabrique de la graine VIDÉO — le SEUL site qui copie.**
    ///
    /// Elle copie plutôt qu'elle ne référence parce que le fichier que la porte
    /// lui remet vient du `DiskCacheStore`, soumis à ÉVICTION par mtime : une
    /// éviction entre l'ouverture de l'atelier et l'envoi ferait échouer l'upload
    /// d'une vidéo déjà composée, sans un mot.
    ///
    /// `nil` quand la source n'existe pas ou que la copie échoue — l'appelant
    /// n'ouvre alors RIEN, et le DIT. Un objet sans actif chargé serait sauté par
    /// `runStoryUpload` avec son log « layer will be invisible to viewers » : une
    /// couche déclarée que personne ne verrait jamais.
    ///
    /// À appeler depuis un contexte qui ne s'exécute QU'UNE FOIS par ouverture —
    /// la matérialisation de la porte, jamais un `init` de `View`.
    public static func video(copying source: URL) -> StoryComposerSeed? {
        let objectId = UUID().uuidString
        guard let copied = StoryComposerSeedFile.copyForComposer(
            source: source, objectId: objectId) else { return nil }
        return StoryComposerSeed(payload: .video(fileURL: copied, objectId: objectId))
    }
}

/// La copie sous la convention de nom du composer, isolée pour être lisible
/// d'un coup d'œil : c'est elle qui relie `obj.id` au `composerKey` que
/// `StoryBackgroundLayer` dérive du fichier.
enum StoryComposerSeedFile {

    /// `nil` quand la source n'existe pas ou que la copie échoue — l'appelant
    /// ne pose alors AUCUN objet. Un objet sans actif chargé serait sauté par
    /// `runStoryUpload` avec son log « layer will be invisible to viewers » :
    /// une couche déclarée que personne ne verrait jamais.
    /// `declaredMimeType` — le mime que la SOURCE a annoncé (#4038). Il décide
    /// de l'extension quand l'URL n'en porte aucune : le nom du fichier copié
    /// est ce que tout l'aval relit pour étiqueter le téléversement
    /// (`MimeTypeResolver.mimeType(forURL:)`), si bien qu'un repli codé en dur
    /// baptisait « mov » une vidéo qui ne l'était pas. `nil` ⇒ repli historique.
    static func copyForComposer(source: URL, objectId: String,
                                declaredMimeType: String? = nil) -> URL? {
        guard FileManager.default.fileExists(atPath: source.path) else { return nil }
        let ext = ComposerContentMediaFile.fileExtension(
            sourceURL: source,
            declaredMimeType: declaredMimeType,
            fallback: "mov"
        )
        let destination = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(objectId).\(ext)")
        try? FileManager.default.removeItem(at: destination)
        do {
            try FileManager.default.copyItem(at: source, to: destination)
        } catch {
            return nil
        }
        return destination
    }
}

// MARK: - StoryComposerViewModel + Seed

public extension StoryComposerViewModel {

    /// Ouvre le composer sur un média DÉJÀ posé.
    ///
    /// Jumeau d'`init(reposting:authorHandle:)` — même foyer (la CONSTRUCTION,
    /// seul moment que le `@StateObject` du meuble laisse passer), même forme
    /// (un slide, `currentSlideIndex = 0`). Trois choses l'en séparent, et
    /// chacune est un REFUS mesuré :
    ///
    /// - **aucune chaîne de republication** : une graine n'est pas un repost
    ///   (O13 — « aucune référence automatique vers l'expéditeur ») ;
    /// - **aucun badge d'attribution verrouillé** : `isLocked: true` est
    ///   l'apanage exclusif du repost, et l'afficher sur un média reçu EN PRIVÉ
    ///   divulguerait son expéditeur ;
    /// - **aucun préchargement distant** : la graine est LOCALE, toujours.
    ///
    /// **L'asymétrie image / vidéo est mesurée.** Le FOND n'a aucun chemin de
    /// rafraîchissement (l'instantané de `restoreCanvas`) : il se pose donc
    /// entièrement, synchroniquement. Le PREMIER PLAN, lui, se rafraîchit par
    /// `loadedImagesVersion` : sa vignette, son ratio et sa durée peuvent
    /// arriver après, ce qui évite de décoder une piste vidéo sur le main actor
    /// pendant qu'une `View` se construit.
    convenience init(seeding seed: StoryComposerSeed) {
        self.init()

        switch seed.payload {
        case .image(let bitmap):
            // `slideImages`, et pas `loadedImages` : `runStoryUpload` n'envoie
            // un FOND que depuis `upload.slideImages[slide.id]`. Posé ailleurs,
            // le média s'afficherait sans jamais partir.
            setImage(bitmap, for: currentSlide.id)
            hasBackgroundImage = true
            isSeededSession = true

        case .video(let copied, let objectId):
            // AUCUNE écriture disque ici : la copie a été faite UNE fois, à la
            // fabrique de la graine. Ce qui reste est une vérification —
            // le fichier a pu être balayé entre la fabrique et l'ouverture —,
            // et poser l'objet quand même produirait une couche « invisible aux
            // lecteurs ».
            guard FileManager.default.fileExists(atPath: copied.path) else { return }
            let slideId = currentSlide.id
            guard let object = insertForegroundVideo(
                    url: copied,
                    thumbnail: nil,
                    aspectRatio: nil,
                    duration: nil,
                    intoSlideId: slideId,
                    objectId: objectId) else {
                // Le plafond a refusé l'objet. La copie n'est PAS supprimée :
                // elle appartient à la graine, qui peut encore semer un autre
                // atelier — la détruire ici viderait celui qui survit.
                return
            }
            isSeededSession = true

            // Ce que `loadedVideoURLs[obj.id]` porte déjà suffit à l'ENVOI ;
            // ce qui suit n'affine que le RENDU, et passe par les mêmes
            // écrivains que le chemin caméra — donc par le bump de version que
            // le canvas attend. `preloadTask` est la poignée que le `deinit`
            // annule : une session refermée ne finit pas de décoder.
            let resolvedId = object.id
            preloadTask = Task { [weak self] in
                let thumbnail = await StoryMediaLoader.shared.videoThumbnail(url: copied, maxDimension: 400)
                let asset = AVURLAsset(url: copied)
                var mediaDuration: Float?
                if let cmDur = try? await asset.load(.duration) {
                    let secs = CMTimeGetSeconds(cmDur)
                    if secs > 0, secs.isFinite { mediaDuration = Float(secs) }
                }
                var videoAspectRatio: Double?
                if let track = try? await asset.loadTracks(withMediaType: .video).first,
                   let natural = try? await track.load(.naturalSize),
                   let transform = try? await track.load(.preferredTransform) {
                    let effective = natural.applying(transform)
                    let w = abs(effective.width)
                    let h = abs(effective.height)
                    if w > 0, h > 0 { videoAspectRatio = Double(w / h) }
                }
                guard !Task.isCancelled, let self else { return }
                if let thumbnail { self.registerLoadedImage(thumbnail, for: resolvedId) }
                if let videoAspectRatio {
                    self.setMediaAspectRatio(id: resolvedId, aspectRatio: videoAspectRatio, slideId: slideId)
                }
                if let mediaDuration {
                    self.setMediaDuration(id: resolvedId, duration: mediaDuration, slideId: slideId)
                    self.autoExtendDuration(forElementEnd: mediaDuration, slideId: slideId)
                }
            }
        }
    }
}
