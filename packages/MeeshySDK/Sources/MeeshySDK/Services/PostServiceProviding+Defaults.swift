import Foundation

public extension PostServiceProviding {
    func delete(postId: String, reason: String?) async throws {
        guard reason == nil else { throw APIError.serverError(501, "delete(reason:) not implemented by \(Self.self)") }
        try await delete(postId: postId)
    }

    func deleteComment(postId: String, commentId: String, reason: String?) async throws {
        guard reason == nil else { throw APIError.serverError(501, "deleteComment(reason:) not implemented by \(Self.self)") }
        try await deleteComment(postId: postId, commentId: commentId)
    }

    func recordSocialEvents(_ events: [StampedSocialEvent], credential: SocialEventsCredential) async throws -> SocialEventsReceipt {
        throw APIError.serverError(501, "recordSocialEvents not implemented by \(Self.self)")
    }

    /// Un envoi IMMÉDIAT, sans file : l'événement naît à l'appel, son
    /// enveloppe aussi. Toute file qui peut rejouer garde la sienne et passe
    /// par la requirement.
    func recordSocialEvents(_ events: [SocialEvent], credential: SocialEventsCredential) async throws -> SocialEventsReceipt {
        let now = Date()
        return try await recordSocialEvents(events.map { StampedSocialEvent.stamping($0, at: now) }, credential: credential)
    }

    func recordSocialEventsV2(body: Data, credential: SocialEventsCredential) async throws -> SocialEventsV2Receipt {
        throw APIError.serverError(501, "recordSocialEventsV2 not implemented by \(Self.self)")
    }

    /// Défaut : un conformeur qui ne publie pas depuis une pièce jointe (tous
    /// les doubles de test existants) reste valide. Il ÉCHOUE plutôt que de
    /// rendre un post fabriqué — un défaut silencieux ferait passer un témoin
    /// qui croit avoir publié.
    func publishAttachment(attachmentId: String, target: PublicationTarget?, content: String?, capturedInApp: Bool) async throws -> APIPost {
        throw APIError.serverError(501, "publishAttachment not implemented by \(Self.self)")
    }

    /// Défaut : un conformeur qui n'implémente que la signature SANS mentions
    /// (mocks existants) reste valide — les pastilles sont simplement ignorées
    /// tant que le type ne surcharge pas cette méthode. `PostService` la
    /// surcharge réellement.
    func createStory(content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?) async throws -> APIPost {
        try await createStory(content: content, storyEffects: storyEffects, visibility: visibility,
                              visibilityUserIds: visibilityUserIds, originalLanguage: originalLanguage,
                              mediaIds: mediaIds, repostOfId: repostOfId)
    }

    /// Défaut : un conformeur qui n'implémente que la signature SANS
    /// `allowSoundExtraction`/`mediaAlt` (mocks existants) reste valide — les
    /// deux champs sont simplement ignorés tant que le type ne surcharge pas
    /// cette méthode. `PostService` la surcharge réellement.
    func createStory(content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?, mediaCaption: [String: String]?) async throws -> APIPost {
        try await createStory(content: content, storyEffects: storyEffects, visibility: visibility,
                              visibilityUserIds: visibilityUserIds, originalLanguage: originalLanguage,
                              mediaIds: mediaIds, repostOfId: repostOfId, mentions: mentions)
    }

    /// Défaut : un conformeur qui ne sait pas porter le format (doubles de
    /// test) retombe sur la publication de story. Il perd alors le TYPE, et
    /// c'est assumé — un double ne parle à aucun serveur. La garantie qui
    /// compte porte sur le corps réellement remis à `POST /posts`, que
    /// `PostService` surcharge plus bas et que `CanvasPostTypeTests` mesure.
    func createCanvasPost(type: PostType, content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?, mediaCaption: [String: String]?) async throws -> APIPost {
        try await createStory(content: content, storyEffects: storyEffects, visibility: visibility,
                              visibilityUserIds: visibilityUserIds, originalLanguage: originalLanguage,
                              mediaIds: mediaIds, repostOfId: repostOfId, mentions: mentions,
                              allowSoundExtraction: allowSoundExtraction, mediaAlt: mediaAlt, mediaCaption: mediaCaption)
    }

    /// Défaut : un conformeur qui ignore la clé d'idempotence (doubles de test)
    /// reste valide — il publie sans elle. `PostService` la surcharge.
    func createCanvasPost(type: PostType, content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?, mediaCaption: [String: String]?, alsoAsReel: Bool?, clientMutationId: String?) async throws -> APIPost {
        try await createCanvasPost(type: type, content: content, storyEffects: storyEffects, visibility: visibility,
                                   visibilityUserIds: visibilityUserIds, originalLanguage: originalLanguage,
                                   mediaIds: mediaIds, repostOfId: repostOfId, mentions: mentions,
                                   allowSoundExtraction: allowSoundExtraction, mediaAlt: mediaAlt,
                                   mediaCaption: mediaCaption, alsoAsReel: alsoAsReel)
    }

