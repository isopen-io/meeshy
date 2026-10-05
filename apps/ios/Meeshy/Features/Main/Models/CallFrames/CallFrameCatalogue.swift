import Foundation

/// **QUELS CADRES POUR COMBIEN DE PERSONNES** — le miroir de
/// `apps/web/src/lib/calls/frames/frame-filter.ts` (spec § 2). À `n` personnes
/// (moi compris), seuls les cadres dont la tranche contient `n` se proposent ;
/// ceux d'un appel à dix ne s'affichent pas à quatre, ceux d'un duo pas à cinq.
/// Les cadres eux-mêmes viennent de `CallFrameCatalogue+Generated.swift`.
nonisolated enum CallFrameCatalogue {
    static var all: [CallFrameDesign] { generated }

    static func bucket(for people: Int) -> CallFrameBucket? {
        CallFrameBucket.allCases.first { $0.people.contains(people) }
    }

    static func frames(forPeople people: Int, mood: CallFrameMood? = nil, in frames: [CallFrameDesign] = all) -> [CallFrameDesign] {
        frames.filter { $0.serves(people: people) && (mood == nil || $0.mood == mood) }
    }

    /// Les ambiances qui ont au moins un cadre pour `n`, dans l'ordre canonique.
    static func moods(forPeople people: Int, in frames: [CallFrameDesign] = all) -> [CallFrameMood] {
        let served = Set(self.frames(forPeople: people, in: frames).map(\.mood.rawValue))
        return CallFrameMood.allCases.filter { served.contains($0.rawValue) }
    }

    /// Le nombre a changé : le même motif dans la variante de la nouvelle tranche ;
    /// sinon le premier cadre de la même ambiance ; sinon `nil` (l'hôte retombe sur un classique).
    static func reconcile(selectedId: String, people: Int, in frames: [CallFrameDesign] = all) -> CallFrameDesign? {
        if let current = frames.first(where: { $0.id == selectedId }), current.serves(people: people) {
            return current
        }
        let parts = selectedId.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        let motif = parts.prefix(2).joined(separator: ".")
        if let sibling = frames.first(where: { $0.motif == motif && $0.serves(people: people) }) {
            return sibling
        }
        let mood = parts.first ?? ""
        return frames.first { $0.mood.rawValue == mood && $0.serves(people: people) }
    }

    static func frame(id: String, in frames: [CallFrameDesign] = all) -> CallFrameDesign? {
        frames.first { $0.id == id }
    }
}
