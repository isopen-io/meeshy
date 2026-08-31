import Foundation
import CoreGraphics
import MeeshySDK

/// Le plan d'un objet à l'écran. Repris du contrat v3 (`Plane`) plutôt que
/// redéclaré : les trois plans du document et les trois plans de la timeline
/// sont la MÊME chose, et deux énumérations jumelles divergeraient au premier
/// kind ajouté.
public typealias TrackPlane = Plane

/// Ce qu'une piste occupe horizontalement.
///
/// `ghost` n'est pas « une durée inconnue » : c'est `timing == nil`, soit
/// « suit la slide » (O4). Le distinguer d'une durée explicitement fixée est
/// tout l'objet du plan — sans quoi ouvrir la timeline figerait par accident
/// ce que l'auteur voulait laisser suivre la slide.
public nonisolated enum TrackBar: Equatable, Sendable {
    case timed(start: Double, end: Double)
    case ghost
}

/// Un losange AFFICHÉ (S4 : édité à l'Inspecteur existant, jamais dans le
/// plan). Porte l'IDENTITÉ du `StoryKeyframe` d'origine — sans elle, un tap
/// sur le losange ne pourrait router vers AUCUN `KeyframeInspector` (le bus
/// de sélection route par id, `TimelineInspectorHost.resolveKeyframeSnapshot`).
///
/// `time` est ABSOLU (temps de timeline), pas relatif à son clip comme
/// `StoryKeyframe.time` : l'axe du plan est celui de la slide entière.
public nonisolated struct Plan2DKeyframe: Equatable, Sendable {
    public let id: String
    public let time: Double

    public init(id: String, time: Double) {
        self.id = id
        self.time = time
    }
}

/// Une rangée du plan 2D. Vertical = empilement (l'ordre de ce tableau EST
/// l'ordre à l'écran), horizontal = durée.
public nonisolated struct Plan2DTrack: Equatable, Identifiable, Sendable {
    public let id: String
    public let label: String
    public let plane: TrackPlane
    public let z: Int
    public let bar: TrackBar
    public let keyframes: [Plan2DKeyframe]
    /// Un média de FOND (`isBackground == true`) ou un clip SYNTHÉTIQUE (fond
    /// image posé par le composer, id préfixé
    /// `StoryComposerViewModel.syntheticTimelineClipIdPrefix`) est
    /// verrouillé : sa fenêtre début/durée est ignorée en lecture, la
    /// déplacer au doigt mentirait (retour user 2026-07-11). Restauré par la
    /// revue Opus, constat 3 — l'ancien conteneur le portait déjà via
    /// `isImmovableBackground` (`StoryTimelineView.swift:631`). Verrouillé =
    /// NI poignées de bord NI déplacement temporel (D2) — jamais un obstacle
    /// à la sélection, au mute ou au tap d'un keyframe.
    public let isLocked: Bool

    /// Dérivé de `keyframes` — jamais un second tableau parallèle qui
    /// pourrait diverger (une seule source pour les temps ET l'identité).
    public var keyframeTimes: [Double] { keyframes.map(\.time) }

    public init(id: String,
                label: String,
                plane: TrackPlane,
                z: Int,
                bar: TrackBar,
                keyframes: [Plan2DKeyframe] = [],
                isLocked: Bool = false) {
        self.id = id
        self.label = label
        self.plane = plane
        self.z = z
        self.bar = bar
        self.keyframes = keyframes
        self.isLocked = isLocked
    }
}

/// Les deux échelles du plan — une seule vue, jamais de mode « avancé »
/// séparé. `fit` fait tenir la slide entière dans la piste ; `detail` double
/// l'échelle pour poser une borne à la seconde près.
public nonisolated enum Plan2DZoom: String, CaseIterable, Sendable {
    case fit
    case detail

    public var scale: CGFloat {
        switch self {
        case .fit: return 1
        case .detail: return 2
        }
    }
}

