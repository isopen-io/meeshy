import Foundation

// `StoryItem` et sa construction depuis le fil (`toStoryGroups`) vivent ici,
// sortis de `StoryModels.swift` (hors budget) avant d'y ajouter la carte des
// liens suivis (#9075).

// MARK: - Story Item
public struct StoryItem: Identifiable, Codable, Sendable {
    public let id: String
    public let content: String?
    public let media: [FeedMedia]
    public let storyEffects: StoryEffects?
    public let createdAt: Date
    public let expiresAt: Date?
    public let repostOfId: String?
    public let originalRepostOfId: String?
    public let repostAuthorName: String?
    /// @handle de l'auteur original d'une republication — affiché à la suite
    /// du nom de l'auteur (icône repost + "@handle", sans « via »). Optionnel :
    /// les payloads/rows antérieurs décodent en nil et l'UI retombe sur
    /// `repostAuthorName`.
    public let repostAuthorUsername: String?
    /// `var` (et non `let`) pour la mise à jour optimiste du menu « Modifier
    /// la visibilité » : muter en place, comme `isViewed`, plutôt que
    /// reconstruire via une init partielle qui droppait ~13 champs.
    public var visibility: String?
    /// Ids ciblés (`ONLY`) ou exclus (`EXCEPT`). Optionnel → les rows GRDB et
    /// payloads antérieurs décodent en `nil` sans migration.
    public var visibilityUserIds: [String]?
    public let audioUrl: String?
    public var isViewed: Bool
    /// R11 — horodatage du « vu » local (règle CLAUDE.md : DateTime nullable
    /// plutôt que boolean seul). Migration DOUCE : `isViewed` reste décodé du
    /// serveur (qui n'envoie qu'un Bool) ; `viewedAt` est posé côté client au
    /// markViewed et survit au cache GRDB (optionnel → rétro-compatible avec
    /// les rows persistés avant ce champ). Consommateurs futurs : tri des
    /// groupes vus, TTL du pin R5 par date de vue.
    public var viewedAt: Date?
    /// R8 — horodatage serveur de la dernière modification (compteurs,
    /// traductions). Alimente le curseur delta-sync `?updatedSince` : le
    /// « since » du refetch silencieux = max(updatedAt) du cache — état
    /// DÉRIVÉ, aucune source de vérité supplémentaire. Optionnel → migration
    /// douce (rows GRDB et payloads antérieurs à ce champ décodent en nil,
    /// qui désactive simplement le delta au profit du full historique).
    public var updatedAt: Date?
    /// Horodatage serveur de la dernière édition de CONTENU (texte /
    /// storyEffects / médias) — distinct d'`updatedAt`, qui bouge sur CHAQUE
    /// écriture (compteurs de vues inclus). C'est le SEUL horodatage fiable
    /// pour faire céder la garde « viewed monotone » : une story éditée
    /// APRÈS ma vue locale redevient non-vue (reset d'engagement,
    /// directive 2026-07-29). Optionnel → rétro-compatible cache/payloads.
    public var contentEditedAt: Date?
    public let translations: [StoryTranslation]?
    public let backgroundAudio: StoryBackgroundAudioEntry?
    public var reactionCount: Int
    public var commentCount: Int

    /// Count of forwards / external shares (Envoyer button label).
    /// `nil` when the gateway payload pre-dates the enrichment.
    public var shareCount: Int?

    /// Count of viewers who opened this story (author-only "Vues" label).
    /// `nil` for anonymous reads or legacy payloads.
    public var viewCount: Int?

    /// Count of impressions — one per slide display, NOT deduped (mirrors
    /// `Post.impressionCount`). Author-only, paired with `viewCount` so the story
    /// viewer reports the SAME 2 metrics as Detail/Reel (unified 2026-07-14).
    /// `nil` for anonymous reads or legacy payloads/caches.
    public var impressionCount: Int?

