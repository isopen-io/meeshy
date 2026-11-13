import Foundation
import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

extension FeedViewModel {
    /// `mobileTranscription` a été RETIRÉ de cette signature : plus aucun site
    /// de production ne le passait depuis que les deux jumeaux vocaux publient
    /// par `publish(_:)`. Un paramètre que personne ne remplit est du code mort
    /// testé vert — et, ici, la porte par laquelle un troisième chemin vocal
    /// pouvait renaître EN DEHORS de `PublishIntent`, sans faire rougir la
    /// garde qui compte les appelants de la fabrique.
    ///
    /// - Parameter mentions: les personnes que l'auteur a nommées SANS les
    ///   écrire — note sous le contenu, métadonnée silencieuse. `nil` quand il
    ///   n'en a déclaré aucune : le serveur relit alors les `@handle` du texte
    ///   lui-même, et déclarer `[]` lui ferait entendre un effacement.
    /// - Parameter discoverabilityPrecision: le SECOND opt-in de position
    ///   (spec du 2026-08-02 §2), indépendant du badge gouverné par
    ///   `location`. `nil` — le défaut — laisse le contenu non trouvable ;
    ///   aucun appelant ne doit poser une valeur que l'utilisateur n'a pas
    ///   choisie. Il voyage sur les DEUX branches ci-dessous : la file durable
    ///   emporte le cas nominal (un post texte + lieu), le chemin direct celui
    ///   d'une position SEULE, sans texte.
    func createPost(content: String? = nil, type: String = "POST", visibility: String = "PUBLIC", visibilityUserIds: [String]? = nil, mediaIds: [String]? = nil, audioUrl: String? = nil, audioDuration: Int? = nil, originalLanguage: String? = nil, location: SharedPlace? = nil, mentions: [PostMentionInput]? = nil, discoverabilityPrecision: DiscoverabilityPrecision? = nil) async {
        publishError = nil
        publishSuccess = false

        // U1 ST3 — a text-only POST routes through the durable outbox so it
        // survives offline + app kill (the direct postService.create below was
        // silently lost when offline). Media / audio posts stay on the direct
        // path for now (their assets are not yet durably queued — U1b).
        //
        // NE PAS réécrire ici que « seul type == "POST" peut être réconcilié » :
        // `core.ts` ne bifurque qu'entre STORY, STATUS et TOUT LE RESTE, et un
        // RÉEL passe par la même branche `else` qu'un POST — son cmid EST
        // échoué, et `postCreated` réconcilie par cmid SEUL, sans regarder le
        // type. La phrase énonçait plus étroit que le code, et un vocal enfilé
        // en `"REEL"` en dépend directement.
        let hasMedia = !(mediaIds?.isEmpty ?? true)
        // Task 17 — `CreatePostPayload` porte désormais `location` : un post
        // texte + position peut passer par la file durable comme n'importe
        // quel autre post texte, sa position survivant au flush.
        let isDurableTextOnly = type == "POST"
            && !hasMedia
            && audioUrl == nil
        if isDurableTextOnly,
           let text = content,
           !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            await enqueueDurableTextPost(content: text, visibility: visibility, visibilityUserIds: visibilityUserIds, originalLanguage: originalLanguage, location: location, mentions: mentions, discoverabilityPrecision: discoverabilityPrecision, storyEffects: nil, type: PostType.post.rawValue)
            return
        }

