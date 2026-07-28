import Foundation

// MARK: - Réconciliation locale des stories mortes
//
// Le cache du tray (TTL 24 h) survit délibérément à la fenêtre de visibilité
// d'une story (21 h) : on évite ainsi de re-télécharger avatars et métadonnées
// à chaque démarrage à froid. La contrepartie, c'est que le cache continue de
// porter des stories que le serveur ne renverra plus — expirées, ou supprimées
// par leur auteur.
//
// L'expiry était jusqu'ici traitée par MASQUAGE (le tray filtre les groupes
// entièrement expirés) et par SAUT (le lecteur skippe les slides mortes), donc
// sans jamais rien effacer. Et les suppressions n'étaient réconciliées que par
// l'event socket `story:deleted`, qui ne couvre pas l'app fermée ou hors-ligne
// (aucun replay). Une story disparue restait donc dans le cache local —
// illisible ET indéboulonnable — jusqu'à l'expiration du cache ou un
// pull-to-refresh.
//
// Ces deux fonctions pures sont le geste manquant : elles disent ce qui doit
// sortir du local. Elles vivent dans le SDK (règle de modèle, pas
// d'orchestration UX) pour que toutes les surfaces — tray, lecteur, « Mes
// stories » — appliquent la MÊME définition de « morte ».

public extension Array where Element == StoryGroup {

    /// Le tray débarrassé de ses stories mortes, ordre préservé.
    ///
    /// Une story est morte quand :
    /// - son id figure dans `deletedIds` — suppression explicite, valable pour
    ///   tout le monde, auteur compris (c'est une volonté, pas un délai) ;
    /// - ou qu'elle est expirée ET n'appartient pas à `currentUserId` :
    ///   l'auteur garde l'accès à ses propres stories expirées pour y lire
    ///   réactions et commentaires (spec 2026-06-23).
    ///
    /// Un groupe vidé de toutes ses stories sort du tray — y compris s'il
    /// arrivait déjà vide : une bulle sans contenu ne s'ouvre pas, la garder ne
    /// fait que maintenir un fantôme en vie.
    ///
    /// `now: nil` n'évalue PAS l'expiry : seul `deletedIds` compte. C'est le
    /// mode des retraits ciblés (event socket `story:deleted`, suppression par
    /// l'utilisateur) — un event qui annonce UNE disparition ne doit pas
    /// déclencher un balayage de tout le tray.
    func purgingDeadStories(currentUserId: String?,
                            deletedIds: Set<String> = [],
                            now: Date? = Date()) -> [StoryGroup] {
        compactMap { group in
            let survivors = group.stories.filter {
                !isDeadStory($0, inGroup: group.id, currentUserId: currentUserId,
                             deletedIds: deletedIds, now: now)
            }
            return survivors.isEmpty ? nil : group.with(stories: survivors)
        }
    }

    /// Les ids que `purgingDeadStories` retirerait, dans l'ordre du tray.
    ///
    /// Nécessaire parce que purger le modèle ne suffit pas à libérer le local :
    /// les médias d'une story vue sont ÉPINGLÉS sur disque jusqu'à son expiry
    /// (relecture hors-ligne). Sans cette liste, l'appelant n'a plus de quoi
    /// retrouver les médias à dépingler une fois les stories disparues du tray.
    func deadStoryIds(currentUserId: String?,
                      deletedIds: Set<String> = [],
                      now: Date? = Date()) -> [String] {
        flatMap { group in
            group.stories
                .filter {
                    isDeadStory($0, inGroup: group.id, currentUserId: currentUserId,
                                deletedIds: deletedIds, now: now)
                }
                .map(\.id)
        }
    }
}

/// Prédicat unique — la boucle de purge et l'inventaire des ids retirés ne
/// peuvent pas diverger (même patron que `StoryPlaybackSkipResolver.isUnplayable`).
private func isDeadStory(_ story: StoryItem,
                         inGroup groupId: String,
                         currentUserId: String?,
                         deletedIds: Set<String>,
                         now: Date?) -> Bool {
    if deletedIds.contains(story.id) { return true }
    // Retrait ciblé : l'expiry n'entre pas en jeu.
    guard let now else { return false }
    // Mes propres stories expirées restent — c'est là que leur auteur vient
    // lire les réactions et les commentaires qu'elles ont récoltés.
    guard groupId != currentUserId else { return false }
    return story.isExpired(at: now)
}
