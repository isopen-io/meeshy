/// Préchargement des médias de story (images / vidéo / audio), épinglage LRU
/// hors-ligne (une story VUE reste relisible jusqu'à son expiry — ses médias
/// sont protégés de l'éviction budget) et rendu des couvertures de tray côté
/// auteur (cover locale composite) comme côté récepteur (`StoryCoverThumbnail`).
///
/// Extrait de `StoryViewModel.swift` (#4425) — voir ce fichier pour l'état
/// stocké (`prefetchedMediaURLs`, `attemptedReceiverCoverStoryIds`, …).

import Foundation
import SwiftUI
import os
import MeeshySDK
import MeeshyUI

/// Local-first story-cover thumbnail (hybrid Phase 1).
///
/// The story tray/feed normally shows a SERVER-generated `thumbnailUrl` built from
/// the raw background asset — which can never contain the composer's text/drawing
/// overlays (those live as JSON effects, never baked: RAW-publish / Prisme). So on
/// send we render the FULL slide composite (bg incl. video frame + text + drawing +
/// media + stickers + filter, via `StorySlideRenderer.renderComposite`) and cache it
/// locally, keyed by the published story id. The tray prefers this local cover for
/// the author's own stories — instant, no backend, no baked upload. Other viewers
/// keep the server thumbnail until Phase 2 (baked cover upload) ships.
enum StoryCoverThumbnail {
    /// Delegates to the SDK scheme (`StoryCoverCacheKey`) — shared with the draft
    /// autosave hook, which lives SDK-side and cannot see this app-side type.
    static let renderSize = StoryCoverCacheKey.renderSize

    static func cacheKey(storyId: String) -> String { StoryCoverCacheKey.key(for: storyId) }

    /// Tray cover resolution order: locally-rendered composite (captures every layer)
    /// → server thumbnail → raw media URL (image only — `CachedAvatarImage` cannot
    /// decode a video file) → author avatar. Pure + testable.
    static func preferredCoverURLString(
        localCover: URL?,
        serverThumbnailUrl: String?,
        mediaUrl: String?,
        mediaIsImage: Bool,
        avatarURL: String?
    ) -> String? {
        if let localCover { return localCover.absoluteString }
        if let t = serverThumbnailUrl, !t.isEmpty { return t }
        if mediaIsImage, let u = mediaUrl, !u.isEmpty { return u }
        return avatarURL
    }

    /// Plan de rendu d'une cover côté RÉCEPTEUR (aperçu à la volée) : quelles
    /// images charger et dans quel slot du renderer les injecter. Une story
    /// texte/fond coloré (± audio) est rendable sans aucune image ; un fond
    /// visuel image doit être chargé (couche dominante) ; un fond VIDÉO n'a
    /// pas de poster frame côté récepteur → pas de plan, la chaîne
    /// `preferredCoverURLString` garde la main. Pure + testable.
    struct ReceiverCoverPlan: Equatable {
        /// Fond legacy (premier média image du post) → paramètre `bgImage`.
        var legacyBackgroundURL: String?
        /// Images par id d'objet (fond moderne inclus) → `loadedImages`.
        var imageURLsByObjectId: [String: String]
        /// Objets dont l'image est indispensable (fond moderne) : échec de
        /// chargement = pas de cover plutôt qu'une cover sans sa couche dominante.
        var requiredObjectIds: Set<String>
    }

