import Foundation

// MARK: - Reel offer (#8603)

public extension ReelComposition {
    /// « Ce post doit-il PROPOSER le réel ? » — demande porteur 2026-09-28
    /// (#8603) : un POST dont le SEUL média est UNE vidéo ouvre, à l'appui sur
    /// Publier, le choix « C'est un Réel / C'est un Post » (Réel par défaut).
    /// Jamais pour plusieurs médias, une photo, un audio, un texte seul, une
    /// story, un réel, un mood, un repost, une édition — ni quand l'auteur a
    /// déjà choisi « Post » au chevron.
    ///
    /// La vidéo doit QUALIFIER (`qualifiesAsReel`, plancher 3 s) : proposer un
    /// réel que le gateway rétrograderait en post serait un choix qui ment.
    ///
    /// Miroir EXACT de `offersReelForPost`
    /// (`packages/shared/utils/reel-composition.ts`) — toute évolution touche
    /// les deux sites.
    static func offersReelForPost(type: PostType,
                                  mediaKinds: [(kind: FeedMediaType, durationMs: Int?)],
                                  isRepost: Bool,
                                  isEdit: Bool,
                                  formatChosenByAuthor: Bool) -> Bool {
        guard type == .post, !isRepost, !isEdit, !formatChosenByAuthor else { return false }
        guard mediaKinds.count == 1, mediaKinds.first?.kind == .video else { return false }
        return qualifiesAsReel(mediaKinds: mediaKinds)
    }
}
