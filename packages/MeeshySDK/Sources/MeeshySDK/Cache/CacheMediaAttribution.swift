import Foundation

/// Domaine métier auquel une donnée en cache est rattachée.
///
/// Ce n'est PAS une propriété du cache : les stores disque sont indexés par
/// `SHA256(url)` et ne portent aucune trace du domaine. Le domaine est
/// reconstruit à la demande en parcourant les payloads GRDB (cf.
/// `CacheMediaAttribution`).
public enum CacheDomain: String, Sendable, CaseIterable, Codable {
    case posts
    case reels
    case conversations
    case stories
}

/// Nature du fichier, c'est-à-dire le store disque qui le détient.
///
/// Il n'existe volontairement PAS de cas `documents` : le SDK ne déclare que
/// quatre `DiskCacheStore` (`Images`, `Audio`, `Video`, `Thumbnails`). Un
/// document (PDF…) n'a aucun store de cache — il n'est donc ni mesurable ni
/// purgeable, et la case correspondante de l'UI est grisée plutôt que de
/// prétendre libérer un octet.
public enum CacheMediaKind: String, Sendable, CaseIterable, Codable {
    case images
    case videos
    case audio
}

/// Les URLs d'un domaine, ventilées par store.
///
/// Un `Set` : la même URL peut apparaître plusieurs fois (un post et son
/// repost, une story et sa reprise). La dédupliquer évite de compter deux fois
/// les mêmes octets dans la taille affichée.
public struct CacheMediaIndex: Sendable, Equatable {
    public private(set) var images: Set<String> = []
    public private(set) var videos: Set<String> = []
    public private(set) var audio: Set<String> = []

    public init() {}

    public var isEmpty: Bool { images.isEmpty && videos.isEmpty && audio.isEmpty }

    public func urls(for kind: CacheMediaKind) -> Set<String> {
        switch kind {
        case .images: return images
        case .videos: return videos
        case .audio: return audio
        }
    }

    /// Insère une URL en la routant vers le bon store.
    ///
    /// Le routage passe par `StoryMediaStoreRouter.effectiveKind`, déjà utilisé
    /// par le pipeline de téléchargement : l'EXTENSION prime sur le type
    /// déclaré, parce que ce dernier ment (un `.mp4` déclaré `image` est
    /// téléchargé dans le store vidéo). Attribuer sur le type déclaré ferait
    /// chercher le fichier dans un store où il n'est pas — la purge ne
    /// libérerait rien et la taille affichée serait fausse.
    ///
    /// Un `FeedMediaType.document` retombe ici sans seau correspondant et est
    /// ignoré : c'est voulu, aucun store ne le détient (cf. `CacheMediaKind`).
    mutating func insert(_ urlString: String?, declaredType: FeedMediaType?) {
        guard let urlString, !urlString.isEmpty else { return }
        switch StoryMediaStoreRouter.effectiveKind(declaredType: declaredType, urlString: urlString) {
        case .video: videos.insert(urlString)
        case .audio: audio.insert(urlString)
        case .image: images.insert(urlString)
        case .document: break
        }
    }

    /// Insertion forcée dans le seau images, pour les URLs dont on SAIT
    /// qu'elles désignent une image sans pouvoir s'appuyer sur une extension
    /// (vignettes et avatars servis par un CDN signé, souvent sans extension
    /// exploitable).
    mutating func insertImage(_ urlString: String?) {
        guard let urlString, !urlString.isEmpty else { return }
        images.insert(urlString)
    }

    mutating func insertAudio(_ urlString: String?) {
        guard let urlString, !urlString.isEmpty else { return }
        audio.insert(urlString)
    }

    mutating func formUnion(_ other: CacheMediaIndex) {
        images.formUnion(other.images)
        videos.formUnion(other.videos)
        audio.formUnion(other.audio)
    }
}

/// Reconstruit, depuis les payloads en cache, la carte « URL → domaine ».
///
/// C'est le cœur de la purge sélective. L'alternative — étiqueter chaque
/// fichier au moment de l'écriture — aurait exigé de faire remonter un domaine
/// à travers la trentaine de points d'écriture du cache disque ET à travers les
/// téléchargements implicites de `DiskCacheStore.data(for:)`, qui n'ont aucun
/// contexte métier. Toute lacune y serait devenue un fichier « sans domaine »
/// silencieusement impurgeable.
///
/// La dérivation à la lecture n'a qu'une limite, mais elle est réelle et
/// assumée : un fichier dont l'entité porteuse a quitté le cache GRDB (TTL
/// dépassé, éviction) n'est plus attribuable à personne. Ces fichiers sont
/// comptés à part (« non attribués ») et non silencieusement oubliés.
public enum CacheMediaAttribution {

