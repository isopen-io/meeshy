import QuartzCore

/// **Réconcilie les calques d'un conteneur avec un arbre ordonné, sans toucher
/// ce qui n'a pas bougé (#9865).**
///
/// Le canevas détachait puis ré-attachait chaque calque d'objet à chaque image
/// de lecture. Ici, un arbre identique ne coûte qu'une comparaison d'identités ;
/// sinon les calques sortis quittent le conteneur et chaque autre est inséré
/// (ou déplacé) à son rang. Un calque resté en place ne quitte jamais son
/// parent : ses `CAKeyframeAnimation` et son horloge restent posées.
///
/// Un calque listé deux fois (deux objets de même `id` servis par le cache)
/// prend sa DERNIÈRE place, comme sous une suite d'`addSublayer` : sans ce
/// dédoublonnage, les rangs déjà posés ne seraient plus justes et l'insertion
/// viserait un rang au-delà de la fin du conteneur.
enum StoryLayerTree {
    static func isAttached(_ layers: [CALayer], in container: CALayer) -> Bool {
        let current = container.sublayers ?? []
        return current.count == layers.count && zip(current, layers).allSatisfy { $0 === $1 }
    }

    static func attach(_ layers: [CALayer], to container: CALayer) {
        guard !isAttached(layers, in: container) else { return }
        let tree = lastOccurrences(of: layers)
        guard !isAttached(tree, in: container) else { return }
        let kept = Set(tree.map(ObjectIdentifier.init))
        (container.sublayers ?? [])
            .filter { !kept.contains(ObjectIdentifier($0)) }
            .forEach { $0.removeFromSuperlayer() }
        tree.enumerated().forEach { index, layer in
            let current = container.sublayers ?? []
            guard index >= current.count || current[index] !== layer else { return }
            container.insertSublayer(layer, at: UInt32(index))
        }
    }

    private static func lastOccurrences(of layers: [CALayer]) -> [CALayer] {
        let lastRank = Dictionary(layers.enumerated().map { (ObjectIdentifier($0.element), $0.offset) },
                                  uniquingKeysWith: { _, later in later })
        return layers.enumerated()
            .filter { lastRank[ObjectIdentifier($0.element)] == $0.offset }
            .map(\.element)
    }
}
