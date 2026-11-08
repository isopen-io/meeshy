import MeeshySDK

/// **Ce qui arrive en tête du fil n'écrase pas la lecture** (#16676).
///
/// Un `post:created`, un `post:reposted` ou une relecture silencieuse de la
/// tête (reconnexion, retour d'un plein écran) INSÉRAIT en index 0. Rien
/// n'ancrant le défilement, la carte en lecture descendait d'une hauteur de
/// carte à chaque arrivée — et pendant que le fil était caché, le lecteur
/// revenait sur un autre post que le sien.
///
/// Tant que le lecteur lit plus bas que la tête, ou que le fil est caché, ce
/// qui ARRIVE en tête attend ici ; il entre dès que le lecteur remonte en haut.
/// Un fil vide ne tient jamais rien : le premier chargement se montre.
struct FeedHeadHold {
    private(set) var isHolding = false
    private(set) var held: [FeedPost] = []

    /// Une arrivée en tête. Rend la liste à montrer, ou `nil` quand l'écran ne
    /// change pas — post déjà connu, ou tenu.
    mutating func admitting(_ post: FeedPost, over shown: [FeedPost]) -> [FeedPost]? {
        guard !Self.contains(post.id, in: shown), !Self.contains(post.id, in: held) else { return nil }
        guard isHolding, !shown.isEmpty else { return [post] + shown }
        held.insert(post, at: 0)
        return nil
    }

    /// La tête relue en silence : ce qu'elle apporte AVANT le premier post
    /// déjà montré attend si le fil tient sa tête ; le reste se montre.
    mutating func admitting(head merged: [FeedPost], over shown: [FeedPost]) -> [FeedPost] {
        guard isHolding, !shown.isEmpty else { return merged }
        let known = Set(shown.map(\.id))
        let arriving = Array(merged.prefix { !known.contains($0.id) })
        let alreadyHeld = Set(held.map(\.id))
        held = arriving.filter { !alreadyHeld.contains($0.id) } + held
        return Array(merged.dropFirst(arriving.count))
    }

    /// Le fil se met à tenir sa tête, ou la lâche. La lâcher rend la liste à
    /// montrer quand quelque chose attendait, `nil` sinon.
    mutating func settingHolding(_ holding: Bool, over shown: [FeedPost]) -> [FeedPost]? {
        isHolding = holding
        guard !holding, !held.isEmpty else { return nil }
        let known = Set(shown.map(\.id))
        let released = held.filter { !known.contains($0.id) }
        held = []
        return released + shown
    }

    /// Un post supprimé pendant qu'il attendait n'entre jamais.
    mutating func forgetting(_ postId: String) {
        held.removeAll { $0.id == postId }
    }

    private static func contains(_ id: String, in posts: [FeedPost]) -> Bool {
        posts.contains { $0.id == id }
    }
}