    /// Défaut : un conformeur qui ignore « aussi en réel » (mocks existants)
    /// reste valide — il publie la story seule. `PostService` la surcharge.
    func createCanvasPost(type: PostType, content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?, mediaCaption: [String: String]?, alsoAsReel: Bool?) async throws -> APIPost {
        try await createCanvasPost(type: type, content: content, storyEffects: storyEffects, visibility: visibility,
                                   visibilityUserIds: visibilityUserIds, originalLanguage: originalLanguage,
                                   mediaIds: mediaIds, repostOfId: repostOfId, mentions: mentions,
                                   allowSoundExtraction: allowSoundExtraction, mediaAlt: mediaAlt, mediaCaption: mediaCaption)
    }

    /// Défaut : un conformeur qui n'implémente que la signature SANS mentions
    /// (mocks existants) reste valide. Le tri-état retombe alors sur « je n'en
    /// parle pas » — jamais sur `[]`, qui révoquerait.
    func update(postId: String, content: String?, visibility: String?, visibilityUserIds: [String]?, moodEmoji: String?, originalLanguage: String?, type: String?, removeMediaIds: [String]?, storyEffects: StoryEffects?, mediaIds: [String]?, location: PostLocationUpdate?, mentions: [PostMentionInput]?) async throws -> APIPost {
        try await update(postId: postId, content: content, visibility: visibility, visibilityUserIds: visibilityUserIds,
                         moodEmoji: moodEmoji, originalLanguage: originalLanguage, type: type,
                         removeMediaIds: removeMediaIds, storyEffects: storyEffects, mediaIds: mediaIds,
                         location: location)
    }

    /// Défaut : un conformeur qui n'implémente que la signature SANS
    /// `allowSoundExtraction`/`mediaAlt` (mocks existants) reste valide — les
    /// deux champs sont simplement ignorés tant que le type ne surcharge pas
    /// cette méthode. `PostService` la surcharge réellement plus bas.
    func update(postId: String, content: String?, visibility: String?, visibilityUserIds: [String]?, moodEmoji: String?, originalLanguage: String?, type: String?, removeMediaIds: [String]?, storyEffects: StoryEffects?, mediaIds: [String]?, location: PostLocationUpdate?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?, mediaCaption: [String: String]?) async throws -> APIPost {
        try await update(postId: postId, content: content, visibility: visibility, visibilityUserIds: visibilityUserIds,
                         moodEmoji: moodEmoji, originalLanguage: originalLanguage, type: type,
                         removeMediaIds: removeMediaIds, storyEffects: storyEffects, mediaIds: mediaIds,
                         location: location, mentions: mentions)
    }

    /// Défaut : un conformeur qui n'implémente que les signatures
    /// positionnelles (tous les doubles de test existants) reste valide. La
    /// déclaration est appliquée ICI — un champ non déclaré connu part à
    /// `nil`, donc absent du JSON — puis le corps repart par le chemin
    /// historique. Le double observe donc EXACTEMENT ce qui partirait.
    func update(postId: String, known: Set<PostEditField>, draft: PostEditDraft) async throws -> APIPost {
        let body = PostEditPayload.build(known: known, draft: draft)
        return try await update(postId: postId, content: body.content, visibility: body.visibility,
                                visibilityUserIds: body.visibilityUserIds, moodEmoji: body.moodEmoji,
                                originalLanguage: body.originalLanguage, type: body.type,
                                removeMediaIds: body.removeMediaIds, storyEffects: body.storyEffects,
                                mediaIds: body.mediaIds, location: body.location,
                                mentions: body.mentions, allowSoundExtraction: body.allowSoundExtraction,
                                mediaAlt: body.mediaAlt, mediaCaption: body.mediaCaption)
    }

    /// Compat : la signature historique 8-params reste disponible pour les
    /// call sites existants — les protocoles Swift ne portent pas de valeurs
    /// par défaut. `storyEffects` / `mediaIds` (édition de story) partent à nil.
    func update(postId: String, content: String?, visibility: String?, visibilityUserIds: [String]?, moodEmoji: String?, originalLanguage: String?, type: String?, removeMediaIds: [String]?) async throws -> APIPost {
        try await update(postId: postId, content: content, visibility: visibility, visibilityUserIds: visibilityUserIds,
                         moodEmoji: moodEmoji, originalLanguage: originalLanguage, type: type,
                         removeMediaIds: removeMediaIds, storyEffects: nil, mediaIds: nil, location: nil)
    }

