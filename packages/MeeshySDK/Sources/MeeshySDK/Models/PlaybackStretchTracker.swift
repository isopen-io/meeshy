import Foundation

/// Ce qui a mis fin à une écoute continue.
///
/// La frontière est elle-même une information : s'être arrêté en pause, avoir
/// sauté ailleurs, coupé le son ou laissé le média se terminer ne racontent pas
/// la même chose sur l'intérêt porté au contenu.
public enum StretchEnd: String, Codable, Sendable, Equatable {
    /// L'utilisateur a mis en pause.
    case pause
    /// L'utilisateur a déplacé le curseur ailleurs.
    case seek
    /// L'utilisateur a coupé le son — un média muet n'est pas écouté.
    case muted
    /// Le média est allé jusqu'au bout tout seul.
    case completed
    /// L'écran a été quitté, ou l'app est passée en arrière-plan.
    case dismissed
    /// Une nouvelle lecture a démarré sans que la précédente soit fermée — le
    /// lecteur a manqué un événement. Conservé plutôt que perdu.
    case superseded
}

public struct PlaybackStretch: Codable, Sendable, Equatable {
    public let startMs: Int
    public let endMs: Int
    public let endedBy: StretchEnd

    public init(startMs: Int, endMs: Int, endedBy: StretchEnd) {
        self.startMs = startMs
        self.endMs = endMs
        self.endedBy = endedBy
    }
}

/// Capture fidèle de l'interaction d'un participant avec un média.
///
/// ## Pourquoi pas d'échantillonnage périodique
///
/// Relever la position toutes les N secondes perd structurellement du contenu :
/// un média d'une seconde n'est jamais relevé, une écoute de 500 ms non plus, et
/// même sur du contenu long la portion écoutée entre le dernier relevé et la
/// pause disparaît. Réduire l'intervalle ne corrige rien — ça déplace le seuil
/// de perte et multiplie les réveils.
///
/// Le lecteur connaît les frontières exactes : lecture, pause, déplacement du
/// curseur, coupure du son, fin du média, fermeture de l'écran. Chaque
/// intervalle entre deux frontières est une écoute continue, donc un segment
/// exact — quelle que soit sa durée.
///
/// ## Ce que la trace préserve
///
/// Elle est **chronologique et motivée** : elle restitue l'interaction, pas
/// seulement le volume écouté. La couverture (quelles portions, sans doublon)
/// s'en DÉDUIT par fusion des chevauchements ; elle n'est pas stockée à part,
/// pour n'avoir qu'une source de vérité.
///
/// Aucune horloge interne, aucun timer : l'appelant fournit la position média à
/// chaque frontière. `struct` sans isolation — rien à synchroniser, le
/// propriétaire (le lecteur, `@MainActor` en pratique) en détient une copie.
///
/// Miroir TypeScript : `apps/web/utils/playback-stretch-tracker.ts` — mêmes cas.
/// Voir `docs/superpowers/specs/2026-07-24-media-views-enrichment-design.md`.
public struct PlaybackStretchTracker: Sendable {

    /// Position d'ouverture de l'écoute en cours, `nil` si aucune.
    private var openedAtMs: Int?
    /// Dernière position connue, pour fermer une écoute sans position explicite.
    private var lastObservedMs: Int = 0
    private var stretches: [PlaybackStretch] = []

    public init() {}

    public var hasOpenStretch: Bool { openedAtMs != nil }

    /// Début d'une lecture continue à cette position média.
    public mutating func begin(_ positionMs: Int) {
        // Une ouverture qui en écrase une autre signale un événement manqué : on
        // ferme la précédente à la position courante plutôt que de la perdre.
        if openedAtMs != nil { close(at: positionMs, endedBy: .superseded) }
        openedAtMs = positionMs
        lastObservedMs = positionMs
    }

    /// Met à jour la position connue sans rien clore. Sert uniquement à pouvoir
    /// fermer proprement une écoute dont la position finale serait illisible.
    public mutating func observe(_ positionMs: Int) {
        lastObservedMs = positionMs
    }

    public mutating func pause(_ positionMs: Int? = nil) {
        close(at: positionMs ?? lastObservedMs, endedBy: .pause)
    }

    public mutating func muted(_ positionMs: Int? = nil) {
        close(at: positionMs ?? lastObservedMs, endedBy: .muted)
    }

    public mutating func completed(_ positionMs: Int? = nil) {
        close(at: positionMs ?? lastObservedMs, endedBy: .completed)
    }

    public mutating func dismissed(_ positionMs: Int? = nil) {
        close(at: positionMs ?? lastObservedMs, endedBy: .dismissed)
    }

    /// Déplacement du curseur : clôt l'écoute en cours et en ouvre une autre.
    ///
    /// Déplacer le curseur d'un média EN PAUSE n'ouvre rien : rien n'est écouté
    /// tant que la lecture n'a pas repris. Sans cette garde, parcourir la barre
    /// de progression à l'arrêt fabriquerait une écoute qui n'a pas eu lieu.
    public mutating func seek(from fromPositionMs: Int, to toPositionMs: Int) {
        let wasPlaying = openedAtMs != nil
        close(at: fromPositionMs, endedBy: .seek)
        if wasPlaying { openedAtMs = toPositionMs }
        lastObservedMs = toPositionMs
    }

    /// Rend les écoutes terminées et les retire, en préservant l'ordre
    /// CHRONOLOGIQUE — pas l'ordre des positions. Écouter la fin puis revenir au
    /// début doit se lire dans cet ordre-là.
    ///
    /// Une écoute encore ouverte est conservée : elle partira à sa fermeture.
    public mutating func drain() -> [PlaybackStretch] {
        let drained = stretches
        stretches.removeAll(keepingCapacity: true)
        return drained
    }

    private mutating func close(at positionMs: Int, endedBy: StretchEnd) {
        let openedAt = openedAtMs
        openedAtMs = nil
        lastObservedMs = positionMs

        guard let start = openedAt else { return }
        // Durée nulle ou négative : le lecteur se contredit. Mieux vaut perdre
        // une observation que fabriquer un segment absurde.
        guard positionMs > start else { return }

        stretches.append(PlaybackStretch(startMs: start, endMs: positionMs, endedBy: endedBy))
    }
}
