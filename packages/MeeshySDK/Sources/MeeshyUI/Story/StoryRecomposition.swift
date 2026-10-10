import Foundation
import MeeshySDK

/// **Ce que « Composer » reprend d'une story publiée : la SCÈNE entière** (#9994).
///
/// La porte ne reprenait que le premier média et le texte : les textes posés,
/// les stickers, les effets et tout média au-delà du premier restaient derrière,
/// et une slide à plusieurs médias n'offrait pas « Composer » du tout. La règle
/// part désormais de la scène que le LECTEUR peint (`toRenderableSlide`), objets,
/// positions, timeline et sons compris.
///
/// ## Une scène REPRISE n'est pas une scène ÉDITÉE
///
/// L'édition (`init(editing:)`) garde chaque `postMediaId` : elle met à jour la
/// MÊME publication, dont les médias restent les siens. Une recomposition crée
/// une publication NEUVE, et ses médias ne peuvent pas être ceux d'un autre post :
/// le serveur ne rattache que les médias LIBRES téléversés par l'auteur
/// (`claimableMediaWhere`), si bien qu'un identifiant emprunté resterait au post
/// d'origine — et la scène se viderait le jour où celui-ci expire. Chaque média
/// est donc DÉTACHÉ (`postMediaId` vide) et listé dans `assets` : la porte le
/// matérialise, et la publication le téléverse sous le nouvel auteur, par le
/// chemin de n'importe quel média posé.
///
/// Ce qui ne peut pas se téléverser de nouveau part avec la source : les pistes
/// TTS du son (elles se régénèrent pour la publication neuve), la voix legacy et
/// le snapshot `canvasV3` du fil. Les crédits de republication VERROUILLÉS aussi :
/// recomposer n'est pas republier, et aucun badge n'est imposé.
///
/// Pure : aucune URL n'est résolue ni téléchargée ici — c'est l'affaire de l'app.
public nonisolated struct StoryRecomposition: Sendable {

    public enum AssetKind: String, Equatable, Sendable {
        /// Le fond IMAGE hérité de la slide (`slide.mediaURL`), rangé sous l'id de slide.
        case backgroundImage
        case image
        case video
        case audio
        case stickerImage
    }

    /// Un média à rapatrier sous `objectId`, l'identité qu'il garde dans la scène.
    public struct Asset: Equatable, Sendable {
        public let objectId: String
        public let kind: AssetKind
        public let remoteURL: String
    }

    /// La slide prête à poser, chaque média détaché de son post d'origine.
    public let slide: StorySlide
    public let assets: [Asset]

    /// Le texte de la story, résolu par le Prisme du lecteur.
    public var description: String? {
        guard let content = slide.content?.trimmingCharacters(in: .whitespacesAndNewlines),
              !content.isEmpty else { return nil }
        return content
    }

    /// `nil` quand la scène ne peut pas se reprendre À L'IDENTIQUE — un objet que
    /// ce build ne sait pas peindre, un média sans adresse — ou qu'elle ne porte
    /// rien. Une scène amputée serait pire qu'un refus : l'auteur composerait
    /// par-dessus un trou sans le savoir.
    public init?(story: StoryItem, preferredLanguages: [String]) {
        let renderable = story.toRenderableSlide(preferredLanguages: preferredLanguages)
        guard !renderable.effects.carriesUnpaintableContent else { return nil }

        let slideId = UUID().uuidString
        let mediaById = Dictionary(story.media.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        func served(_ postMediaId: String) -> FeedMedia? {
            postMediaId.isEmpty ? nil : mediaById[postMediaId]
        }

        var assets: [Asset] = []
        var effects = renderable.effects

        // Le fond hérité est la pièce qu'AUCUN objet ne référence — mais
        // `toRenderableSlide` ne compte pas les stickers parmi les référents :
        // l'image d'un sticker passerait pour le fond. Elle reste au sticker.
        let stickerMediaIds = Set((effects.stickerObjects ?? []).map(\.postMediaId).filter { !$0.isEmpty })
        if let url = renderable.mediaURL, !url.isEmpty,
           !story.media.contains(where: { $0.url == url && stickerMediaIds.contains($0.id) }) {
            let backdrop = story.media.first { $0.url == url }
            guard backdrop.map({ $0.type == .image }) ?? true else { return nil }
            assets.append(Asset(objectId: slideId, kind: .backgroundImage, remoteURL: url))
        }

        var medias = effects.mediaObjects ?? []
        for index in medias.indices {
            let object = medias[index]
            guard let kind = object.kind,
                  let url = Self.address(object.mediaURL, served(object.postMediaId)?.url) else { return nil }
            assets.append(Asset(objectId: object.id, kind: kind == .video ? .video : .image, remoteURL: url))
            medias[index].postMediaId = ""
            medias[index].mediaURL = url
        }
        effects.mediaObjects = effects.mediaObjects.map { _ in medias }

        var audios = effects.audioPlayerObjects ?? []
        for index in audios.indices {
            let object = audios[index]
            audios[index].backgroundAudioVariants = nil
            let borrowed = object.soundId != nil && object.postMediaId.isEmpty
            if borrowed, !(object.mediaURL ?? "").isEmpty { continue }
            guard let url = Self.address(object.mediaURL, served(object.postMediaId)?.url) else { return nil }
            assets.append(Asset(objectId: object.id, kind: .audio, remoteURL: url))
            audios[index].postMediaId = ""
            audios[index].mediaURL = url
        }
        effects.audioPlayerObjects = effects.audioPlayerObjects.map { _ in audios }

        effects.stickerObjects = effects.stickerObjects.map { stickers in
            stickers.map { sticker in
                var detached = sticker
                if let media = served(sticker.postMediaId), let url = Self.address(media.url, nil) {
                    assets.append(Asset(objectId: sticker.id, kind: .stickerImage, remoteURL: url))
                }
                detached.postMediaId = ""
                return detached
            }
        }

        effects.textObjects = StoryRepostCredit.stripped(from: effects.textObjects)
        effects.backgroundAudioVariants = nil
        effects.voiceAttachmentId = nil
        effects.voiceTranscriptions = nil
        effects.canvasV3 = nil
        effects.thumbHash = nil

        var slide = StorySlide(id: slideId, mediaURL: nil, content: renderable.content, effects: effects)
        slide.duration = slide.computedTotalDuration()

        let carriesMatter = !assets.isEmpty
            || !(effects.audioPlayerObjects ?? []).isEmpty
            || !effects.textObjects.isEmpty
            || !(effects.stickerObjects ?? []).isEmpty
            || !effects.locationObjects.isEmpty
            || effects.drawingData != nil
            || !(effects.drawingStrokes ?? []).isEmpty
            || !(effects.background ?? "").isEmpty
            || !(slide.content ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        guard carriesMatter else { return nil }

        self.slide = slide
        self.assets = assets
    }

    private static func address(_ primary: String?, _ fallback: String?) -> String? {
        [primary, fallback].compactMap { $0 }.first { !$0.isEmpty }
    }
}
