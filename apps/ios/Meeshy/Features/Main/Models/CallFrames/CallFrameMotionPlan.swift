import Foundation

/// Comment un ornement bouge (#12683). Les durées sont en secondes ; les amplitudes en `unit` de la
/// scène (le plus petit côté de la toile), pour qu'un mouvement garde la même allure à toute taille.
nonisolated enum CallFrameMotionStyle: Equatable, Sendable {
    /// Tombe en continu (confettis, neige, pétales, feuilles) : la planche se répète à la verticale.
    case fall(period: Double)
    /// Monte en continu (bulles, cœurs).
    case rise(period: Double)
    /// Scintille par groupes décalés (étincelles, étoiles, lucioles, runes).
    case twinkle(period: Double)
    /// Respire en opacité (bokeh, lune, halo de lumière).
    case breathe(period: Double)
    /// Vacille comme une flamme (bougies).
    case flicker
    /// Clignote net (le « REC » d'un caméscope).
    case blink
    /// Éclate puis s'éteint (éclairs).
    case flash
    /// Sursaute en saccades (glitch).
    case jitter
    /// Défile d'un pas de trame (lignes de balayage).
    case scroll
    /// Tourne lentement sur lui-même (orbites).
    case spin(period: Double)
    /// Oscille d'un angle autour du centre (rayons).
    case sway(radians: Double, period: Double)
    /// Dérive d'un côté à l'autre (nuages, chauves-souris).
    case drift(units: Double, period: Double)
    /// Flotte de haut en bas (ballons, notes).
    case bob(units: Double, period: Double)
}

/// Un ornement animé : son rang dans le cadre (la graine de son placement), sa forme et son mouvement.
nonisolated struct CallFrameMotionTrack: Equatable, Sendable {
    let rank: Int
    let ornament: CallFrameOrnament
    let style: CallFrameMotionStyle
    /// `loop` : en boucle ; `onAppear` : une entrée, puis l'ornement reste à sa place.
    let repeats: Bool

    /// Les groupes peints séparément pour décaler leur mouvement (un scintillement d'un seul
    /// bloc ressemble à un écran qui clignote, pas à des étoiles).
    var partitions: Int { CallFrameMotionPlan.partitions(for: style) }

    /// Un ornement qui tombe ou monte se peint sur TOUTE la toile, pour qu'en défilant il n'y ait
    /// jamais de trou : le masque du cadre le garde hors des visages et des textes.
    var travels: Bool { CallFrameMotionPlan.travels(style) }
}