    static func receiverCoverPlan(for item: StoryItem) -> ReceiverCoverPlan? {
        guard let effects = item.storyEffects else { return nil }
        var plan = ReceiverCoverPlan(
            legacyBackgroundURL: nil, imageURLsByObjectId: [:], requiredObjectIds: []
        )

        // Les `PostMedia` que la composition référence par ses STICKERS : ils
        // sont attachés au post comme n'importe quel média, donc le repli
        // legacy ci-dessous les prendrait pour le fond et peindrait l'image
        // d'un sticker PLEIN CADRE derrière la composition.
        let stickerMediaIds = Set(
            (effects.stickerObjects ?? []).map(\.postMediaId).filter { !$0.isEmpty }
        )

        if let bg = effects.resolvedBackgroundMedia {
            let url = bg.mediaURL ?? item.media.first(where: { $0.id == bg.postMediaId })?.url
            guard bg.kind == .image, let url, !url.isEmpty else { return nil }
            plan.imageURLsByObjectId[bg.id] = url
            plan.requiredObjectIds.insert(bg.id)
        } else if let legacyVisual = item.media.first(where: {
            ($0.type == .image || $0.type == .video) && !stickerMediaIds.contains($0.id)
        }) {
            guard legacyVisual.type == .image, let url = legacyVisual.url, !url.isEmpty else { return nil }
            plan.legacyBackgroundURL = url
        }

        for obj in effects.resolvedForegroundMediaObjects where obj.kind == .image {
            let url = obj.mediaURL ?? item.media.first(where: { $0.id == obj.postMediaId })?.url
            if let url, !url.isEmpty { plan.imageURLsByObjectId[obj.id] = url }
        }

        // Sticker IMAGE : son asset est un `PostMedia` du post comme un autre,
        // et il entre dans le renderer par le MÊME slot `loadedImages`, sous
        // l'id d'ÉLÉMENT. Jamais `required` : sans son image le renderer peint
        // l'emoji de repli, ce qui vaut mieux que pas de cover du tout.
        for sticker in effects.stickerObjects ?? [] where !sticker.postMediaId.isEmpty {
            let url = item.media.first(where: { $0.id == sticker.postMediaId })?.url
            if let url, !url.isEmpty { plan.imageURLsByObjectId[sticker.id] = url }
        }

        let hasVisualBackground = plan.legacyBackgroundURL != nil || !plan.requiredObjectIds.isEmpty
        let hasDrawableContent = !effects.textObjects.isEmpty
            || effects.drawingData != nil
            || !(effects.background ?? "").isEmpty
        guard hasVisualBackground || hasDrawableContent else { return nil }
        return plan
    }

    /// La DERNIÈRE story de chaque groupe (celle que la tuile du tray montre),
    /// hors stories déjà couvertes par un composite local. Pure + testable.
    static func receiverCoverCandidates(
        groups: [StoryGroup],
        hasLocalCover: (String) -> Bool
    ) -> [StoryItem] {
        groups.compactMap { group in
            guard let last = group.stories.last, !hasLocalCover(last.id) else { return nil }
            return last
        }
    }
}

extension StoryViewModel {
    /// Aperçu à la volée côté récepteur : rend le composite (texte + fond +
    /// couches) de la dernière story de chaque groupe depuis ses `StoryEffects`
    /// et le stocke sous `StoryCoverThumbnail.cacheKey(storyId:)` — le même
    /// emplacement que la cover locale de l'auteur, que la tuile du tray
    /// préfère déjà à tout le reste. Aucun upload : le texte reste re-rendable
    /// par viewer (Prisme) et les stories DÉJÀ publiées gagnent un aperçu.
    func renderMissingReceiverCovers() {
        let candidates = StoryCoverThumbnail.receiverCoverCandidates(
            groups: storyGroups,
            hasLocalCover: { storyId in
                attemptedReceiverCoverStoryIds.contains(storyId)
                    || CacheCoordinator.thumbnailLocalFileURL(
                        for: StoryCoverThumbnail.cacheKey(storyId: storyId)
                    ) != nil
            }
        )
        guard !candidates.isEmpty else { return }
        attemptedReceiverCoverStoryIds.formUnion(candidates.map(\.id))

        Task(priority: .utility) { [weak self] in
            let imageCache = await CacheCoordinator.shared.images
            var storedAny = false

            for item in candidates {
                guard let plan = StoryCoverThumbnail.receiverCoverPlan(for: item) else { continue }

                var legacyBackground: UIImage?
                if let bgURL = plan.legacyBackgroundURL {
                    let resolved = MeeshyConfig.resolveMediaURL(bgURL)?.absoluteString ?? bgURL
                    legacyBackground = await imageCache.image(for: resolved)
                    guard legacyBackground != nil else { continue }
                }

                var loadedImages: [String: UIImage] = [:]
                for (objectId, urlString) in plan.imageURLsByObjectId {
                    let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
                    if let image = await imageCache.image(for: resolved) {
                        loadedImages[objectId] = image
                    }
                }
                guard plan.requiredObjectIds.allSatisfy({ loadedImages[$0] != nil }) else { continue }

                let slide = StorySlide(
                    id: item.id,
                    content: item.content,
                    effects: item.storyEffects ?? StoryEffects()
                )
                guard let cover = StorySlideRenderer.renderComposite(
                    slide: slide,
                    bgImage: legacyBackground,
                    loadedImages: loadedImages,
                    size: StoryCoverThumbnail.renderSize
                ), let jpeg = cover.jpegData(compressionQuality: 0.85) else { continue }

                await CacheCoordinator.shared.thumbnails.store(
                    jpeg, for: StoryCoverThumbnail.cacheKey(storyId: item.id)
                )
                storedAny = true
            }

            if storedAny {
                // #4002 — le MÊME signal invalide la mémoire de couverture :
                // `StoryCoverURLMemo` a pu mémoïser un `nil` que cette
                // écriture vient de rendre faux. Posé ici, et pas ailleurs,
                // parce que c'est le seul site qui SAIT qu'un fichier de
                // couverture vient d'atterrir.
                StoryCoverURLMemo.bumpGeneration()
                self?.receiverCoverRenderTick += 1
            }
        }
    }

