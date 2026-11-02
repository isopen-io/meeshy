import Foundation

// MARK: - Toucher un objet le fait passer devant (#13918)

public extension StoryEffects {

    /// **Toucher un objet posé le fait passer au premier plan** — décision
    /// porteur (#13918), règle R6 du spec « un seul compositeur ». Pour
    /// envoyer un objet au dernier rang, on touche les autres, du plus profond
    /// au plus haut : il n'y a plus d'action « Ordre ».
    ///
    /// Vaut pour les cinq familles posées (texte, média, sticker, lieu, son).
    /// Le fond n'entre jamais dans cet ordre.
    ///
    /// L'objet touché DÉPASSE le plus haut des autres : à rang égal, l'ordre
    /// des familles départage, et rejoindre un rang ne suffit pas à passer
    /// devant. Un ancien contenu dont des objets n'ont jamais porté de rang
    /// publie ceux-ci à leur rang d'insertion (`wireZ`) : le rang obtenu les
    /// dépasse aussi, et c'est lui qui part.
    ///
    /// - Returns: `nil` quand rien ne change — l'objet est déjà devant tout,
    ///   c'est un fond, ou l'id ne désigne plus rien. Rien ne change, donc
    ///   aucune étape d'annulation.
    func broughtToFront(_ id: String) -> StoryEffects? {
        let poses = sceneObjects.filter { !$0.isBackground }
        guard poses.contains(where: { $0.id == id }), poses.last?.id != id else { return nil }
        let autres = poses.filter { $0.id != id }
        let rangDInsertion = wireMissingZIndex?.isDisjoint(with: autres.map(\.id)) == false ? sceneObjects.count : 0
        let sommet = max(autres.map(\.zIndex).max() ?? 0, rangDInsertion) + 1
        var effets = self
        effets.wireMissingZIndex?.remove(id)
        effets.textObjects = Self.lifted(textObjects, id, \.id) { $0.zIndex = sommet }
        effets.mediaObjects = mediaObjects.map { Self.lifted($0, id, \.id) { $0.zIndex = sommet } }
        effets.stickerObjects = stickerObjects.map { Self.lifted($0, id, \.id) { $0.zIndex = sommet } }
        effets.locationObjects = Self.lifted(locationObjects, id, \.id) { $0.zIndex = sommet }
        effets.audioPlayerObjects = audioPlayerObjects.map { Self.lifted($0, id, \.id) { $0.zIndex = sommet } }
        return effets
    }
}

private extension StoryEffects {
    /// L'objet prend son rang et passe en fin de tableau : l'inspecteur lit
    /// l'ordre du tableau, le rendu celui du rang.
    static func lifted<T>(_ items: [T], _ id: String, _ key: KeyPath<T, String>,
                          stamp: (inout T) -> Void) -> [T] {
        guard let index = items.firstIndex(where: { $0[keyPath: key] == id }) else { return items }
        var objet = items[index]
        stamp(&objet)
        return items.enumerated().filter { $0.offset != index }.map(\.element) + [objet]
    }
}