    /// Count of reposts that pointed back to this story (Partager label).
    /// `nil` when not yet enriched.
    public var repostCount: Int?

    /// Emojis the *current viewer* (logged-in user) has applied to this story.
    /// `nil` for anonymous reads or for legacy payloads / caches that predate
    /// the enrichment. Source of truth: gateway `PostFeedService.getStories`
    /// — see `packages/shared/types/post.ts` `currentUserReactions`.
    public var currentUserReactions: [String]?

    /// The viewer's right to open THIS story past its `expiresAt` because
    /// they are personally referenced in it — DECLARED by the server
    /// (`APIPost.referenceAccess`), never recomputed from `expiresAt` here.
    /// `nil` mirrors `ReferenceAccess.none`: no reference for this viewer,
    /// `isExpired()` applies normally. Propagated by `toStoryGroups` and
    /// consumed by `StoryViewModel`'s tray filters and
    /// `StoryNotificationTargetViewModel`'s open decision.
    public var referenceAccess: ReferenceAccess?

    /// Les personnes que cette story NOMME, telles que le serveur les sert,
    /// avec leur mode. `nil` = la charge utile ne les portait pas — ce qui
    /// n'est PAS un ensemble vide : le composer d'édition s'y fie pour savoir
    /// s'il a le droit de REMPLACER l'ensemble déclaré ou s'il doit se taire.
    public var mentions: [PostReference]?

    /// La carte `{ url → token }` des adresses du contenu, servie par la
    /// passerelle (`metadata.trackingLinks` REST, `trackingLinks` hissé socket —
    /// décodée par `APIPost`). La légende rend chaque adresse mappée par son
    /// lien suivi `/l/<token>` (#9075). `nil` sur les charges et caches
    /// antérieurs : l'adresse reste brute.
    public var trackingLinks: [TrackedLink]?

    /// `[rawURL: token]`, la forme que lit `MessageTextRenderer`.
    public var trackedLinkMap: [String: String] { (trackingLinks ?? []).trackedLinkMap }

    /// `validUsernames` prêt pour `MessageTextRenderer` — même règle que
    /// `FeedPost.validMentionUsernames` : `nil` quand `mentions` est `nil`.
    public var validMentionUsernames: Set<String>? {
        mentions.map { Set($0.map { $0.username.lowercased() }) }
    }

    /// True when the *current viewer* has personally reacted to this story.
    /// Drives "is my heart active" UI affordances (sidebar, mini-status).
    /// Distinct from `reactionCount > 0`, which counts ANY reaction by anyone.
    public var currentUserHasReacted: Bool { !(currentUserReactions ?? []).isEmpty }

    public var timeAgo: String {
        RelativeTimeFormatter.shortString(for: createdAt)
    }

    /// Computed convenience used by C.1 / C.2 to gate the Partager button and kebab items.
    /// Defaults to **false** when visibility is nil (unknown) so we don't accidentally expose
    /// non-public content for repost.
    public var isPublic: Bool {
        (visibility ?? "").uppercased() == "PUBLIC"
    }

    /// Résout le contenu dans la langue préférée via le Prisme Linguistique.
    /// Retourne la traduction si disponible, sinon le contenu original.
    /// Pas de fallback implicite vers l'anglais — l'absence de traduction signifie
    /// que le contenu est deja dans la langue de l'utilisateur OU qu'aucune
    /// traduction n'a ete generee. Voir CLAUDE.md "Prisme Linguistique".
    /// Commodité à UNE langue — PROJECTION de la chaîne, jamais une seconde
    /// règle. Elle portait sa propre descente : une comparaison `==` BRUTE, ni
    /// normalisée ni rang-consciente, qui ratait `"FR"` contre `"fr"` et
    /// `"en"` contre `"en-US"` et servait alors l'original en le faisant passer
    /// pour un « pas de traduction ».
    public func resolvedContent(preferredLanguage: String?) -> String? {
        resolvedContent(preferredLanguages: [preferredLanguage].compactMap { $0 })
    }

