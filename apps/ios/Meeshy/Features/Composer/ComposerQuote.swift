import Foundation
import MeeshySDK

/// **La publication CITÉE, telle que le compositeur la montre** — une carte
/// figée, jamais un objet de la scène.
///
/// Une citation part par `POST /posts/:id/repost` : le serveur ne reçoit que le
/// commentaire, l'audience et le format, et rattache lui-même la source. La
/// carte n'est donc pas une donnée de la publication — c'est ce que l'auteur
/// cite, rappelé sous ses yeux pendant qu'il écrit. Elle ne se déplace, ne se
/// modifie ni ne se retire.
///
/// **Elle montre la RACINE** quand on cite une republication : c'est elle que
/// `RepostTargeting` désigne, donc elle que le fil affichera sous le
/// commentaire. Montrer la carte intermédiaire citerait une chose et en
/// publierait une autre.
nonisolated struct ComposerQuotedPublication: Equatable {
    let author: String
    let authorId: String
    let authorColor: String
    let authorAvatarURL: String?
    let timestamp: Date
    let moodEmoji: String?
    let text: String
    let primaryMedia: FeedMedia?
    let mediaCount: Int
    let visibility: String?

    static func == (lhs: ComposerQuotedPublication, rhs: ComposerQuotedPublication) -> Bool {
        lhs.author == rhs.author && lhs.authorId == rhs.authorId && lhs.authorColor == rhs.authorColor
            && lhs.authorAvatarURL == rhs.authorAvatarURL && lhs.timestamp == rhs.timestamp
            && lhs.moodEmoji == rhs.moodEmoji && lhs.text == rhs.text
            && lhs.primaryMedia?.id == rhs.primaryMedia?.id && lhs.mediaCount == rhs.mediaCount
            && lhs.visibility == rhs.visibility
    }

    init(author: String, authorId: String, authorColor: String, authorAvatarURL: String?, timestamp: Date,
         moodEmoji: String?, text: String, primaryMedia: FeedMedia?, mediaCount: Int, visibility: String?) {
        self.author = author
        self.authorId = authorId
        self.authorColor = authorColor
        self.authorAvatarURL = authorAvatarURL
        self.timestamp = timestamp
        self.moodEmoji = moodEmoji
        self.text = text
        self.primaryMedia = primaryMedia
        self.mediaCount = mediaCount
        self.visibility = visibility
    }

    /// La carte d'une publication du fil — sa racine si elle republie.
    init(quoting post: FeedPost) {
        if let racine = post.repost {
            self.init(repost: racine)
            return
        }
        self.init(author: post.author, authorId: post.authorId, authorColor: post.authorColor,
                  authorAvatarURL: post.authorAvatarURL, timestamp: post.timestamp, moodEmoji: nil,
                  text: post.displayContent, primaryMedia: post.media.first, mediaCount: post.media.count,
                  visibility: post.visibility)
    }

    /// La carte de la source qu'un repost porte déjà — ce que son édition montre.
    /// Son texte est celui du Prisme du lecteur (#16002), le même que la carte
    /// du fil et le détail : la descente est faite à la conversion du post.
    init(repost: RepostContent) {
        self.init(author: repost.author, authorId: repost.authorId, authorColor: repost.authorColor,
                  authorAvatarURL: repost.authorAvatarURL, timestamp: repost.timestamp,
                  moodEmoji: repost.moodEmoji.flatMap { $0.isEmpty ? nil : $0 }, text: repost.displayContent,
                  primaryMedia: repost.media.first, mediaCount: repost.media.count,
                  visibility: repost.visibility)
    }
}

/// **Ce que « Citer » ouvre** : la porte du compositeur, déterminée par la carte
/// touchée.
///
/// La référence remonte à la RACINE et le format reste celui de la CARTE — la
/// règle de `RepostTargeting`, appelée et jamais réécrite : citer depuis le fil
/// le repost d'un réel doit donner un réel cité, pas un post.
nonisolated enum ComposerQuoteDoor {
    static func intent(quoting post: FeedPost) -> ComposerIntent {
        let cible = RepostTargeting.target(
            cardId: post.id,
            cardType: post.type,
            repostOfId: post.repost?.id,
            originalRepostOfId: post.repost?.originalRepostOfId
        )
        return ComposerIntent(origin: .repost(ofPostId: cible.postId,
                                              sourceFormat: ComposerFormat(postType: post.type)))
    }
}

