import Foundation
import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

extension FeedViewModel {
    // MARK: - Socket.IO Real-Time Updates

    func subscribeToSocketEvents() {
        guard socketCancellables.isEmpty else { return }
        let isRearm = hasSubscribedOnce
        hasSubscribedOnce = true
        socialSocket.connect()
        // stores-02 — connect() est un no-op si le socket est déjà connecté :
        // le handler .connect (seul émetteur de feed:subscribe) ne rejoue pas,
        // et la room feed quittée par unsubscribeFromSocketEvents() n'était
        // jamais rejointe. Émission idempotente (rejoindre une room déjà
        // jointe = no-op) ; socket pas encore prêt → l'emit est perdu mais
        // rejoué par le handler .connect.
        socialSocket.subscribeFeed()
        if isRearm {
            // rts-01 — même chemin que le sink didReconnect ci-dessous, pour
            // l'aller-retour d'écran SANS coupure réseau (didReconnect ne
            // couvre que le flap) : gardé par isFeedLoadInProgress, silencieux
            // (showLoading: posts.isEmpty), et mergePreservingRealtimeHead
            // protège les posts insérés par un sink pendant le vol.
            Task { await self.refreshHeadKeepingLoadedPages() }
        }

        // --- didReconnect → backfill du feed ---
        // Apres un flap reseau, le gateway a oublie nos rooms et des posts ont pu
        // etre crees pendant la coupure. Un refresh (forceRefresh) recharge la tete
        // du feed ; mergePreservingRealtimeHead conserve les posts inseres en temps
        // reel. Miroir de ConversationSyncEngine sur messageSocket.didReconnect.
        socialSocket.didReconnect
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in
                guard let self else { return }
                Task { await self.refreshHeadKeepingLoadedPages() }
            }
            .store(in: &socketCancellables)