    /// R10 — le `content` legacy d'une story, résolu par
    /// `PrismTranslationResolver` sur la chaîne COMPLÈTE. `nil` du résolveur ⇒
    /// `content`, l'original (règle #1 : jamais `translations.first`).
    ///
    /// `originalLanguage: nil` n'est pas un oubli : `StoryItem` ne porte AUCUN
    /// champ disant dans quelle langue le `content` est écrit — le fil ne le
    /// sert pas. La langue d'origine ne peut donc pas concourir à son rang ici,
    /// et une story déjà écrite dans la langue du lecteur peut encore lui être
    /// servie traduite si une traduction d'un rang inférieur existe. C'est une
    /// lacune de la CHARGE, pas de la descente : elle se solde en servant la
    /// langue d'origine de la story, hors de ce dépôt-ci.
    public func resolvedContent(preferredLanguages: [String]) -> String? {
        guard let translations, !translations.isEmpty else { return content }
        return PrismTranslationResolver.resolve(
            originalLanguage: nil,
            candidates: translations.map { PrismCandidate(language: $0.language, value: $0.content) },
            preferredLanguages: preferredLanguages
        )?.text ?? content
    }

    public init(id: String, content: String? = nil, media: [FeedMedia] = [], storyEffects: StoryEffects? = nil,
                createdAt: Date = Date(), expiresAt: Date? = nil, repostOfId: String? = nil,
                originalRepostOfId: String? = nil, repostAuthorName: String? = nil,
                repostAuthorUsername: String? = nil,
                visibility: String? = nil, visibilityUserIds: [String]? = nil, audioUrl: String? = nil,
                isViewed: Bool = false, viewedAt: Date? = nil, updatedAt: Date? = nil, contentEditedAt: Date? = nil, translations: [StoryTranslation]? = nil, backgroundAudio: StoryBackgroundAudioEntry? = nil,
                reactionCount: Int = 0, commentCount: Int = 0,
                shareCount: Int? = nil, viewCount: Int? = nil, impressionCount: Int? = nil, repostCount: Int? = nil,
                currentUserReactions: [String]? = nil, referenceAccess: ReferenceAccess? = nil,
                mentions: [PostReference]? = nil, trackingLinks: [TrackedLink]? = nil) {
        self.id = id; self.content = content; self.media = media; self.storyEffects = storyEffects
        self.createdAt = createdAt; self.expiresAt = expiresAt; self.repostOfId = repostOfId
        self.originalRepostOfId = originalRepostOfId
        self.repostAuthorName = repostAuthorName
        self.repostAuthorUsername = repostAuthorUsername
        self.visibility = visibility; self.visibilityUserIds = visibilityUserIds; self.audioUrl = audioUrl
        self.isViewed = isViewed; self.viewedAt = viewedAt; self.updatedAt = updatedAt
        self.contentEditedAt = contentEditedAt
        self.translations = translations; self.backgroundAudio = backgroundAudio
        self.reactionCount = reactionCount; self.commentCount = commentCount
        self.shareCount = shareCount; self.viewCount = viewCount; self.impressionCount = impressionCount; self.repostCount = repostCount
        self.currentUserReactions = currentUserReactions; self.referenceAccess = referenceAccess
        self.mentions = mentions
        self.trackingLinks = trackingLinks
    }