nonisolated extension ComposerOrigin {
    /// **Une CITATION de post ou de réel.** `POST /posts/:id/repost` n'accepte
    /// qu'un commentaire : sa scène n'offre que l'écriture. Une republication
    /// de story garde son atelier entier — elle part par la file des stories.
    var composesQuote: Bool {
        guard case .repost(_, let format) = self else { return false }
        return format == .post || format == .reel
    }
}

/// **Les portes d'une scène de citation** : celles qui ÉCRIVENT, et rien
/// d'autre. Un média, un sticker ou un lieu n'atteindrait pas le serveur.
nonisolated enum ComposerQuoteScene {
    /// La capture rapide de la scène (toucher, appui long, indication) n'arme
    /// aucun viseur pour une citation : la prise serait refusée à l'envoi.
    static func servesCapture(origin: ComposerOrigin) -> Bool {
        !origin.composesQuote
    }

    static func doors(served: Set<ComposerRailDoor>, format: ComposerFormat, allowsCapture: Bool,
                      origin: ComposerOrigin) -> [ComposerRailDoor] {
        let offertes = ComposerRailDoor.offered(served: served, format: format, allowsCapture: allowsCapture)
        guard origin.composesQuote else { return offertes }
        return offertes.filter { ComposerRailDoor.writingDoors.contains($0) }
    }
}

/// Pourquoi une citation ne part pas. Chaque refus laisse le compositeur ouvert,
/// sa saisie intacte.
nonisolated enum ComposerQuoteRefusal: Equatable {
    /// Le brouillon ne cite rien.
    case notAQuote
    /// Le format n'est ni un post ni un réel.
    case wrongFormat(ComposerFormat)
    /// Le brouillon porte un média, un lieu ou un objet de scène : une
    /// citation n'emporte que son commentaire, et le reste serait perdu sans
    /// un mot.
    case carriesMoreThanText
    /// La source attend encore sa propre publication.
    case pendingSource
}

/// **Ce qu'une citation envoie, ou pourquoi elle ne part pas** — la question
/// posée AVANT l'écrivain.
nonisolated enum ComposerQuoteSendPlan: Equatable {
    case send(RepostIntent)
    case refuse(ComposerQuoteRefusal)

    static func == (lhs: ComposerQuoteSendPlan, rhs: ComposerQuoteSendPlan) -> Bool {
        switch (lhs, rhs) {
        case let (.send(a), .send(b)):
            return a.postId == b.postId && a.targetType == b.targetType && a.content == b.content
                && a.isQuote == b.isQuote && a.visibility == b.visibility
        case let (.refuse(a), .refuse(b)):
            return a == b
        default:
            return false
        }
    }

    /// Un commentaire vide fait un repartage SEC (`RepostIntent.quoted` en
    /// décide) : citer sans un mot reste un geste, celui que la carte du fil
    /// offre déjà.
    static func plan(for draft: ComposerDocumentDraft) -> ComposerQuoteSendPlan {
        guard let source = draft.repostOfId else { return .refuse(.notAQuote) }
        guard !ClientMutationId.isValid(source) else { return .refuse(.pendingSource) }
        guard draft.format == .post || draft.format == .reel else {
            return .refuse(.wrongFormat(draft.format))
        }
        let porteUneScene = draft.storyEffects.map(StorySlidePublishMatter.carriesObject) ?? false
        guard draft.localMedia.isEmpty, draft.location == nil, !porteUneScene else {
            return .refuse(.carriesMoreThanText)
        }
        return .send(.quoted(postId: source, targetType: draft.format.postType,
                             comment: draft.text, visibility: draft.visibility.rawValue))
    }
}