    /// Prefetch all media for all story groups in the background.
    /// Downloads images to disk cache and prerolls video players for the first groups.
    /// First slide of each group is prefetched at high priority for instant display.
    func prefetchAllStoryMedia(_ groups: [StoryGroup]) {
        // Élargi de 5 → 8 groupes : sur un tray dense, précharger plus de bulles
        // rend les premières ouvertures instantanées sans exploser la mémoire (on
        // ne preroll l'AVPlayer que pour la première slide de chaque groupe).
        let groupsToPreload = Array(groups.prefix(8))

        // High priority: première slide non vue de chaque groupe (ce que l'utilisateur tape en premier).
        Task(priority: .userInitiated) { [weak self] in
            guard let self else { return }
            let imageCache = await CacheCoordinator.shared.images
            await withTaskGroup(of: [String].self) { taskGroup in
                for group in groupsToPreload {
                    guard let targetStory = group.stories.first(where: { !$0.isViewed }) ?? group.stories.first else { continue }
                    // Réclame (et marque) les URLs non encore préchargées sur le MainActor
                    // AVANT de dispatcher le child task (qui n'est pas isolé MainActor).
                    let urls = self.claimUnprefetchedURLs(for: targetStory)
                    guard !urls.isEmpty else { continue }
                    taskGroup.addTask {
                        await Self.prefetchStoryMediaURLs(urls, in: targetStory, imageCache: imageCache, prerollPlayer: true)
                    }
                }
                // Une URL sautée par la politique (ex: vidéo en cellulaire) n'est
                // PAS « déjà préchargée » — la retirer pour qu'un retour au Wi-Fi
                // en cours de session la rattrape (cf. claimUnprefetchedURLs ci-dessous).
                for await skipped in taskGroup {
                    self.prefetchedMediaURLs.subtract(skipped)
                }
            }
        }

        // Utility priority: jusqu'à n+2 slides à venir par groupe (fenêtre élargie
        // de 3 → 4 pour couvrir confortablement n+1 ET n+2 avant ouverture).
        // DO NOT preroll AVPlayer here; let `StoryReaderPrefetcher` handle JIT warming to save memory.
        Task(priority: .utility) { [weak self] in
            guard let self else { return }
            let imageCache = await CacheCoordinator.shared.images
            for group in groupsToPreload {
                guard !Task.isCancelled else { return }
                let firstUnviewedIndex = group.stories.firstIndex(where: { !$0.isViewed }) ?? 0
                let slidesToPrefetch = Array(group.stories.dropFirst(firstUnviewedIndex + 1).prefix(4))

                for story in slidesToPrefetch {
                    guard !Task.isCancelled else { return }
                    let urls = self.claimUnprefetchedURLs(for: story)
                    guard !urls.isEmpty else { continue }
                    let skipped = await Self.prefetchStoryMediaURLs(urls, in: story, imageCache: imageCache, prerollPlayer: false)
                    self.prefetchedMediaURLs.subtract(skipped)
                }
            }
        }
    }

    /// Calcule les URLs média d'une story, retire celles déjà préchargées dans la
    /// session, marque les nouvelles comme réclamées et les retourne. `@MainActor`
    /// (mutation de `prefetchedMediaURLs`) — appelé depuis les boucles de prefetch.
    private func claimUnprefetchedURLs(for story: StoryItem) -> [String] {
        let all = Self.mediaURLStrings(for: story)
        let fresh = all.filter { !prefetchedMediaURLs.contains($0) }
        prefetchedMediaURLs.formUnion(fresh)
        return fresh
    }

