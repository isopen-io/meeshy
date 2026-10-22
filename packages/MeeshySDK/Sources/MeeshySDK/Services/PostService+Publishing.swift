import Foundation

extension PostService {
    public func create(content: String? = nil, type: String = "POST", visibility: String = "PUBLIC", moodEmoji: String? = nil, mediaIds: [String]? = nil, audioUrl: String? = nil, audioDuration: Int? = nil, originalLanguage: String? = nil, mobileTranscription: MobileTranscriptionPayload? = nil, repostOfId: String? = nil) async throws -> APIPost {
        try await create(content: content, type: type, visibility: visibility, moodEmoji: moodEmoji, mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration, originalLanguage: originalLanguage, mobileTranscription: mobileTranscription, repostOfId: repostOfId, location: nil)
    }

    public func create(content: String?, type: String, visibility: String, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?) async throws -> APIPost {
        try await create(content: content, type: type, visibility: visibility, moodEmoji: moodEmoji, mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration, originalLanguage: originalLanguage, mobileTranscription: mobileTranscription, repostOfId: repostOfId, location: location, mentions: nil)
    }

    /// Seule surcharge qui envoie réellement `location` ET les références
    /// déclarées au gateway — même convention que l'`addComment` porteur de
    /// lieu plus bas.
    public func create(content: String?, type: String, visibility: String, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?, mentions: [PostMentionInput]?) async throws -> APIPost {
        try await create(content: content, type: type, visibility: visibility, moodEmoji: moodEmoji, mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration, originalLanguage: originalLanguage, mobileTranscription: mobileTranscription, repostOfId: repostOfId, location: location, mentions: mentions, allowSoundExtraction: nil, mediaAlt: nil, mediaCaption: nil)
    }

    /// Surcharge porteuse de `allowSoundExtraction` ET `mediaAlt` — le
    /// composer vidéo (opt-in extraction de son) et l'inspecteur
    /// d'accessibilité (texte alternatif par média) passent par ici. Elle
    /// n'assemble plus rien elle-même : elle délègue au terminal unique.
    public func create(content: String?, type: String, visibility: String, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?, mediaCaption: [String: String]? = nil) async throws -> APIPost {
        try await create(content: content, type: type, visibility: visibility, visibilityUserIds: nil, moodEmoji: moodEmoji, mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration, originalLanguage: originalLanguage, mobileTranscription: mobileTranscription, repostOfId: repostOfId, location: location, mentions: mentions, allowSoundExtraction: allowSoundExtraction, mediaAlt: mediaAlt, mediaCaption: mediaCaption, discoverabilityPrecision: nil)
    }

    /// Création porteuse d'une AUDIENCE NOMMÉE (`EXCEPT`/`ONLY`).
    ///
    /// `CreatePostRequest` portait déjà le champ ; aucune surcharge ne le
    /// remplissait. Un post ne pouvait donc naître qu'en PUBLIC, FRIENDS,
    /// COMMUNITY ou PRIVATE — les deux visibilités à liste étaient offertes
    /// au composer story et hors d'atteinte du composer post, sans que rien
    /// ne le dise. Le gateway, lui, les valide depuis toujours
    /// (`CreatePostSchema` rejette un EXCEPT/ONLY sans destinataire).
    ///
    /// C'est LA surcharge que `FeedViewModel.createPost` appelle : tout champ
    /// neuf qui n'arrive pas jusqu'ici n'arrive nulle part en production.
    public func create(content: String?, type: String, visibility: String, visibilityUserIds: [String]?, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?, mentions: [PostMentionInput]?) async throws -> APIPost {
        try await create(content: content, type: type, visibility: visibility, visibilityUserIds: visibilityUserIds, moodEmoji: moodEmoji, mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration, originalLanguage: originalLanguage, mobileTranscription: mobileTranscription, repostOfId: repostOfId, location: location, mentions: mentions, allowSoundExtraction: nil, mediaAlt: nil, mediaCaption: nil, discoverabilityPrecision: nil)
    }