/// ENGINE PUR du plan 2D : il lit le RUNTIME du composer (`StoryEffects`,
/// ce qui s'édite) et rend des rangées ordonnées. Aucune vue, aucun état,
/// aucune dépendance au document v3 — la vue (D2) ne fait que dessiner ceci.
///
/// `nonisolated` porte sur le TYPE : `MeeshyUI` bascule l'isolation par défaut
/// sur `MainActor` (SE-0466, `Package.swift`), et le layout doit rester
/// appelable à sec, hors du main actor, comme `ClipWindowResolver`.
public nonisolated enum Plan2DLayout {

    /// Les trois plans, dans l'ordre de lecture de l'écran : le premier plan
    /// est au plus près du spectateur, le fond tout en bas. Source unique de
    /// cet ordre — la vue s'en sert aussi pour ses en-têtes de section.
    public static let planeOrder: [TrackPlane] = [.fg, .content, .bg]

    /// Le fond visuel de la slide (couleur, dégradé ou image) n'est porté par
    /// aucun objet : sa piste a besoin d'une identité stable.
    public static let backgroundTrackID = "plan2d.background"

    /// Le fond sonore hérité (`backgroundAudioId`), quand aucun objet audio
    /// ne porte déjà `isBackground`.
    public static let backgroundSoundTrackID = "plan2d.background-sound"

    /// Le dessin est une COUCHE unique, portée par des traits sans identité
    /// de piste : sa rangée a, elle aussi, besoin d'une identité stable.
    public static let drawingTrackID = "plan2d.drawing"

    /// Pistes ordonnées pour l'écran : fg d'abord (au plus près du
    /// spectateur), puis content, puis bg ; dans un plan, z décroissant.
    public static func tracks(from effects: StoryEffects, slideDuration: Double) -> [Plan2DTrack] {
        let unordered = textTracks(effects, slideDuration: slideDuration)
            + stickerTracks(effects, slideDuration: slideDuration)
            + placeTracks(effects, slideDuration: slideDuration)
            + drawingTracks(effects)
            + mediaTracks(effects, slideDuration: slideDuration)
            + audioTracks(effects, slideDuration: slideDuration)
            + backgroundTracks(effects)

        return planeOrder.flatMap { plane in
            stacked(unordered.filter { $0.plane == plane })
        }
    }

    /// x en points pour un temps donné — deux zooms, l'échelle vient de la
    /// durée. Une slide sans durée ne produit pas de NaN : elle reste à
    /// l'origine.
    public static func x(forTime t: Double,
                         zoom: Plan2DZoom,
                         laneWidth: CGFloat,
                         slideDuration: Double) -> CGFloat {
        guard slideDuration > 0, t.isFinite, laneWidth.isFinite else { return 0 }
        return laneWidth * zoom.scale * CGFloat(t / slideDuration)
    }

    // MARK: - Familles → pistes (mêmes plans que la table §C2 de la spec)

    private static func textTracks(_ effects: StoryEffects, slideDuration: Double) -> [Plan2DTrack] {
        effects.textObjects.map { text in
            let trackBar = bar(start: text.startTime, duration: text.duration,
                               slideDuration: slideDuration)
            return Plan2DTrack(id: text.id,
                        label: "\(Glyph.text) \"\(text.text)\"",
                        plane: .fg,
                        z: text.zIndex,
                        bar: trackBar,
                        keyframes: markers(of: text.keyframes, clipStart: text.startTime, window: trackBar))
        }
    }

    private static func stickerTracks(_ effects: StoryEffects, slideDuration: Double) -> [Plan2DTrack] {
        (effects.stickerObjects ?? []).map { sticker in
            Plan2DTrack(id: sticker.id,
                        label: sticker.emoji,
                        plane: .fg,
                        z: sticker.zIndex,
                        bar: bar(start: sticker.startTime, duration: sticker.duration,
                                 slideDuration: slideDuration))
        }
    }

    /// **Une pastille de lieu apparaît et disparaît quand elle veut** —
    /// directive porteur 2026-08-31 (#4591). Elle portait `bar: .ghost` EN DUR,
    /// justifié par « aucun champ de timing au modèle » : c'était vrai, et
    /// c'était le trou, pas la règle.
    ///
    /// > Trois sites disaient la même chose et se citaient l'un l'autre : le
    /// > modèle sans fenêtre, le projet sans famille, cette piste sans barre.
    /// > **Un cercle d'absences a l'air d'une cohérence** — ce qui l'a brisé
    /// > était extérieur au code.
    ///
    /// Le fantôme reste le rendu d'une pastille SANS fenêtre posée : `bar(...)`
    /// le rend déjà pour `start == nil && duration == nil`, exactement comme
    /// pour un texte ou un sticker. Aucun cas particulier n'est nécessaire —
    /// c'est le cas particulier qui était le défaut.
    private static func placeTracks(_ effects: StoryEffects, slideDuration: Double) -> [Plan2DTrack] {
        effects.locationObjects.map { location in
            Plan2DTrack(id: location.id,
                        label: label(Glyph.place, location.place.name),
                        plane: .fg,
                        z: location.zIndex,
                        bar: bar(start: location.startTime, duration: location.duration,
                                 slideDuration: slideDuration))
        }
    }

    /// Le dessin est UNE couche, pas un trait par piste : l'auteur le pense
    /// comme un calque unique et n'en règle pas les traits un à un.
    private static func drawingTracks(_ effects: StoryEffects) -> [Plan2DTrack] {
        let hasStrokes = !(effects.drawingStrokes ?? []).isEmpty
        let hasLegacyData = effects.drawingData != nil
        guard hasStrokes || hasLegacyData else { return [] }
        return [Plan2DTrack(id: drawingTrackID,
                            label: Glyph.drawing,
                            plane: .fg,
                            z: 0,
                            bar: .ghost)]
    }

    private static func mediaTracks(_ effects: StoryEffects, slideDuration: Double) -> [Plan2DTrack] {
        (effects.mediaObjects ?? []).map { media in
            let trackBar = bar(start: media.startTime, duration: media.duration,
                               slideDuration: slideDuration)
            return Plan2DTrack(id: media.id,
                        label: label(mediaGlyph(media.mediaType), media.name),
                        plane: media.isBackground ? .bg : .content,
                        z: media.zIndex,
                        bar: trackBar,
                        keyframes: markers(of: media.keyframes, clipStart: media.startTime, window: trackBar),
                        isLocked: isLockedMedia(media))
        }
    }

    /// Même règle que l'ancien conteneur (`isImmovableBackground`) : un clip
    /// SYNTHÉTIQUE ou un média marqué `isBackground` sont verrouillés — leur
    /// fenêtre début/durée est ignorée en lecture.
    private static func isLockedMedia(_ media: StoryMediaObject) -> Bool {
        StoryComposerViewModel.isSyntheticTimelineClipId(media.id) || media.isBackground
    }

    /// Loi des deux plans audio (B3.3) : le chip est du premier plan de
    /// contenu, le fond sonore descend au plan du fond.
    private static func audioTracks(_ effects: StoryEffects, slideDuration: Double) -> [Plan2DTrack] {
        (effects.audioPlayerObjects ?? []).map { audio in
            let trackBar = bar(start: audio.startTime.map(Double.init),
                               duration: audio.duration.map(Double.init),
                               slideDuration: slideDuration)
            return Plan2DTrack(id: audio.id,
                        label: label(Glyph.audio, audio.name),
                        plane: audio.isBackground == true ? .bg : .content,
                        z: audio.zIndex ?? 0,
                        bar: trackBar,
                        keyframes: markers(of: audio.keyframes, clipStart: audio.startTime.map(Double.init),
                                          window: trackBar))
        }
    }

    private static func backgroundTracks(_ effects: StoryEffects) -> [Plan2DTrack] {
        visualBackgroundTrack(effects) + legacyBackgroundSoundTrack(effects)
    }

    /// Le fond visuel n'a de piste propre que si aucun média ne tient déjà le
    /// plan du fond — sinon la couleur n'est que le letterbox de ce média.
    private static func visualBackgroundTrack(_ effects: StoryEffects) -> [Plan2DTrack] {
        let hasBackgroundMedia = (effects.mediaObjects ?? []).contains { $0.isBackground }
        guard effects.background != nil, !hasBackgroundMedia else { return [] }
        return [Plan2DTrack(id: backgroundTrackID,
                            label: Glyph.background,
                            plane: .bg,
                            z: 0,
                            bar: .ghost)]
    }

    /// `backgroundAudioStart/End` ROGNENT la source — ce ne sont pas des
    /// bornes sur le plan. Un fond sonore boucle sur la timeline du contenu
    /// (B3.3) : sa piste est donc fantôme, toujours.
    private static func legacyBackgroundSoundTrack(_ effects: StoryEffects) -> [Plan2DTrack] {
        let hasBackgroundObject = (effects.audioPlayerObjects ?? []).contains { $0.isBackground == true }
        guard effects.backgroundAudioId != nil, !hasBackgroundObject else { return [] }
        return [Plan2DTrack(id: backgroundSoundTrackID,
                            label: Glyph.audio,
                            plane: .bg,
                            z: 0,
                            bar: .ghost)]
    }

    // MARK: - Règles communes

    /// Aucun champ de timing posé ⇒ fantôme. Un début sans durée court
    /// jusqu'au bout de la slide : c'est un choix, il se dessine.
    private static func bar(start: Double?, duration: Double?, slideDuration: Double) -> TrackBar {
        guard start != nil || duration != nil else { return .ghost }
        let begin = max(0, start ?? 0)
        let end = duration.map { begin + max(0, $0) } ?? max(begin, slideDuration)
        return .timed(start: begin, end: end)
    }

    /// Losanges AFFICHÉS d'un clip, triés par temps — identité comprise
    /// (`Plan2DKeyframe.id`), pour que le tap (D2/D3) puisse router vers le
    /// `KeyframeInspector` DU keyframe touché, pas un temps anonyme.
    ///
    /// `StoryKeyframe.time` est RELATIF au début de son clip ; l'axe du plan,
    /// lui, est ABSOLU (`x(forTime:)` mappe un temps de timeline). Le début du
    /// clip s'ajoute donc ICI — même projection que `KeyframeMarkerResolver`
    /// (`absoluteTime = start + kf.time`) et que l'en-tête du
    /// `KeyframeInspector` (`TimelineInspectorHost.resolveKeyframeSnapshot`).
    /// Sans elle, un losange dérive du début de son clip : il se dessine hors
    /// de sa propre barre et le tap tombe sur le mauvais keyframe.
    ///
    /// `window` ÉCRÊTE ensuite ce temps absolu à la barre RENDUE (revue Opus,
    /// mineur 15) : un clip rogné plus court que son dernier keyframe (`kf.time`
    /// ne bouge JAMAIS au rognage — `TimelineViewModel+Plan4Helpers.trimClipEnd`
    /// ne touche que `duration`) le laisserait sinon dériver hors de sa propre
    /// barre. L'écrêtage replie le losange au bord, il ne le fait jamais
    /// disparaître — sans quoi un keyframe rogné deviendrait indétectable
    /// plutôt que simplement précis à sa nouvelle borne. Un `.ghost` n'a pas de
    /// fenêtre à écrêter (O4, aucun timing n'a été choisi) : le temps reste
    /// tel quel.
    ///
    /// QUELLE VALEUR FAIT FOI (tranché en revue DoD de D6c, constat 3) : le
    /// temps STOCKÉ. L'écrêtage est une affordance de DESSIN et de hit-test,
    /// jamais une vérité de modèle — `StoryKeyframe.time` ne bouge pas, et
    /// l'en-tête du `KeyframeInspector`
    /// (`TimelineInspectorHost.keyframeSnapshot`) continue délibérément
    /// d'annoncer le temps NON écrêté. Le losange replié au bord dit « il y a
    /// ça au-delà de la coupe », l'en-tête dit OÙ. Écrêter aussi l'en-tête
    /// ferait mentir la fiche sur une donnée intacte, et ré-étendre la barre
    /// démentirait aussitôt le chiffre affiché.
    ///
    /// CONSÉQUENCE ASSUMÉE : plusieurs keyframes au-delà de la même borne s'y
    /// replient sur la MÊME abscisse, et `Plan2DView.keyframeHit` n'en désigne
    /// alors qu'un. La collision est RÉVERSIBLE, jamais destructrice — aucun
    /// losange n'est retiré du tableau, et ré-étendre la fin du clip les
    /// re-sépare tels qu'ils étaient (`trimClipEnd` ne touche que `duration`).
    /// C'est le prix payé pour qu'un keyframe rogné reste visible plutôt que
    /// de disparaître hors de sa barre ; l'alternative — le laisser dériver —
    /// est celle que le mineur 15 a corrigée.
    private static func markers(of keyframes: [StoryKeyframe]?, clipStart: Double?,
                                window: TrackBar) -> [Plan2DKeyframe] {
        let origin = max(0, clipStart ?? 0)
        let clampRange: (lower: Double, upper: Double)? = {
            guard case let .timed(start, end) = window else { return nil }
            return (min(start, end), max(start, end))
        }()
        return (keyframes ?? [])
            .map { kf -> Plan2DKeyframe in
                let absolute = origin + Double(kf.time)
                guard let clampRange else { return Plan2DKeyframe(id: kf.id, time: absolute) }
                let clamped = min(max(absolute, clampRange.lower), clampRange.upper)
                return Plan2DKeyframe(id: kf.id, time: clamped)
            }
            .sorted { $0.time < $1.time }
    }

    /// Tri STABLE par z décroissant : à z égal, l'ordre d'insertion tranche —
    /// sans quoi deux objets posés l'un après l'autre danseraient d'un rendu
    /// à l'autre.
    private static func stacked(_ tracks: [Plan2DTrack]) -> [Plan2DTrack] {
        tracks.enumerated()
            .sorted { lhs, rhs in
                lhs.element.z == rhs.element.z
                    ? lhs.offset < rhs.offset
                    : lhs.element.z > rhs.element.z
            }
            .map(\.element)
    }

    private static func label(_ glyph: String, _ name: String?) -> String {
        guard let name, !name.isEmpty else { return glyph }
        return "\(glyph) \(name)"
    }

    private static func mediaGlyph(_ mediaType: String) -> String {
        mediaType == "video" ? Glyph.video : Glyph.image
    }

    /// L'icône est le verbe (B3.2) : une piste se reconnaît à son glyphe et à
    /// son contenu, jamais à une étiquette de famille traduite.
    private enum Glyph {
        static let text = "Aa"
        static let place = "◎"
        static let drawing = "✎"
        static let audio = "♫"
        static let video = "▶"
        static let image = "▣"
        static let background = "▦"
    }
}