    /// Défaut : un conformeur qui n'implémente que la signature sans `location`
    /// (mocks existants) reste valide — la position est simplement ignorée tant
    /// que le type ne surcharge pas cette méthode. `PostService` la surcharge
    /// réellement plus bas.
    func create(content: String?, type: String, visibility: String, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?) async throws -> APIPost {
        try await create(content: content, type: type, visibility: visibility, moodEmoji: moodEmoji, mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration, originalLanguage: originalLanguage, mobileTranscription: mobileTranscription, repostOfId: repostOfId)
    }

    /// Défaut : un conformeur qui n'implémente que la signature SANS mentions
    /// (mocks existants) reste valide — les modes déclarés sont simplement
    /// ignorés tant que le type ne surcharge pas cette méthode. `PostService`
    /// la surcharge réellement.
    func create(content: String?, type: String, visibility: String, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?, mentions: [PostMentionInput]?) async throws -> APIPost {
        try await create(content: content, type: type, visibility: visibility, moodEmoji: moodEmoji, mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration, originalLanguage: originalLanguage, mobileTranscription: mobileTranscription, repostOfId: repostOfId, location: location)
    }

    /// Défaut : un conformeur qui n'implémente pas la signature complète
    /// (doubles de test existants) reste valide — l'extraction de son, le
    /// texte alternatif et le grain de découvrabilité sont alors ignorés,
    /// l'audience nommée étant conservée. `PostService` la surcharge
    /// réellement, et c'est là — sur le corps remis à `POST /posts` — que la
    /// garantie qui compte est mesurée : un double ne parle à aucun serveur.
    ///
    /// Ignorer `discoverabilityPrecision` va toujours dans le sens
    /// PROTECTEUR : un conformeur muet publie du non-découvrable, jamais du
    /// découvrable par accident.
    func create(content: String?, type: String, visibility: String, visibilityUserIds: [String]?, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?, mediaCaption: [String: String]?, discoverabilityPrecision: DiscoverabilityPrecision?) async throws -> APIPost {
        try await create(content: content, type: type, visibility: visibility, visibilityUserIds: visibilityUserIds, moodEmoji: moodEmoji, mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration, originalLanguage: originalLanguage, mobileTranscription: mobileTranscription, repostOfId: repostOfId, location: location, mentions: mentions)
    }

    /// Défaut : un conformeur qui ne sait pas porter d'audience nommée
    /// (mocks) retombe sur la signature sans liste — la visibilité part,
    /// la liste est ignorée. `PostService` la surcharge réellement.
    func create(content: String?, type: String, visibility: String, visibilityUserIds: [String]?, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?, mentions: [PostMentionInput]?) async throws -> APIPost {
        try await create(content: content, type: type, visibility: visibility, moodEmoji: moodEmoji, mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration, originalLanguage: originalLanguage, mobileTranscription: mobileTranscription, repostOfId: repostOfId, location: location, mentions: mentions)
    }

    /// Défaut : un conformeur qui n'implémente que la signature SANS
    /// `allowSoundExtraction`/`mediaAlt` (mocks existants) reste valide — les
    /// deux champs sont simplement ignorés tant que le type ne surcharge pas
    /// cette méthode. `PostService` la surcharge réellement plus bas.
    func create(content: String?, type: String, visibility: String, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?) async throws -> APIPost {
        try await create(content: content, type: type, visibility: visibility, moodEmoji: moodEmoji, mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration, originalLanguage: originalLanguage, mobileTranscription: mobileTranscription, repostOfId: repostOfId, location: location, mentions: mentions)
    }

    /// Défaut : les conformeurs existants (mocks) restent valides — un mock qui
    /// n'observe pas l'édition n'a pas à l'implémenter, et un test qui
    /// l'exercerait sans surcharge échoue explicitement.
    func updateComment(postId: String, commentId: String, content: String?, effectFlags: Int?, originalLanguage: String?) async throws -> APIPostComment {
        throw NSError(domain: "PostServiceProviding", code: -1,
                      userInfo: [NSLocalizedDescriptionKey: "updateComment not implemented by this conformer"])
    }

    /// Défaut de la variante idempotente du repost : laisse tomber le jeton et
    /// retombe sur la variante sans en-tête. `PostService` la surcharge
    /// réellement ; un double de test peut la surcharger pour OBSERVER le
    /// jeton, ce que le défaut ne permet pas.
    func repost(postId: String, targetType: PostType?, content: String?, isQuote: Bool,
                visibility: String?, clientMutationId: String?) async throws -> APIPost {
        try await repost(postId: postId, targetType: targetType, content: content,
                         isQuote: isQuote, visibility: visibility)
    }
}