    /// TERMINAL UNIQUE de la création de post — le seul site qui assemble un
    /// `CreatePostRequest` et le remet à `POST /posts`.
    ///
    /// Il y en avait DEUX, qui ne se déléguaient pas l'un à l'autre : celui
    /// porteur de `allowSoundExtraction`/`mediaAlt` et celui porteur de
    /// `visibilityUserIds`. Ils avaient déjà commencé à diverger — le second
    /// ne transportait ni l'opt-in d'extraction ni le texte alternatif — et
    /// tout champ ajouté au « plus large » des deux manquait le seul chemin
    /// que l'application emprunte réellement. Les deux délèguent désormais
    /// ici : un champ neuf ne peut plus arriver à moitié.
    ///
    /// - Parameter discoverabilityPrecision: le grain de découvrabilité
    ///   géographique DEMANDÉ, indépendant du badge de position affiché.
    ///   `nil` — le défaut de toutes les surcharges ci-dessus — omet la clé,
    ///   et le gateway laisse alors `geoPoint`/`geoPrecision` nuls. Rien ici
    ///   n'arrondit `location` : la coordonnée part telle qu'elle a été
    ///   remise, le serveur seul quantifie.
    public func create(content: String?, type: String, visibility: String, visibilityUserIds: [String]?, moodEmoji: String?, mediaIds: [String]?, audioUrl: String?, audioDuration: Int?, originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?, repostOfId: String?, location: SharedPlace?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?, mediaCaption: [String: String]? = nil, discoverabilityPrecision: DiscoverabilityPrecision?) async throws -> APIPost {
        let body = CreatePostRequest(content: content, type: type, visibility: visibility, moodEmoji: moodEmoji, visibilityUserIds: visibilityUserIds, mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration, originalLanguage: originalLanguage, mobileTranscription: mobileTranscription, repostOfId: repostOfId, location: location, allowSoundExtraction: allowSoundExtraction, mentions: mentions, mediaAlt: mediaAlt, mediaCaption: mediaCaption, discoverabilityPrecision: discoverabilityPrecision)
        let response: APIResponse<APIPost> = try await api.post(PostsEndpoint.root, body: body)
        return response.data
    }

    public func delete(postId: String) async throws {
        try await delete(postId: postId, reason: nil)
    }

    public func delete(postId: String, reason: String?) async throws {
        try await api.deleteRemovingContent(PostsEndpoint.byPostId(postId: postId), reason: reason)
    }

    /// Publie une pièce jointe reçue en conversation. Le corps ne porte que ce
    /// que le serveur ne peut PAS déduire : l'identifiant du média, la
    /// destination quand l'utilisateur l'a choisie, le mot qu'il ajoute, et la
    /// provenance — que seul le client qui a ouvert la caméra connaît.
    public func publishAttachment(
        attachmentId: String,
        target: PublicationTarget? = nil,
        content: String? = nil,
        capturedInApp: Bool = false
    ) async throws -> APIPost {
        let body = PublishAttachmentRequest(
            attachmentId: attachmentId,
            target: target?.rawValue,
            content: content,
            // Omis quand faux : le serveur applique le même défaut, et une clé
            // absente vaut mieux qu'une affirmation sans contenu.
            capturedInApp: capturedInApp ? true : nil
        )
        let response: APIResponse<APIPost> = try await api.post(PostsEndpoint.fromAttachment, body: body)
        return response.data
    }

    public func requestTranslation(postId: String, targetLanguage: String) async throws {
        let body = ["targetLanguage": targetLanguage]
        let bodyData = try JSONSerialization.data(withJSONObject: body)
        let _: APIResponse<[String: String]> = try await api.request(
            PostsEndpoint.byPostIdTranslate(postId: postId),
            method: "POST",
            body: bodyData
        )
    }

    public func requestMediaCaptionTranslation(mediaId: String, targetLanguage: String) async throws {
        let bodyData = try JSONSerialization.data(withJSONObject: ["targetLanguage": targetLanguage])
        let _: APIResponse<MediaCaptionTranslationRequestAck> = try await api.request(
            PostsEndpoint.mediaByMediaIdCaptionTranslate(mediaId: mediaId),
            method: "POST",
            body: bodyData
        )
    }

    public func createStory(content: String?, storyEffects: StoryEffects?, visibility: String = "PUBLIC", visibilityUserIds: [String]? = nil, originalLanguage: String? = nil, mediaIds: [String]? = nil, repostOfId: String? = nil) async throws -> APIPost {
        try await createStory(content: content, storyEffects: storyEffects, visibility: visibility,
                              visibilityUserIds: visibilityUserIds, originalLanguage: originalLanguage,
                              mediaIds: mediaIds, repostOfId: repostOfId, mentions: nil)
    }

    public func createStory(content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?) async throws -> APIPost {
        try await createStory(content: content, storyEffects: storyEffects, visibility: visibility,
                              visibilityUserIds: visibilityUserIds, originalLanguage: originalLanguage,
                              mediaIds: mediaIds, repostOfId: repostOfId, mentions: mentions,
                              allowSoundExtraction: nil, mediaAlt: nil, mediaCaption: nil)
    }

