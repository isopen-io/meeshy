import Foundation

/// Ce qu'une place de l'atlas montre : la case, le look visé, et s'il y est
/// peint ENTIER — `false` ⇒ son seul filtre, le cadre cuisait encore (#9351).
nonisolated struct ComposerLookStripSlot: Equatable, Sendable {
    let index: Int
    let look: ComposerPhotoLook
    let complete: Bool
}

/// **Ce que la bande repeint** (#9351, spec § 5) — le coût GPU de la bande est
/// cette règle : une trame vivante repeint toutes les cases ; sans elle, seule
/// une case neuve, dont le look a changé, ou dont le cadre vient de cuire, se
/// peint. Une case figée (palier « serious », défilement) garde son image.
nonisolated enum ComposerLookStripPaintRule {

    static func tilesToPaint(_ tiles: [ComposerLookStripTile], painted: [Int: ComposerLookStripSlot], slots: Int,
                             live: Bool, scenesReady: Set<Int>) -> [ComposerLookStripTile] {
        guard !live else { return tiles }
        return tiles.filter { tile in
            guard let place = painted[ComposerLookStripGeometry.slot(of: tile.index, slots: slots)],
                  place.index == tile.index, place.look == tile.look else { return true }
            return !place.complete && scenesReady.contains(tile.index)
        }
    }

    /// Une case sans image attend une trame — même figée : une miniature ne
    /// reste jamais un glyphe parce que l'appareil était déjà chaud à l'armement.
    static func needsFrame(_ tiles: [ComposerLookStripTile], painted: [Int: ComposerLookStripSlot],
                           slots: Int) -> Bool {
        !tilesToPaint(tiles, painted: painted, slots: slots, live: false, scenesReady: []).isEmpty
    }
}