        // --- post:created ---
        socialSocket.postCreated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                guard let self else { return }
                let feedPost = payload.post.toFeedPost(preferredLanguages: preferredLanguages)
                // U1 — reconcile an offline-created optimistic post: it was
                // inserted with the cmid as its id (U1 ST3), so the server echo
                // (carrying that cmid) replaces it in place — swapping cmid →
                // server id — instead of inserting a duplicate. Preserve local-
                // only state (isLiked) across the swap, like postUpdated.
                if let cmid = payload.clientMutationId,
                   let idx = self.posts.firstIndex(where: { $0.id == cmid }) {
                    var merged = feedPost
                    merged.isLiked = self.posts[idx].isLiked
                    self.posts[idx] = merged
                    self.debouncedCacheSave()
                    return
                }
                if !self.posts.contains(where: { $0.id == feedPost.id }) {
                    self.posts.insert(feedPost, at: 0)
                    self.newPostsCount += 1
                    self.debouncedCacheSave()
                }
            }
            .store(in: &socketCancellables)

        // --- post:updated ---
        socialSocket.postUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiPost in
                guard let self else { return }
                let updatedFeedPost = apiPost.toFeedPost(preferredLanguages: preferredLanguages)
                if let index = self.posts.firstIndex(where: { $0.id == updatedFeedPost.id }) {
                    // Preserve local-only state (isLiked) across the update
                    var merged = updatedFeedPost
                    merged.isLiked = self.posts[index].isLiked
                    self.posts[index] = merged
                    self.debouncedCacheSave()
                }
            }
            .store(in: &socketCancellables)

        // --- post:deleted ---
        socialSocket.postDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] postId in
                self?.posts.removeAll { $0.id == postId }
                self?.debouncedCacheSave()
            }
            .store(in: &socketCancellables)

        // --- post:liked --- (compteur ABSOLU, source unique du like de post)
        socialSocket.postLiked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                self.posts[index].likes = data.likeCount
                // Persister `isLiked` pour l'acteur → le cache reste correct au cold
                // start (le seeding `postLikedIds` relit `post.isLiked`).
                if data.userId == AuthManager.shared.currentUser?.id {
                    self.posts[index].isLiked = true
                }
                self.debouncedCacheSave()
            }
            .store(in: &socketCancellables)

        // --- post:unliked ---
        socialSocket.postUnliked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                self.posts[index].likes = data.likeCount
                if data.userId == AuthManager.shared.currentUser?.id {
                    self.posts[index].isLiked = false
                }
                self.debouncedCacheSave()
            }
            .store(in: &socketCancellables)

        // --- post:bookmarked ---
        // Le favori est PERSONNEL : le gateway n'émet `post:bookmarked` que vers la
        // feed room du viewer (toutes ses sessions/vues, dont le reel viewer). On
        // réconcilie `isBookmarkedByMe` sur le post → le re-seed du reel viewer
        // depuis `FeedViewModel.posts` porte le bon état (favori persistant).
        socialSocket.postBookmarked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] payload in
                guard let self else { return }
                if let index = self.posts.firstIndex(where: { $0.id == payload.postId }) {
                    self.posts[index].isBookmarkedByMe = payload.bookmarked
                    // Absolute count (when the gateway provides it) is authoritative
                    // → the feed reconciles the displayed count live, no reload.
                    if let count = payload.bookmarkCount {
                        self.posts[index].bookmarkCount = count
                    }
                }
                self.debouncedCacheSave()
            }
            .store(in: &socketCancellables)

        // --- post:reposted ---
        socialSocket.postReposted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self else { return }
                // `post:reposted` n'est pas type : une story repostee y arrivait
                // et entrait dans le fil, alors qu'elle vit dans le tray.
                // `getFeed` ne sert que `[POST, REEL]` — meme partage ici.
                guard !data.repost.belongsToStoryTray else { return }
                let repostFeedPost = data.repost.toFeedPost(preferredLanguages: self.preferredLanguages)
                if !self.posts.contains(where: { $0.id == repostFeedPost.id }) {
                    self.posts.insert(repostFeedPost, at: 0)
                    self.newPostsCount += 1
                    self.debouncedCacheSave()
                }
            }
            .store(in: &socketCancellables)

        // --- comment:added ---
        socialSocket.commentAdded
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                // Prisme + effects parity with the REST comment mapping
                // (`toFeedPost`/`loadComments`): a comment arriving in real
                // time while the feed is open used to render as a blank row
                // for a media/effect comment (effectFlags dropped) and
                // always in its original language (no resolveCommentTranslation),
                // and lost the "liked by me" heart on a comment that already
                // carried reactions when it landed (currentUserReactions dropped).
                let feedComment = FeedComment(api: data.comment, preferredLanguages: self.preferredLanguages)
                // Écho de NOTRE propre envoi : la ligne optimiste a été insérée
                // sous l'id local `cmid` (sendComment) — la remplacer en place,
                // sinon l'écho (id serveur ≠ cmid) passait la dédup par id et
                // insérait un doublon visible jusqu'au prochain refresh.
                if let cmid = data.clientMutationId,
                   let optimisticIdx = self.posts[index].comments.firstIndex(where: { $0.id == cmid }) {
                    self.posts[index].comments[optimisticIdx] = feedComment
                } else if !self.posts[index].comments.contains(where: { $0.id == feedComment.id }) {
                    self.posts[index].comments.insert(feedComment, at: 0)
                }
                self.posts[index].commentCount = data.commentCount
                self.debouncedCacheSave()
            }
            .store(in: &socketCancellables)

        // --- comment:deleted ---
        socialSocket.commentDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                self.posts[index].commentCount = data.commentCount
                self.debouncedCacheSave()
            }
            .store(in: &socketCancellables)

        // --- post:translation-updated ---
        socialSocket.postTranslationUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] (data: SocketPostTranslationUpdatedData) in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                let translation = PostTranslation(
                    text: data.translation.text,
                    translationModel: data.translation.translationModel,
                    confidenceScore: data.translation.confidenceScore
                )
                let langs = self.preferredLanguages
                let language = data.language
                let preserveOverride = self.manualTranslationOverrides.contains(data.postId)
                // Batch mutations into a single array assignment
                var post = self.posts[index]
                Self.applyPostTranslation(translation, language: language,
                                          preferredLanguages: langs,
                                          preserveManualOverride: preserveOverride, to: &post)
                self.posts[index] = post
                // Un post vit sous PLUSIEURS clés (main-feed, sa clé détail,
                // bookmarks, pager reels) : `debouncedCacheSave` ne réécrit que
                // « main-feed », donc la traduction n'existait que là et
                // repartait de zéro dès qu'une autre surface servait le post.
                let postId = data.postId
                Task.detached(priority: .utility) { [feedCache = self.feedCache] in
                    await feedCache.patchEverywhere(itemId: postId) {
                        Self.applyPostTranslation(translation, language: language,
                                                  preferredLanguages: langs,
                                                  preserveManualOverride: preserveOverride, to: &$0)
                    }
                }
                self.debouncedCacheSave()
            }
            .store(in: &socketCancellables)

        // --- comment:translation-updated ---
        socialSocket.commentTranslationUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] (data: SocketCommentTranslationUpdatedData) in
                guard let self, let postIndex = self.posts.firstIndex(where: { $0.id == data.postId })
                else { return }
                let langs = self.preferredLanguages
                let language = data.language
                let commentId = data.commentId
                let text = data.translation.text
                var post = self.posts[postIndex]
                let changed = Self.applyCommentTranslation(
                    text, commentId: commentId, language: language,
                    preferredLanguages: langs, to: &post
                )
                guard changed else { return }
                self.posts[postIndex] = post
                let postId = data.postId
                Task.detached(priority: .utility) { [feedCache = self.feedCache] in
                    await feedCache.patchEverywhere(itemId: postId) {
                        _ = Self.applyCommentTranslation(
                            text, commentId: commentId, language: language,
                            preferredLanguages: langs, to: &$0
                        )
                    }
                }
                self.debouncedCacheSave()
            }
            .store(in: &socketCancellables)

        // --- media:caption-translation-updated (#6280) — FeedViewModel+MediaCaptionTranslation.swift ---
        socialSocket.mediaCaptionTranslationUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.receiveMediaCaptionTranslation($0) }
            .store(in: &socketCancellables)
    }

    /// Règle unique de pose d'une traduction de post — appliquée à l'exemplaire
    /// en mémoire ET à chaque exemplaire en cache. La traduction reçue est
    /// TOUJOURS fusionnée dans `post.translations` ; le texte AFFICHÉ est
    /// re-résolu par la descente unique du Prisme (`FeedPost.resolved`), qui
    /// parcourt `preferredLanguages` dans l'ordre et fait concourir la langue
    /// d'origine à SON rang (règle 3 du Prisme — jamais un court-circuit).
    /// Avant #6531, la première traduction reçue dont la langue figurait
    /// N'IMPORTE OÙ dans le Prisme devenait le texte affiché : arrivée dans le
    /// désordre (`pt` avant `en` avec Prisme `[en, pt]`), ou langue d'origine
    /// de rang 1 détrônée par une traduction de rang inférieur.
    ///
    /// `preserveManualOverride` protège un choix EXPLICITE du lecteur (tap
    /// d'un drapeau, `setTranslationOverride`) : la traduction est mergée,
    /// mais l'affichage courant n'est pas touché.
    nonisolated static func applyPostTranslation(
        _ translation: PostTranslation,
        language: String,
        preferredLanguages: [String],
        preserveManualOverride: Bool = false,
        to post: inout FeedPost
    ) {
        var translations = post.translations ?? [:]
        translations[language] = translation
        post.translations = translations
        guard !preserveManualOverride else { return }
        post = post.resolved(preferredLanguages: preferredLanguages)
    }

    /// Idem pour un commentaire. Retourne `false` quand rien ne change — le
    /// sink s'en sert pour ne pas réécrire le cache pour rien.
    ///
    /// `FeedComment` ne porte pas de dictionnaire `translations` (contrairement
    /// à `FeedPost`) : une seule traduction est mémorisée à la fois, donc une
    /// résolution complète par rang (comme `FeedPost.resolved`) n'est pas
    /// possible ici sans élargir le modèle. Ce que cette garde corrige quand
    /// même (#6531) : la langue D'ORIGINE, quand elle occupe un rang AU MOINS
    /// AUSSI prioritaire que la traduction qui arrive, n'est plus détrônée —
    /// c'est le même défaut que celui démontré sur les posts, reproductible à
    /// l'identique sur un commentaire. L'ordre d'arrivée ENTRE deux
    /// traductions non-originales reste, lui, non résolu par ce correctif.
    nonisolated static func applyCommentTranslation(
        _ text: String,
        commentId: String,
        language: String,
        preferredLanguages: [String],
        to post: inout FeedPost
    ) -> Bool {
        guard let index = post.comments.firstIndex(where: { $0.id == commentId }) else { return false }
        let comment = post.comments[index]
        // La traduction rejoint TOUJOURS le dictionnaire du commentaire, et le
        // texte affiché se re-résout par la descente du Prisme : une langue
        // non préférée aujourd'hui servira après un changement de langue.
        let updated = comment.mergingTranslation(text, language: language, preferredLanguages: preferredLanguages)
        guard updated.translatedContent != comment.translatedContent
                || updated.translations?[language]?.text != comment.translations?[language]?.text
        else { return false }
        post.comments[index] = updated
        return true
    }

    /// Coupe les sinks d'UI du feed. Le pont de persistance GRDB
    /// (`FeedSocketHandler`) N'EST PAS désarmé ici : il est armé une fois pour
    /// toutes au niveau app (`RootView`), parce que la persistance disque ne
    /// doit dépendre d'aucun écran monté.
    func unsubscribeFromSocketEvents() {
        socketCancellables.removeAll()
        socialSocket.unsubscribeFeed()
    }
}