    /// Seule surcharge qui envoie réellement `allowSoundExtraction` ET
    /// `mediaAlt` — même patron que `create(… allowSoundExtraction: mediaAlt:)`.
    ///
    /// Depuis V3-3 elle n'écrit plus le corps elle-même : publier une story,
    /// c'est publier un canevas de type `STORY`. Un second constructeur de
    /// corps aurait été le point de divergence exact que ce lot vient de
    /// fermer.
    public func createStory(content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?, mediaCaption: [String: String]? = nil) async throws -> APIPost {
        try await createCanvasPost(type: .story, content: content, storyEffects: storyEffects,
                                   visibility: visibility, visibilityUserIds: visibilityUserIds,
                                   originalLanguage: originalLanguage, mediaIds: mediaIds,
                                   repostOfId: repostOfId, mentions: mentions,
                                   allowSoundExtraction: allowSoundExtraction, mediaAlt: mediaAlt, mediaCaption: mediaCaption)
    }

    /// Le SEUL constructeur du corps de création par canevas, tous formats
    /// confondus — c'est ce qui garantit qu'un post composé emporte exactement
    /// ce qu'une story emporte, moins le type.
    public func createCanvasPost(type: PostType, content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?, mediaCaption: [String: String]? = nil) async throws -> APIPost {
        try await createCanvasPost(type: type, content: content, storyEffects: storyEffects, visibility: visibility,
                                   visibilityUserIds: visibilityUserIds, originalLanguage: originalLanguage,
                                   mediaIds: mediaIds, repostOfId: repostOfId, mentions: mentions,
                                   allowSoundExtraction: allowSoundExtraction, mediaAlt: mediaAlt,
                                   mediaCaption: mediaCaption, alsoAsReel: nil)
    }

    public func createCanvasPost(type: PostType, content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?, mediaCaption: [String: String]?, alsoAsReel: Bool?) async throws -> APIPost {
        try await createCanvasPost(type: type, content: content, storyEffects: storyEffects, visibility: visibility,
                                   visibilityUserIds: visibilityUserIds, originalLanguage: originalLanguage,
                                   mediaIds: mediaIds, repostOfId: repostOfId, mentions: mentions,
                                   allowSoundExtraction: allowSoundExtraction, mediaAlt: mediaAlt,
                                   mediaCaption: mediaCaption, alsoAsReel: alsoAsReel, clientMutationId: nil)
    }

    public func createCanvasPost(type: PostType, content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?, mediaCaption: [String: String]?, alsoAsReel: Bool?, clientMutationId: String?) async throws -> APIPost {
        // Strip composer-local `file://` paths from mediaObjects before the
        // payload hits the wire — they only resolve in the author's sandbox
        // and break the canvas for every reader (cf. StoryEffects+Sanitization
        // and StoryMediaLayer.swift:132-134).
        let sanitizedEffects = storyEffects?.sanitizedForServerPublish()
        let body = CreateStoryRequest(type: type.rawValue, content: content, storyEffects: sanitizedEffects, visibility: visibility, visibilityUserIds: visibilityUserIds, originalLanguage: originalLanguage, mediaIds: mediaIds, repostOfId: repostOfId, mentions: mentions, allowSoundExtraction: allowSoundExtraction, mediaAlt: mediaAlt, mediaCaption: mediaCaption, alsoAsReel: alsoAsReel)
        guard let clientMutationId else {
            let response: APIResponse<APIPost> = try await api.post(PostsEndpoint.root, body: body)
            return response.data
        }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let response: APIResponse<APIPost> = try await api.requestWithHeaders(
            PostsEndpoint.root, method: "POST", body: try encoder.encode(body),
            queryItems: nil, headers: ["X-Client-Mutation-Id": clientMutationId]
        )
        return response.data
    }

    public func createWithType(_ type: PostType, content: String, visibility: String = "PUBLIC",
                                moodEmoji: String? = nil, storyEffects: StoryEffects? = nil) async throws -> APIPost {
        switch type {
        case .story:
            return try await createStory(content: content, storyEffects: storyEffects, visibility: visibility)
        case .status:
            return try await create(content: content, type: "STATUS", visibility: visibility, moodEmoji: moodEmoji)
        case .post:
            return try await create(content: content, type: "POST", visibility: visibility)
        case .reel:
            // Règle produit 2026-08-02 : un REEL exige une composition
            // qualifiante (vidéo || audio || >= 2 images —
            // `ReelComposition.qualifiesAsReel`). Cette surface ne transporte
            // aucun média : la composition ne peut jamais qualifier, on publie
            // donc un POST. Les chemins avec médias passent par `create(...,
            // mediaIds:)` avec `ReelComposition.defaultType` côté appelant.
            return try await create(content: content, type: "POST", visibility: visibility)
        }
    }