    /// A5 — returns `true` when the story has aged past its visibility window.
    ///
    /// Resolution order:
    /// 1. If `expiresAt` is set and is `<= now`, the story is expired.
    /// 2. Otherwise, fall back to the product rule of "stories live 24h" and
    ///    consider the story expired when `createdAt + 24h <= now`.
    ///
    /// Used by the viewer to skip past stale stories the cache may have
    /// surfaced (cache TTL > 24h is intentional so we don't redownload
    /// avatars/text on every cold start, but the *content* must not be
    /// rendered).
    /// G6 — durée de vie d'une story SANS `expiresAt` explicite : alignée sur
    /// la constante serveur `EPHEMERAL_POST_TTL_HOURS.STORY` (ephemeralPosts.ts)
    /// et consommée par les fallbacks client `toStoryGroups`/`pinDeadline`.
    /// L'ancien défaut interne de 24 h était un piège dormant : sans effet
    /// tant que le serveur pose toujours `expiresAt`, mais une story au
    /// fallback aurait survécu plus longtemps que sa vie serveur.
    /// 20 h depuis 2026-08-12 (était 21 h) — SSOT serveur :
    /// `services/gateway/src/services/posts/ephemeralPosts.ts`.
    public static let defaultExpiryInterval: TimeInterval = 20 * 60 * 60

    public func isExpired(at now: Date = Date()) -> Bool {
        if let explicit = expiresAt {
            return explicit <= now
        }
        return createdAt.addingTimeInterval(Self.defaultExpiryInterval) <= now
    }

    /// Prisme realtime : traduction du CONTENU de la story (sa légende), que le
    /// gateway diffuse via `post:translation-updated`.
    ///
    /// Distinct de `mergingTextObjectTranslations`, qui ne touche QUE les textes
    /// posés sur le canvas. Sans ce chemin, une traduction demandée depuis la
    /// feuille « Langues » arrivait bien en base mais n'atteignait jamais la
    /// story du lecteur : l'anneau de chargement tournait sans fin sur une
    /// langue pourtant traduite (constaté au simulateur le 2026-07-27).
    ///
    /// La langue est normalisée en minuscules — la feuille compare sur cette
    /// forme. Une langue déjà présente est remplacée, sinon ajoutée.
    public func mergingContentTranslation(language: String, content: String) -> StoryItem {
        let code = language.lowercased()
        guard !code.isEmpty, !content.isEmpty else { return self }
        var merged = (translations ?? []).filter { $0.language.lowercased() != code }
        merged.append(StoryTranslation(language: code, content: content))
        return StoryItem(
            id: id, content: self.content, media: media, storyEffects: storyEffects,
            createdAt: createdAt, expiresAt: expiresAt, repostOfId: repostOfId,
            originalRepostOfId: originalRepostOfId, repostAuthorName: repostAuthorName,
            repostAuthorUsername: repostAuthorUsername,
            visibility: visibility, visibilityUserIds: visibilityUserIds, audioUrl: audioUrl, isViewed: isViewed,
            viewedAt: viewedAt, updatedAt: updatedAt,
            translations: merged,
            backgroundAudio: backgroundAudio,
            reactionCount: reactionCount, commentCount: commentCount,
            shareCount: shareCount, viewCount: viewCount, impressionCount: impressionCount, repostCount: repostCount,
            currentUserReactions: currentUserReactions, referenceAccess: referenceAccess,
            mentions: mentions, trackingLinks: trackingLinks
        )
    }