    // MARK: - Purge des stories mortes
    //
    // Le cache du tray (TTL 24 h) survit délibérément à la fenêtre de visibilité
    // d'une story (21 h) — on évite ainsi de re-télécharger avatars et
    // métadonnées à chaque démarrage à froid. La contrepartie : il continue de
    // porter des stories que le serveur ne renverra plus.
    //
    // Jusqu'ici rien ne les effaçait. L'expiry était traitée par masquage (le
    // tray filtre les groupes entièrement expirés) et par saut (le lecteur
    // saute les slides mortes) ; les suppressions n'arrivaient que par l'event
    // socket `story:deleted`, qui ne se rejoue pas — app fermée ou hors-ligne,
    // l'information était perdue. Une story disparue restait donc dans le
    // tray : impossible à revoir, jamais nettoyée, jusqu'à l'expiration du
    // cache 24 h ou un pull-to-refresh.

    /// Retire du tray, du cache disque et des pins média tout ce qui est mort.
    ///
    /// `deletedIds` : ids rapportés disparus par le serveur (tombstones du
    /// delta-sync) ou par l'event socket. L'expiry, elle, est déduite
    /// localement — le balayeur serveur ne passe qu'une fois par heure et le
    /// tray ne doit pas attendre son passage.
    ///
    /// `includingExpired: false` pour un retrait CIBLÉ (event socket, action de
    /// l'utilisateur) : un event qui annonce une disparition précise ne doit
    /// pas emporter avec lui tout ce qui a expiré par ailleurs. Le balayage
    /// d'expiry a lieu aux chargements du tray, là où il est attendu.
    ///
    /// Retourne les stories retirées (vide si rien à faire — aucune écriture de
    /// cache n'est alors déclenchée).
    @discardableResult
    func purgeDeadStories(deletedIds: Set<String> = [], includingExpired: Bool = true) -> [StoryItem] {
        let currentUserId = AuthManager.shared.currentUser?.id
        let now: Date? = includingExpired ? Date() : nil
        let deadIds = Set(storyGroups.deadStoryIds(
            currentUserId: currentUserId, deletedIds: deletedIds, now: now
        ))
        guard !deadIds.isEmpty else { return [] }

        // Capturées AVANT la purge : une fois hors du tray, plus rien ne permet
        // de retrouver les médias à libérer.
        let dead = storyGroups.flatMap(\.stories).filter { deadIds.contains($0.id) }
        storyGroups = storyGroups.purgingDeadStories(
            currentUserId: currentUserId, deletedIds: deletedIds, now: now
        )
        // Retirer une story peut faire basculer `hasUnviewed` d'un groupe, ou
        // le faire disparaître : l'ordre du tray change.
        sortStoryGroupsInPlace()
        persistStoryCache()
        // Le cache by-id sert les deep-links AVANT tout aller-retour réseau :
        // sans cette éviction, une notification ferait ressusciter à l'écran la
        // story qu'on vient de retirer du tray.
        storyService.invalidate(postIds: deadIds)
        releaseOfflineMedia(for: dead)
        Logger.messages.info("[StoryVM] purge de \(deadIds.count, privacy: .public) story(s) morte(s) du tray local")
        return dead
    }

    /// Rend évinçables les médias d'une story purgée.
    ///
    /// Une story vue voit ses médias ÉPINGLÉS sur disque jusqu'à son expiry
    /// (relecture hors-ligne) : sans ce dépinnage, ils resteraient protégés de
    /// l'éviction budget alors que plus rien ne peut les afficher.
    ///
    /// On dépingle sans supprimer les fichiers : un même média peut être
    /// partagé par une story et son repost, et supprimer les octets sous les
    /// pieds du repost survivant casserait sa lecture. Dépinglés, ils repassent
    /// sous le régime normal du cache (TTL + budget LRU).
    private func releaseOfflineMedia(for stories: [StoryItem]) {
        let targets = stories.flatMap { Self.pinTargets(for: $0) }
        guard !targets.isEmpty else { return }
        Task {
            for target in targets {
                switch target.store {
                case .video:
                    await CacheCoordinator.shared.video.unpin(target.urlString)
                case .audio:
                    await CacheCoordinator.shared.audio.unpin(target.urlString)
                case .images:
                    await CacheCoordinator.shared.images.unpin(target.urlString)
                }
            }
        }
    }