    // MARK: - Update Post

    /// Forme courte — un chemin d'édition qui ne gère pas les références n'en
    /// déclare AUCUNE (`mentions: nil`) : le serveur préserve celles du post.
    public func update(postId: String, content: String? = nil, visibility: String? = nil, visibilityUserIds: [String]? = nil, moodEmoji: String? = nil, originalLanguage: String? = nil, type: String? = nil, removeMediaIds: [String]? = nil, storyEffects: StoryEffects? = nil, mediaIds: [String]? = nil, location: PostLocationUpdate? = nil) async throws -> APIPost {
        try await update(postId: postId, content: content, visibility: visibility, visibilityUserIds: visibilityUserIds,
                         moodEmoji: moodEmoji, originalLanguage: originalLanguage, type: type,
                         removeMediaIds: removeMediaIds, storyEffects: storyEffects, mediaIds: mediaIds,
                         location: location, mentions: nil)
    }

    /// Forme complète, SANS valeur par défaut — même patron que
    /// `create(… mentions:)` : deux surcharges toutes deux « à défauts »
    /// rendraient tout appel court ambigu.
    public func update(postId: String, content: String?, visibility: String?, visibilityUserIds: [String]?, moodEmoji: String?, originalLanguage: String?, type: String?, removeMediaIds: [String]?, storyEffects: StoryEffects?, mediaIds: [String]?, location: PostLocationUpdate?, mentions: [PostMentionInput]?) async throws -> APIPost {
        try await update(postId: postId, content: content, visibility: visibility, visibilityUserIds: visibilityUserIds,
                         moodEmoji: moodEmoji, originalLanguage: originalLanguage, type: type,
                         removeMediaIds: removeMediaIds, storyEffects: storyEffects, mediaIds: mediaIds,
                         location: location, mentions: mentions, allowSoundExtraction: nil, mediaAlt: nil, mediaCaption: nil)
    }

    /// Seule surcharge qui envoie réellement `allowSoundExtraction` ET
    /// `mediaAlt` — même patron que `create(… allowSoundExtraction: mediaAlt:)`
    /// ci-dessus.
    public func update(postId: String, content: String?, visibility: String?, visibilityUserIds: [String]?, moodEmoji: String?, originalLanguage: String?, type: String?, removeMediaIds: [String]?, storyEffects: StoryEffects?, mediaIds: [String]?, location: PostLocationUpdate?, mentions: [PostMentionInput]?, allowSoundExtraction: Bool?, mediaAlt: [String: String]?, mediaCaption: [String: String]? = nil) async throws -> APIPost {
        // `visibilityUserIds` était déclaré dans `UpdatePostRequest` mais JAMAIS
        // renseigné ici : il partait toujours à `nil`, et le `refine` Zod du
        // gateway rejetait donc systématiquement EXCEPT/ONLY.
        //
        // Un appelant positionnel n'a rien à TAIRE : ses `nil` valaient déjà
        // « je n'en parle pas ». Il déclare donc tout connu, et le corps se
        // construit au seul endroit qui le construise encore.
        return try await update(postId: postId, known: PostEditField.all, draft: PostEditDraft(
            content: content, visibility: visibility, visibilityUserIds: visibilityUserIds,
            moodEmoji: moodEmoji, originalLanguage: originalLanguage, type: type,
            removeMediaIds: removeMediaIds, storyEffects: storyEffects, mediaIds: mediaIds,
            location: location, mentions: mentions, allowSoundExtraction: allowSoundExtraction,
            mediaAlt: mediaAlt,
            mediaCaption: mediaCaption
        ))
    }

    /// **Le seul PUT d'édition du dépôt**, et le seul consommateur de
    /// `PostEditPayload.build`. Toute surcharge positionnelle ci-dessus
    /// retombe ici.
    public func update(postId: String, known: Set<PostEditField>, draft: PostEditDraft) async throws -> APIPost {
        let body = PostEditPayload.build(known: known, draft: draft)
        let response: APIResponse<APIPost> = try await api.put(PostsEndpoint.byPostId(postId: postId), body: body)
        return response.data
    }
}