    /// Prisme realtime : le gateway diffuse les traductions PAR text-object via
    /// `story:translation-updated` (payload `{ postId, textObjectIndex, translations }`).
    /// Retourne une copie de la story avec ces traductions fusionnées dans le
    /// text-object à `index` (les langues existantes sont écrasées, les nouvelles
    /// ajoutées). Index hors borne / pas d'effects / dict vide → `self` inchangé.
    /// `storyEffects` étant immuable (`let`), on reconstruit la `StoryItem` via son
    /// init mémberwise — aucune mutation en place.
    public func mergingTextObjectTranslations(at index: Int, translations: [String: String]) -> StoryItem {
        guard !translations.isEmpty, var effects = storyEffects,
              index >= 0, index < effects.textObjects.count else { return self }
        var object = effects.textObjects[index]
        var merged = object.translations ?? [:]
        for (language, text) in translations { merged[language] = text }
        object.translations = merged
        effects.textObjects[index] = object
        return StoryItem(
            id: id, content: content, media: media, storyEffects: effects,
            createdAt: createdAt, expiresAt: expiresAt, repostOfId: repostOfId,
            originalRepostOfId: originalRepostOfId, repostAuthorName: repostAuthorName,
            repostAuthorUsername: repostAuthorUsername,
            visibility: visibility, visibilityUserIds: visibilityUserIds, audioUrl: audioUrl, isViewed: isViewed,
            viewedAt: viewedAt, updatedAt: updatedAt,
            translations: self.translations,
            backgroundAudio: backgroundAudio,
            reactionCount: reactionCount, commentCount: commentCount,
            shareCount: shareCount, viewCount: viewCount, impressionCount: impressionCount, repostCount: repostCount,
            currentUserReactions: currentUserReactions, referenceAccess: referenceAccess,
            mentions: mentions, trackingLinks: trackingLinks
        )
    }
}