        do {
            let apiPost = try await postService.create(
                content: content,
                type: type,
                visibility: visibility,
                visibilityUserIds: visibilityUserIds,
                moodEmoji: nil,
                mediaIds: mediaIds,
                audioUrl: audioUrl,
                audioDuration: audioDuration,
                originalLanguage: originalLanguage,
                mobileTranscription: nil,
                repostOfId: nil,
                location: location,
                mentions: mentions,
                allowSoundExtraction: nil,
                mediaAlt: nil,
                // Le composer de FIL ne collecte pas encore de textes par
                // média — il n'a pas d'inspecteur média (#4045). `nil` dit
                // « je n'en parle pas », jamais « efface ».
                mediaCaption: nil,
                discoverabilityPrecision: discoverabilityPrecision
            )
            let feedPost = apiPost.toFeedPost(preferredLanguages: preferredLanguages)
            insertPublished(feedPost)
            debouncedCacheSave()
            publishSuccess = true

            // Persist to GRDB
            if let persistence = feedPersistence, let record = PostRecord(from: apiPost) {
                Task.detached(priority: .utility) {
                    try? await persistence.insertPost(record)
                }
            }
        } catch {
            publishError = DailyGestureLimitNotice.refusalText(error) ?? error.localizedDescription
        }
    }

    /// Publie un post/réel dont l'audio est un son EMPRUNTÉ à la bibliothèque.
    ///
    /// Aucun média à uploader : la piste `soundId` du blob `storyEffects` porte
    /// tout — le serveur enregistre un usage (`SoundUsage`) au lieu de capturer,
    /// et la règle de composition REEL compte la durée du son (miroir gateway).
    /// Passe par `APIClient` directement : `PostServiceProviding.create` ne
    /// transporte pas de `storyEffects`, et élargir le protocole pour un seul
    /// appel imposerait le champ à tous ses mocks.
    ///
    /// - Parameter mentions: les personnes que le composer nommait déjà quand
    ///   l'auteur a choisi un son emprunté plutôt que d'enregistrer — troisième
    ///   chemin audio, oublié la première fois que les deux autres l'ont gagné.
    func createBorrowedSoundPost(type: String, visibility: String = "PUBLIC", storyEffects: StoryEffects, mentions: [PostMentionInput]? = nil) async {
        publishError = nil
        publishSuccess = false
        do {
            let request = CreatePostRequest(
                type: type,
                visibility: visibility,
                storyEffects: storyEffects.sanitizedForServerPublish(),
                mentions: mentions
            )
            let response: APIResponse<APIPost> = try await api.request(
                PostsEndpoint.root,
                method: "POST",
                body: try JSONEncoder().encode(request)
            )
            let apiPost = response.data
            let feedPost = apiPost.toFeedPost(preferredLanguages: preferredLanguages)
            insertPublished(feedPost)
            debouncedCacheSave()
            publishSuccess = true

            if let persistence = feedPersistence, let record = PostRecord(from: apiPost) {
                Task.detached(priority: .utility) {
                    try? await persistence.insertPost(record)
                }
            }
        } catch {
            publishError = error.localizedDescription
        }
    }

    /// U1 ST3 — inserts an optimistic post keyed by a fresh cmid and enqueues a
    /// durable `.createPost` row. The post appears instantly; the OutboxFlusher
    /// dispatches it (POST /posts with `X-Client-Mutation-Id`) and the gateway
    /// echoes the cmid on `post:created`, where FeedViewModel reconciles the
    /// optimistic post in place (cmid -> server id). Rolls back if the outbox
    /// refuses the row synchronously, or later exhausts its retry budget.
    /// **Le canvas passe AUSSI par ici** (#4756) : une scène faite d'un fond de
    /// couleur et d'objets texte n'a AUCUN fichier local, donc `publish(_:)`
    /// l'aiguille ici. Voir `PublishIntent.storyEffects`.
    private func enqueueDurableTextPost(content: String, visibility: String, visibilityUserIds: [String]? = nil, originalLanguage: String?, location: SharedPlace? = nil, mentions: [PostMentionInput]? = nil, discoverabilityPrecision: DiscoverabilityPrecision? = nil, storyEffects: StoryEffects?, type: String) async {
        let cmid = ClientMutationId.generate()
        let currentUser = AuthManager.shared.currentUser
        var optimistic = FeedPost(
            id: cmid,
            author: currentUser?.displayName ?? currentUser?.username ?? "",
            authorId: currentUser?.id ?? "",
            authorUsername: currentUser?.username,
            authorAvatarURL: currentUser?.avatar,
            type: "POST",
            content: content,
            timestamp: Date(),
            originalLanguage: originalLanguage
        )
        optimistic.location = location
        // La scène dès la carte optimiste (#4756) — `var`, posée après l'`init`.
        optimistic.storyEffects = storyEffects
        posts.insert(optimistic, at: 0)
        debouncedCacheSave()

        let payload = CreatePostPayload(
            clientMutationId: cmid,
            content: content,
            attachmentIds: [],
            visibility: visibility,
            originalLanguage: originalLanguage,
            // Sans lui, la charge persistée n'a AUCUN type et le gateway
            // applique son défaut `POST` (#5197). Il précède
            // `visibilityUserIds` : l'ordre suit la DÉCLARATION de
            // `CreatePostPayload.init`, que Swift n'autorise pas à réordonner.
            type: type,
            visibilityUserIds: visibilityUserIds,
            location: location,
            // `nil` et non `[]` quand rien n'est déclaré : le payload persisté
            // porte un VERDICT, et « je n'en parle pas » n'est pas « efface ».
            mentions: (mentions?.isEmpty ?? true) ? nil : mentions,
            // Le consentement de découvrabilité survit au flush pour la même
            // raison que `location` : sans lui ici, cocher « trouvable à
            // proximité » sur un post TEXTE — le cas nominal, qui n'emprunte
            // que cette file — n'aurait aucun effet, et rien ne le dirait.
            discoverabilityPrecision: discoverabilityPrecision,
            storyEffects: storyEffects
        )
        do {
            try await offlineQueue.enqueue(.createPost, payload: payload, conversationId: nil)
            publishSuccess = true
            observeOutcome(cmid: cmid, rollback: { [weak self] in
                self?.removeOptimisticPost(id: cmid)
            }, toast: String(localized: "feed.post.publish.error", defaultValue: "Erreur lors de la publication", bundle: .main))
        } catch {
            removeOptimisticPost(id: cmid)
            publishError = error.localizedDescription
        }
    }

    /// A post/reel is "stuck offline" (recoverable as a composer draft) once it
    /// has been unsent for longer than this — the "pas envoyé dans la minute →
    /// offline" rule shared by every composer. `nonisolated` so it can be read
    /// from any isolation (matches `SyncPillViewModel.staleInflightThreshold`).
    nonisolated static let offlineStuckThreshold: TimeInterval = 60

    /// **Le geste « je publie ce que j'ai produit ».**
    ///
    /// Un `PublishIntent` est une matière composée UNE fois, à un endroit
    /// nommé : ce publieur ne la recompose pas, il la transporte. C'est tout
    /// l'objet du lot — deux points d'entrée d'un même geste (un enregistrement
    /// vocal) le composaient chacun à leur façon et divergeaient sur trois
    /// points à la fois, dont la DESTRUCTION du fichier de l'utilisateur.
    ///
    /// **Aucune condition réseau ici, et c'est une décision.** Un enregistrement
    /// local part par la file durable EN LIGNE COMME HORS LIGNE. Ce qu'on y perd
    /// est mesuré et nul (aucun des deux jumeaux n'écrivait `uploadProgress`) ;
    /// ce qu'on y gagne, c'est un post optimiste immédiat qui survit à un kill.
    /// Y remettre une condition ferait renaître deux comportements, et la
    /// branche la moins empruntée serait — comme hier — celle qui détruit. Une
    /// garde de source le retient.
    ///
    /// Le jeton de l'intention est repris tel quel : c'est LUI qui clé le post
    /// optimiste, et c'est par lui que l'écho du gateway le remplacera au flush.
    func publish(_ intent: PublishIntent) async {
        publishError = nil
        publishSuccess = false
        await enqueueDurableMediaPost(
            clientMutationId: intent.clientMutationId,
            localMediaURLs: intent.localMediaURLs,
            localMediaMimeTypes: intent.localMediaMimeTypes,
            content: intent.content,
            visibility: intent.visibility,
            visibilityUserIds: intent.visibilityUserIds,
            originalLanguage: intent.originalLanguage,
            type: intent.type,
            location: intent.location,
            mentions: intent.mentions,
            discoverabilityPrecision: intent.discoverabilityPrecision,
            mobileTranscription: intent.mobileTranscription,
            storyEffects: intent.storyEffects,
            mediaCaptions: intent.mediaCaptions,
            // **Un relais qui RECOPIE champ par champ est un inventaire à
            // tenir à jour**. Ce site s'arrêtait aux légendes:
            // `mediaAlts` et `mediaObjectIds`, ajoutés en amont le même jour,
            // y mouraient en silence — l'intention les portait, le relais ne
            // les nommait pas, et rien ne rougissait.
            //
            // > C'est la forme que le `CLAUDE.md` documente sur
            // > `createMentionNotificationsBatch` : « il en recopiait neuf,
            // > retenant en silence chaque champ ajouté en amont ». Un relais
            // > exhaustif ne se vérifie pas en le lisant — il se vérifie en
            // > comptant, et c'est ce que fait `PublishIntentRelayTests`.
            mediaAlts: intent.mediaAlts,
            mediaObjectIds: intent.mediaObjectIds,
            allowSoundExtraction: intent.allowSoundExtraction, commentsDisabled: intent.commentsDisabled
        )
    }

    /// Le cœur de `publish(_:)` — insertion optimiste +
    /// enfilage durable. Il prend le jeton en paramètre plutôt que de le
    /// fabriquer : `publish(_:)` doit reprendre celui de l'intention, sans quoi
    /// le post optimiste serait clé par un identifiant que rien n'échoue, et le
    /// vocal apparaîtrait EN DOUBLE au flush.
    private func enqueueDurableMediaPost(
        clientMutationId cmid: String,
        localMediaURLs: [URL],
        localMediaMimeTypes: [String]?,
        content: String?,
        visibility: String,
        visibilityUserIds: [String]?,
        originalLanguage: String?,
        type: String,
        location: SharedPlace?,
        mentions: [PostMentionInput]?,
        discoverabilityPrecision: DiscoverabilityPrecision?,
        mobileTranscription: MobileTranscriptionPayload?,
        storyEffects: StoryEffects?,
        mediaCaptions: [String?]?,
        /// Les alternatives textuelles et l'identifiant d'objet de canvas.
        /// Sans défaut : ce cœur est le point de passage des DEUX entrées, et
        /// c'est ici qu'un champ oublié se perdrait pour les deux à la fois.
        mediaAlts: [String?]?,
        mediaObjectIds: [String?]?,
        /// L'autorisation d'extraction du son (#3996) — même discipline que
        /// `mediaAlts`/`mediaObjectIds` juste au-dessus : ce cœur est le point
        /// de passage des DEUX entrées, et c'est ici qu'un champ oublié se
        /// perdrait pour les deux à la fois.
        allowSoundExtraction: Bool?, commentsDisabled: Bool?
    ) async {
        let currentUser = AuthManager.shared.currentUser
        var optimistic = FeedPost(
            id: cmid,
            author: currentUser?.displayName ?? currentUser?.username ?? "",
            authorId: currentUser?.id ?? "",
            authorUsername: currentUser?.username,
            authorAvatarURL: currentUser?.avatar,
            type: type,
            content: content ?? "",
            timestamp: Date(),
            media: PendingPublicationLocalMedia.optimisticMedia(localMediaURLs, declaredMimeTypes: localMediaMimeTypes),
            originalLanguage: originalLanguage
        )
        optimistic.storyEffects = storyEffects   // la scène, #4756
        posts.insert(optimistic, at: 0)
        debouncedCacheSave()

        do {
            let enqueued = try await offlineQueue.enqueuePostMedia(
                sourceMediaURLs: localMediaURLs,
                // Le MIME que l'expéditeur a DÉCLARÉ, et non celui que
                // l'extension laissera deviner : les deux divergent dès qu'un
                // conteneur audio sort de la table, et le gateway perd alors la
                // nature audio du fichier.
                sourceMediaMimeTypes: localMediaMimeTypes,
                clientMutationId: cmid,
                content: content,
                visibility: visibility,
                visibilityUserIds: visibilityUserIds,
                originalLanguage: originalLanguage,
                type: type,
                location: location,
                mentions: (mentions?.isEmpty ?? true) ? nil : mentions,
                // Voyage avec `location`, et pour la même raison : un REEL
                // composé hors ligne emportait sa position mais jamais son
                // consentement, donc le gateway laissait `geoPoint` nul et la
                // case cochée par l'utilisateur n'avait aucun effet.
                discoverabilityPrecision: discoverabilityPrecision,
                // Ce qui QUALIFIE un enregistrement vocal : sans lui, le
                // serveur re-transcrit et jette en silence le texte que
                // l'auteur a relu avant d'envoyer.
                mobileTranscription: mobileTranscription,
                storyEffects: storyEffects,
                // Les légendes voyagent par l'INDEX du fichier (#4756) : l'id
                // serveur n'existera qu'à l'upload, et le dispatcher fait
                // seul la traduction.
                mediaCaptions: mediaCaptions,
                // **TRANSMIS, plus posés à `nil`**.
                //
                // Ils l'étaient, sous un commentaire qui disait « ce site n'en
                // a aucune » — vrai de l'entrée `createOfflineMediaPost` (la
                // feuille du fil n'a ni éditeur d'objet ni scène), FAUX de
                // `publish(_:)`, qui relaie une intention composée au MEUBLE
                // et qui en porte.
                //
                // > **Un `nil` justifié par le cas d'UN appelant devient un
                // > mensonge dès qu'un second appelant partage la fonction.**
                // > Le commentaire décrivait honnêtement une moitié de la
                // > vérité, et c'est exactement ce qui l'a rendu invisible :
                // > il se relit comme une décision, pas comme un oubli.
                //
                // Mesuré : `adoption IMPOSSIBLE: effets=true objectIds=-1
                // mediaObjects=1` — le canvas et ses objets étaient là, le
                // pont était nul, et l'adoption ne pouvait pas avoir lieu.
                mediaAlts: mediaAlts,
                mediaObjectIds: mediaObjectIds,
                allowSoundExtraction: allowSoundExtraction, commentsDisabled: commentsDisabled
            )
            showRelocatedMedia(of: cmid, storedPaths: enqueued.localMediaPaths)
            publishSuccess = true
            observeOutcome(cmid: cmid, rollback: { [weak self] in
                self?.removeOptimisticPost(id: cmid)
            }, toast: String(localized: "feed.post.publish.error", defaultValue: "Erreur lors de la publication", bundle: .main))
        } catch {
            removeOptimisticPost(id: cmid)
            publishError = error.localizedDescription
        }
    }
}