    /// Ventile les posts du store `feed` entre publications et réels.
    ///
    /// Les deux cohabitent dans le même store GRDB et se distinguent
    /// uniquement par `FeedPost.type` (`"REEL"`, casse indifférente) — c'est
    /// la règle qu'appliquent `FeedPost.isReel` et tout le rendu.
    public static func index(feedPosts: [FeedPost]) -> [CacheDomain: CacheMediaIndex] {
        var result: [CacheDomain: CacheMediaIndex] = [.posts: CacheMediaIndex(), .reels: CacheMediaIndex()]
        for post in feedPosts {
            let domain: CacheDomain = post.isReel ? .reels : .posts
            var index = result[domain] ?? CacheMediaIndex()
            collect(media: post.media, into: &index)
            index.insertAudio(post.audioUrl)
            if let effects = post.storyEffects { collect(effects: effects, into: &index) }
            // Le repost embarque ses propres médias : sans eux, purger le
            // domaine laisserait sur disque le contenu republié.
            if let repost = post.repost {
                collect(media: repost.media, into: &index)
                index.insertAudio(repost.audioUrl)
                if let effects = repost.storyEffects { collect(effects: effects, into: &index) }
            }
            for comment in post.comments {
                collect(media: comment.media, into: &index)
            }
            result[domain] = index
        }
        return result
    }

    public static func index(storyGroups: [StoryGroup]) -> CacheMediaIndex {
        var index = CacheMediaIndex()
        for group in storyGroups {
            index.insertImage(group.avatarURL)
            for story in group.stories {
                collect(media: story.media, into: &index)
                index.insertAudio(story.audioUrl)
                index.insertAudio(story.backgroundAudio?.fileUrl)
                if let effects = story.storyEffects { collect(effects: effects, into: &index) }
            }
        }
        return index
    }

    public static func index(messages: [MeeshyMessage]) -> CacheMediaIndex {
        var index = CacheMediaIndex()
        for message in messages {
            for attachment in message.attachments {
                index.insert(attachment.fileUrl, declaredType: declaredType(for: attachment))
                index.insertImage(attachment.thumbnailUrl)
                for variant in attachment.imageVariants ?? [] {
                    index.insertImage(variant.url)
                }
                for translation in (attachment.audioTranslations ?? [:]).values {
                    index.insertAudio(translation.url)
                }
            }
        }
        return index
    }

    // MARK: - Collecte

    private static func collect(media: [FeedMedia], into index: inout CacheMediaIndex) {
        for item in media {
            index.insert(item.url, declaredType: item.type)
            index.insertImage(item.thumbnailUrl)
            for translated in item.translatedAudios {
                index.insertAudio(translated.url)
            }
        }
    }

    /// Le canvas d'une story porte ses propres médias, indépendants de
    /// `StoryItem.media` : un fond vidéo ou une piste audio posée sur la scène
    /// n'existe QUE là. Les oublier laisserait sur disque les fichiers les plus
    /// lourds d'une story (une story vidéo pèse jusqu'à ~275 Mo).
    private static func collect(effects: StoryEffects, into index: inout CacheMediaIndex) {
        for object in effects.mediaObjects ?? [] {
            index.insert(object.mediaURL, declaredType: object.mediaType.lowercased() == "video" ? .video : .image)
        }
        for player in effects.audioPlayerObjects ?? [] {
            index.insertAudio(player.mediaURL)
        }
    }

    /// `MeeshyMessageAttachment.type` est dérivé du `mimeType`. On le traduit
    /// en `FeedMediaType` pour réutiliser le même routeur que le feed — et
    /// pour que l'extension puisse, là aussi, corriger un mimeType erroné.
    private static func declaredType(for attachment: MeeshyMessageAttachment) -> FeedMediaType? {
        switch attachment.type {
        case .image: return .image
        case .video: return .video
        case .audio: return .audio
        case .file: return .document
        case .location: return nil
        }
    }
}