// MARK: - API -> Story Group Conversion
extension Array where Element == APIPost {
    public func toStoryGroups(currentUserId: String? = nil) -> [StoryGroup] {
        let storyPosts = self.filter { ($0.type ?? "").uppercased() == "STORY" }
        var grouped: [String: (author: APIAuthor, stories: [StoryItem])] = [:]

        for post in storyPosts {
            let authorId = post.author.id
            // A reposted story carries its media / effects / audio on the original
            // (`repostOf`), not on the repost shell — the shell's own `media` is
            // empty. Mirror `StoryReaderRepresentable.init(repost:)` so the
            // full-screen viewer (which renders from `StoryItem.media` /
            // `storyEffects`) plays the original instead of a blank spinner. The
            // feed embed already resolves this via `RepostContent`; this aligns the
            // tray/viewer path. Reported 2026-06-26 « la republication ne joue pas
            // la story comme si c'était la mienne ».
            //
            // `media` et `storyEffects` sont couplés en une seule décision
            // (`hasOwnContent`) — jamais résolus indépendamment. Les
            // `mediaObjects`/`audioPlayerObjects` des effects référencent
            // leurs médias par `postMediaId` ; mélanger des effects de la
            // SOURCE avec des médias PROPRES casserait silencieusement toute
            // résolution audio/vidéo (même durcissement que `StoryItem
            // (feedPost:)` dans FeedModels.swift — single source de la
            // politique de fallback, post-revue 2026-07-13).
            let repostSource = post.repostOf
            let ownMedia = post.media ?? []
            let hasOwnContent = !ownMedia.isEmpty || post.storyEffects != nil
            // Un repost peut avoir son propre snapshot `media` (nouveaux ids,
            // parfois des URLs relatives cassées) alors que son `storyEffects`
            // OWN référence encore les `postMediaId` ORIGINAUX de `repostOf.media`
            // (le repost copie les effects tels quels sans réécrire les
            // références). Le resolver `media.first(where: { $0.id == postMediaId })`
            // (`toRenderableSlide`, canvas playback) ne trouvait donc jamais
            // l'audio/vidéo de fond référencé → lecture bloquée indéfiniment sur
            // le spinner de stall. Fusionner les deux pools (own d'abord, repostOf
            // en complément dédupliqué par id) garantit que le lookup trouve
            // toujours sa cible, quel que soit le set que les effects référencent
            // — sans changer `hasOwnContent`, qui reste la SEULE décision pour
            // choisir quel `storyEffects` afficher (own vs repostOf, cf. commentaire
            // ci-dessus). Bug user-reporté 2026-07-14 « la story repostée ne se lit pas ».
            let ownMediaIds = Set(ownMedia.map(\.id))
            let repostMedia = (repostSource?.media ?? []).filter { !ownMediaIds.contains($0.id) }
            let mediaSource: [APIPostMedia] = hasOwnContent ? ownMedia + repostMedia : (repostSource?.media ?? [])
            let media: [FeedMedia] = mediaSource.map { m in
                // Propage `thumbnailUrl` + `thumbHash` du gateway — sinon le
                // tray (`StoryTrayView.latestStoryThumbnailURL`) tombe sur
                // `url` (souvent une vidéo) ou sur l'avatar du profil.
                // Bug user-reporté 2026-05-27 « la tray doit montrer la
                // miniature de la dernière story du groupe ».
                FeedMedia(id: m.id, type: m.mediaType, url: m.fileUrl,
                          thumbnailUrl: m.thumbnailUrl, thumbHash: m.thumbHash,
                          thumbnailColor: "4ECDC4",
                          width: m.width, height: m.height, duration: m.duration.map { $0 / 1000 })
            }
            let storyTranslations: [StoryTranslation]? = post.translations.map { dict in
                dict.map { lang, entry in StoryTranslation(language: lang, content: entry.text) }
            }
            // Fallback aligné sur la SSOT serveur (EPHEMERAL_POST_TTL_HOURS.STORY,
            // 20 h depuis 2026-08-12) via l'unique constante iOS — le `Calendar`
            // à 21 h d'avant divergeait ET dépendait du fuseau du process.
            let effectiveExpiresAt = post.expiresAt
                ?? post.createdAt.addingTimeInterval(StoryItem.defaultExpiryInterval)
            let totalReactions = post.reactionSummary?.values.reduce(0, +) ?? 0
            let item = StoryItem(id: post.id, content: post.content, media: media,
                                 storyEffects: hasOwnContent ? post.storyEffects : repostSource?.storyEffects,
                                 createdAt: post.createdAt, expiresAt: effectiveExpiresAt,
                                 repostOfId: post.repostOf?.id,
                                 originalRepostOfId: post.originalRepostOfId,
                                 repostAuthorName: post.repostOf?.author.name,
                                 repostAuthorUsername: post.repostOf?.author.username,
                                 visibility: post.visibility,
                                 visibilityUserIds: post.visibilityUserIds,
                                 audioUrl: post.audioUrl ?? repostSource?.audioUrl,
                                 isViewed: post.isViewedByMe ?? false,
                                 updatedAt: post.updatedAt,
                                 contentEditedAt: post.contentEditedAt,
                                 translations: storyTranslations,
                                 reactionCount: totalReactions, commentCount: post.commentCount ?? 0,
                                 shareCount: post.shareCount,
                                 viewCount: post.viewCount,
                                 impressionCount: post.impressionCount,
                                 repostCount: post.repostCount,
                                 currentUserReactions: post.currentUserReactions,
                                 referenceAccess: post.referenceAccess,
                                 mentions: post.mentions,
                                 trackingLinks: post.trackingLinks)
            if var existing = grouped[authorId] {
                existing.stories.append(item); grouped[authorId] = existing
            } else {
                grouped[authorId] = (author: post.author, stories: [item])
            }
        }

        var groups = grouped.map { (authorId, data) in
            StoryGroup(id: authorId, username: data.author.name,
                       avatarColor: DynamicColorGenerator.colorForName(data.author.name),
                       avatarURL: data.author.avatar,
                       stories: data.stories.sorted { $0.createdAt < $1.createdAt },
                       // Présence embarquée par le payload stories (nil sur les
                       // payloads/caches antérieurs à l'enrichissement gateway).
                       authorPresence: data.author.isOnline.map {
                           UserPresence(isOnline: $0, lastActiveAt: data.author.lastActiveAt)
                       })
        }
        groups.sort { a, b in
            if let uid = currentUserId {
                if a.id == uid { return true }; if b.id == uid { return false }
            }
            if a.hasUnviewed != b.hasUnviewed { return a.hasUnviewed }
            return (a.latestStory?.createdAt ?? .distantPast) > (b.latestStory?.createdAt ?? .distantPast)
        }
        return groups
    }
}