    /// Décision produit (app-side, cf. SDK purity) : une story VUE doit se
    /// relire offline → ses médias sont pinnés dans leurs stores jusqu'à
    /// l'expiry. Les pins échus s'auto-purgent côté `DiskCacheStore`.
    func pinStoryMediaForOfflineReplay(_ story: StoryItem) {
        let until = Self.pinDeadline(for: story)
        guard until > Date() else { return }
        let targets = Self.pinTargets(for: story)
        guard !targets.isEmpty else { return }
        Task {
            for target in targets {
                switch target.store {
                case .video:
                    await CacheCoordinator.shared.video.pin(target.urlString, until: until)
                case .audio:
                    await CacheCoordinator.shared.audio.pin(target.urlString, until: until)
                case .images:
                    await CacheCoordinator.shared.images.pin(target.urlString, until: until)
                }
            }
        }
    }

    /// Décision PURE : ce type de média de story doit-il être PRÉCHARGÉ, la
    /// politique d'auto-téléchargement étant déjà résolue ? Miroir exact de
    /// `BubbleCarouselView.shouldPrefetchAttachment` — extraite pour être
    /// testable sans monter la vue ni le monitor réseau.
    ///
    /// `.document` n'a pas de politique propre : il transite par le store
    /// `images` (branche `else` du routage ci-dessous), donc il suit `prefs.image`.
    nonisolated static func shouldPrefetchStoryMedia(
        kind: FeedMediaType,
        allowImage: Bool,
        allowVideo: Bool,
        allowAudio: Bool
    ) -> Bool {
        switch kind {
        case .video: return allowVideo
        case .audio: return allowAudio
        case .image, .document: return allowImage
        }
    }

    /// Prefetch les URLs (déjà filtrées) d'une story dans les stores disque + mémoire.
    /// Retourne les URLs SAUTÉES par la politique d'auto-téléchargement (ex:
    /// vidéo interdite en cellulaire), pour que l'appelant les retire de
    /// `prefetchedMediaURLs` — sinon la dédup de session les marque
    /// « déjà préchargées » à vie et un retour au Wi-Fi ne les rattrape jamais.
    private static func prefetchStoryMediaURLs(_ urls: [String], in story: StoryItem, imageCache: DiskCacheStore, prerollPlayer: Bool) async -> [String] {
        // Respecte la politique d'auto-téléchargement de l'utilisateur — miroir
        // de `ConversationMediaHandler.prefetchRecentMedia` et de
        // `BubbleCarouselView.prefetchAdjacentPages`. Sans cette garde, le
        // préchargement du tray tirait le corps MP4/audio COMPLET en cellulaire
        // alors que « Vidéo : Wi-Fi uniquement » est le réglage par défaut.
        // Le chemin de LECTURE (ouverture réelle d'une story) n'est PAS gardé :
        // une story tapée doit toujours se charger.
        let condition = NetworkConditionMonitor.shared.condition
        let prefs = MediaDownloadPreferencesStore.shared.preferences
        let allowImage = MediaDownloadPolicyEngine.shouldAutoDownload(kind: .image, condition: condition, prefs: prefs)
        let allowVideo = MediaDownloadPolicyEngine.shouldAutoDownload(kind: .video, condition: condition, prefs: prefs)
        let allowAudio = MediaDownloadPolicyEngine.shouldAutoDownload(kind: .audio, condition: condition, prefs: prefs)
        var skipped: [String] = []
        for urlString in urls {
            // Normalize through the SAME resolver the SDK reader uses
            // (`StoryReaderRepresentable` / `directURLIfAny`). Cache keys must
            // match the reader's `url.absoluteString`; a relative URL warmed
            // under its raw key would be a cache-miss + re-download at play time.
            let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
            // R7 — type effectif (déclaré corrigé par sniff d'extension) : un
            // mp4 mal classé ne doit plus atterrir dans le store `images`.
            let mediaType = StoryMediaStoreRouter.effectiveKind(
                declaredType: story.media.first(where: { $0.url == urlString })?.type,
                urlString: resolved
            )
            guard Self.shouldPrefetchStoryMedia(
                kind: mediaType, allowImage: allowImage, allowVideo: allowVideo, allowAudio: allowAudio
            ) else { skipped.append(urlString); continue }

            if mediaType == .video {
                // Peupler le store `video` (celui que le canvas relit), pas
                // `images` — sinon cache-miss + re-download au moment de jouer.
                _ = try? await CacheCoordinator.shared.video.data(for: resolved)
                if prerollPlayer, let url = MeeshyConfig.resolveMediaURL(urlString) {
                    await StoryMediaLoader.shared.preloadAndCachePlayer(url: url)
                }
            } else if mediaType == .audio {
                _ = try? await CacheCoordinator.shared.audio.data(for: resolved)
            } else {
                _ = await imageCache.image(for: resolved)
            }
        }
        return skipped
    }
}