/// **LE PLAN DE MOUVEMENT D'UN CADRE** (#12683), en fonctions pures : quels ornements bougent, et
/// comment. Un ornement qui déclare `loop` ou `onAppear` mais dont la forme ne sait pas bouger
/// (grain, vignette, couronne, ruban, adhésif, toiles, coulures, crânes, roses) reste peint fixe.
nonisolated enum CallFrameMotionPlan {
    /// Au-delà, les ornements suivants restent fixes : le direct garde sa marge de calcul (Lens Snap : un seul effet lourd).
    static let maxTracks = 4

    static func style(for kind: CallFrameOrnamentKind) -> CallFrameMotionStyle? {
        switch kind {
        case .confetti: return .fall(period: 9)
        case .snow: return .fall(period: 12)
        case .petals: return .fall(period: 14)
        case .leaves: return .fall(period: 16)
        case .bubbles: return .rise(period: 10)
        case .hearts: return .rise(period: 11)
        case .sparkles: return .twinkle(period: 2.4)
        case .stars: return .twinkle(period: 3.2)
        case .fireflies: return .twinkle(period: 2)
        case .runes: return .twinkle(period: 3.6)
        case .crosshair: return .breathe(period: 2)
        case .bokeh: return .breathe(period: 6)
        case .moon: return .breathe(period: 6)
        case .lightleak: return .breathe(period: 5)
        case .candles: return .flicker
        case .rec: return .blink
        case .lightning: return .flash
        case .glitch: return .jitter
        case .scanlines: return .scroll
        case .orbits: return .spin(period: 40)
        case .rays: return .sway(radians: 0.06, period: 8)
        case .clouds: return .drift(units: 0.04, period: 9)
        case .bats: return .drift(units: 0.03, period: 3.4)
        case .balloons: return .bob(units: 0.012, period: 3)
        case .notes: return .bob(units: 0.01, period: 2.2)
        case .grain, .vignette, .crown, .ribbon, .tape, .cobwebs, .drips, .skulls, .roses: return nil
        }
    }

    /// Les ornements semés un par un (et non tracés d'un bloc) : eux seuls se répartissent en groupes.
    static func isScattered(_ kind: CallFrameOrnamentKind) -> Bool {
        switch kind {
        case .sparkles, .bokeh, .confetti, .balloons, .stars, .hearts, .fireflies, .petals, .leaves, .bubbles, .snow,
             .crosshair, .runes, .lightning, .notes, .clouds, .bats, .skulls, .roses:
            return true
        case .rays, .glitch, .scanlines, .grain, .vignette, .lightleak, .crown, .ribbon, .tape, .rec, .orbits,
             .cobwebs, .drips, .candles, .moon:
            return false
        }
    }

    static func partitions(for style: CallFrameMotionStyle) -> Int {
        switch style {
        case .twinkle: return 3
        case .drift, .bob: return 2
        case .fall, .rise, .breathe, .flicker, .blink, .flash, .jitter, .scroll, .spin, .sway: return 1
        }
    }

    static func travels(_ style: CallFrameMotionStyle) -> Bool {
        switch style {
        case .fall, .rise: return true
        default: return false
        }
    }

    /// L'ornement bouge-t-il ? Il le déclare, et sa forme sait bouger.
    static func moves(_ ornament: CallFrameOrnament) -> Bool {
        ornament.motion != .still && style(for: ornament.kind) != nil
    }

    /// Les ornements animés d'un cadre, dans l'ordre du cadre, au plus `maxTracks`.
    static func tracks(for look: CallFrameLook) -> [CallFrameMotionTrack] {
        let tracks = look.ornaments.enumerated().compactMap { rank, ornament -> CallFrameMotionTrack? in
            guard ornament.motion != .still, let style = style(for: ornament.kind) else { return nil }
            return CallFrameMotionTrack(rank: rank, ornament: ornament, style: style, repeats: ornament.motion == .loop)
        }
        return Array(tracks.prefix(maxTracks))
    }

    /// #12683 — les particules d'une scène (celles d'une marque, par exemple) : un ornement semé de
    /// la forme `preset`, à la couleur et à la quantité déclarées, animé comme lui. Leur rang les place
    /// après les ornements, pour que leur tirage ne recopie jamais celui d'un ornement.
    static let sceneRankOffset = 100

    static func sceneTracks(for look: CallFrameLook) -> [CallFrameMotionTrack] {
        look.scene.enumerated().compactMap { index, layer -> CallFrameMotionTrack? in
            guard layer.kind == .particles, let preset = layer.preset, let style = style(for: preset) else { return nil }
            let ornament = CallFrameOrnament(kind: preset, color: layer.color ?? "#FFFFFF", density: density(forParticles: layer.maxParticles),
                                             layer: layer.depth == .back ? .back : .front, motion: .loop)
            return CallFrameMotionTrack(rank: sceneRankOffset + index, ornament: ornament, style: style, repeats: true)
        }
    }

    static func density(forParticles max: Int?) -> CallFrameDensity {
        switch max ?? 60 {
        case ...40: return .low
        case ...90: return .mid
        default: return .high
        }
    }

    /// Les couches de scène que Core Animation joue telles quelles : lumières et boucles vidéo.
    static func ambientLayers(for look: CallFrameLook) -> [CallFrameSceneLayer] {
        look.scene.filter { $0.kind == .light || $0.kind == .videoLoop }
    }

    /// Les rangs retirés des couches fixes parce qu'ils se peignent animés.
    static func animatedRanks(for look: CallFrameLook) -> Set<Int> {
        Set(tracks(for: look).map(\.rank))
    }
}
