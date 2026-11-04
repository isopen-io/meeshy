import Foundation
import MeeshySDK

/// **Ce que l'édition d'une publication MONTRE de ses médias** (#9333).
///
/// Une publication se rouvre sur UNE scène : ses objets désignent leurs médias
/// par `postMediaId`, et un premier média que rien ne désigne en devient le
/// fond. Un média qui n'est ni l'un ni l'autre n'apparaît nulle part, et une
/// édition qui ne le montre pas ne peut ni le garder sciemment ni le retirer :
/// la porte d'édition lit `shownMediaIds` pour savoir si la scène dit TOUT.
///
/// Le fond n'est qu'une image ou une vidéo : un son ou un document posé en
/// fond peindrait une scène vide.
public nonisolated enum PublicationEditHydration {

    public static func referencedMediaIds(_ effects: StoryEffects?) -> Set<String> {
        guard let effects else { return [] }
        let objets = (effects.mediaObjects ?? []).map(\.postMediaId)
            + (effects.audioPlayerObjects ?? []).map(\.postMediaId)
            + (effects.stickerObjects ?? []).map(\.postMediaId)
        let pistes = [effects.backgroundAudioId, effects.voiceAttachmentId].compactMap { $0 }
        return Set((objets + pistes).filter { !$0.isEmpty })
    }

    public static func background(media: [FeedMedia], effects: StoryEffects?) -> FeedMedia? {
        guard let first = media.first,
              first.type == .image || first.type == .video,
              !referencedMediaIds(effects).contains(first.id) else { return nil }
        return first
    }

    public static func shownMediaIds(media: [FeedMedia], effects: StoryEffects?) -> Set<String> {
        let fond = background(media: media, effects: effects).map { Set([$0.id]) } ?? []
        return referencedMediaIds(effects).union(fond)
    }
}
