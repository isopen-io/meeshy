import Foundation
import MeeshySDK

/// **Le rail de stories ne lit plus le disque pendant son `body` (#4002).**
///
/// `latestStoryThumbnailURL` appelait `CacheCoordinator.thumbnailLocalFileURL`
/// — une résolution de fichier sur DISQUE — depuis le `body` d'une cellule
/// répétée par anneau. Mesuré au Time Profiler sur appareil physique, liste de
/// conversations affichée et écran INACTIF : 451 ms sur une fenêtre de 100 s,
/// dont 356 ms dans `DiskCacheStore.cachedFileURL`. L'effet est ÉPISODIQUE,
/// mais quand il tombe il porte le CPU de l'app de ~4,5 % à **34,5 %**,
/// personne ne touchant l'écran.
///
/// **La décision qu'il remplace était documentée, et c'est ce qui la rend
/// intéressante.** Le commentaire d'origine disait : « Synchronous existence
/// check — no actor hop, safe in the View body. Pas de memo : la purge de
/// logout peut détruire le fichier, et servir une URL morte au relogin
/// coûterait plus cher qu'un `stat()` par render événementiel. » Le
/// raisonnement est juste ; sa PRÉMISSE ne l'est pas. « Un `stat()` par render
/// événementiel » suppose des rendus rares — la mesure montre qu'un rail se
/// réévalue à chaque arrivée de story, expiration, changement de présence et
/// rafraîchissement de liste, y compris pendant qu'une conversation est
/// ouverte par-dessus. Ce n'est pas la décision qui était fausse, c'est le
/// nombre d'appels qu'elle supposait.
///
/// Les deux craintes qu'elle nommait sont donc traitées EXPLICITEMENT, plutôt
/// qu'évitées en ne mémoïsant pas :
///
/// - **la cover écrite APRÈS coup** (une story reçue dont la couverture
///   composite est rendue plus tard) : `bumpGeneration()` vide la mémoire, et
///   c'est le site qui incrémente déjà `receiverCoverRenderTick` qui l'appelle
///   — le même signal, au même endroit ;
/// - **la purge de logout** : la mémoire porte l'identité du compte pour
///   lequel elle a été remplie. Un changement de compte la vide de lui-même,
///   sans qu'aucun site de déconnexion ait à le savoir. C'est ce qui la rend
///   sûre : il y a trois appels à `logout()` dans l'app, et un quatrième
///   apparaîtrait sans que personne ne pense à cette mémoire.
///
/// La cascade elle-même n'est PAS réécrite : elle reste dans
/// `StoryCoverThumbnail.preferredCoverURLString`, site unique partagé avec le
/// rail Lentille. Cette mémoire ne fait qu'éviter d'aller REDEMANDER au disque
/// une réponse qu'elle a déjà.
@MainActor
enum StoryCoverURLMemo {

    private static var filledFor: String?
    private static var resolved: [String: String?] = [:]

    /// Une couverture vient d'être écrite sur le disque : ce que la mémoire
    /// tient est peut-être un `nil` désormais faux.
    static func bumpGeneration() {
        resolved.removeAll()
    }

    /// Point d'accès de test — `internal`, lu par `@testable import Meeshy`.
    static var memoizedCountForTesting: Int { resolved.count }

    static func reset() {
        resolved.removeAll()
        filledFor = nil
    }

    /// La forme TESTABLE : l'identité et la sonde disque sont injectées.
    ///
    /// `probe` reçoit la clé de cache et rend l'URL locale, ou `nil`. C'est le
    /// SEUL accès disque de la cascade — tout le reste est du calcul pur sur
    /// des champs déjà en mémoire.
    static func coverURL(
        for group: StoryGroup,
        accountId: String?,
        probe: (String) -> URL?
    ) -> String? {
        if filledFor != accountId {
            resolved.removeAll()
            filledFor = accountId
        }
        guard let lastStory = group.stories.last else { return group.avatarURL }

        let localCover: URL?
        if let memoized = resolved[lastStory.id] {
            localCover = memoized.map(URL.init(fileURLWithPath:))
        } else {
            let probed = probe(StoryCoverThumbnail.cacheKey(storyId: lastStory.id))
            // `resolved[key] = nil` SUPPRIME l'entrée au lieu de mémoriser
            // l'absence — donc la story sans couverture, qui est le cas le plus
            // FRÉQUENT, aurait continué de sonder le disque à chaque rendu et
            // le correctif n'aurait servi que la minorité. `updateValue` insère
            // bien la valeur optionnelle. Attrapé par le témoin, pas par la
            // relecture : les deux formes se lisent pareil.
            resolved.updateValue(probed?.path, forKey: lastStory.id)
            localCover = probed
        }

        return StoryCoverThumbnail.preferredCoverURLString(
            localCover: localCover,
            serverThumbnailUrl: lastStory.media.first?.thumbnailUrl,
            mediaUrl: lastStory.media.first?.url,
            mediaIsImage: lastStory.media.first?.type == .image,
            avatarURL: group.avatarURL
        )
    }

    /// La forme de PRODUCTION : identité et sonde résolues depuis les
    /// singletons.
    static func coverURL(for group: StoryGroup) -> String? {
        coverURL(
            for: group,
            accountId: AuthManager.shared.currentUser?.id,
            probe: { CacheCoordinator.thumbnailLocalFileURL(for: $0) }
        )
    }
}
