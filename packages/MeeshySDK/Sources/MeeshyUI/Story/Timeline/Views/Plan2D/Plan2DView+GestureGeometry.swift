import SwiftUI
import MeeshySDK
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Plan2DView + GestureGeometry

extension Plan2DView {
    // MARK: - Gestes (rév. 2, M11)

    /// `nonisolated` pour la même raison que `GestureOutcome` plus bas : la
    /// conformance `Equatable` synthétisée serait sinon isolée au `MainActor`
    /// et ni `EdgeHandleZone` ni les bancs ne pourraient comparer deux bords.
    nonisolated enum Edge: Equatable { case start, end }

    /// Même seuil que le hold du viseur de capture (P9) — 0,45 s — pour que
    /// l'appui long garde UN seul sens appris dans tout le composer.
    static let reorderArmDuration: TimeInterval = 0.45
    /// Tolérance de doigt avant qu'un mouvement ne soit plus considéré comme
    /// un tap/une tenue immobile — même valeur que le slop de capture (P9).
    static let reorderSlop: CGFloat = 24
    /// Cible tappable visée (HIG) — la zone d'une poignée DÉBORDE hors de la
    /// barre pour l'atteindre quand celle-ci est étroite, et ne cède que
    /// devant l'autre poignée, avec qui elle partage alors la barre au milieu
    /// (`edgeHandleZones`).
    static let edgeHandleMinHitWidth: CGFloat = 44

    static func withinSlop(_ translation: CGSize) -> Bool {
        abs(translation.width) <= reorderSlop && abs(translation.height) <= reorderSlop
    }

    /// Rangée touchée par un point Y — `nil` hors du plan (au-dessus de la
    /// première piste ou sous la dernière), jamais un index hors bornes.
    static func rowIndex(forY y: CGFloat, laneHeight: CGFloat, trackCount: Int) -> Int? {
        guard laneHeight > 0, trackCount > 0, y >= 0 else { return nil }
        let index = Int(y / laneHeight)
        guard index >= 0, index < trackCount else { return nil }
        return index
    }

    /// Cran net (M11) : vrai seulement quand la piste quittée et la piste
    /// atteinte ne portent pas le MÊME plan — traverser deux pistes du même
    /// plan ne déclenche rien.
    static func crossedPlaneBoundary(from: Int, to: Int, tracks: [Plan2DTrack]) -> Bool {
        guard tracks.indices.contains(from), tracks.indices.contains(to) else { return false }
        return tracks[from].plane != tracks[to].plane
    }

    /// Cible tappable d'une poignée de bord, en x de CANVAS, pour une rangée
    /// donnée du plan. UNE seule source : le hit-test du geste et les cibles
    /// réellement posées à l'écran la lisent au même endroit.
    nonisolated struct EdgeHandleZone: Equatable, Identifiable {
        let trackId: String
        let edge: Edge
        let rowIndex: Int
        let minX: CGFloat
        let maxX: CGFloat

        var id: String { "\(trackId)#\(edge == .start ? "start" : "end")" }
        var width: CGFloat { maxX - minX }
        func contains(_ touchX: CGFloat) -> Bool { touchX >= minX && touchX <= maxX }
    }

    /// Les deux zones de poignée d'une piste — vide pour un fantôme (pas de
    /// bord à tirer, il n'a pas de durée choisie, O4), pour une piste NON
    /// sélectionnée, ou pour une piste VERROUILLÉE (fond/synthétique).
    ///
    /// Sélection préalable : « sélectionner une piste, c'est passer en mode
    /// édition dessus » (parité `ClipTrimHandles.shouldShow(isSelected:
    /// isLocked:)`) — sans cette garde, le rognage accidentel était possible
    /// dès le premier contact sur n'importe quelle barre (revue Opus,
    /// constat 3). Verrou : NI poignées NI déplacement pour un fond/
    /// synthétique — sa fenêtre est ignorée en lecture.
    ///
    /// La zone vise 44 pt (HIG) et DÉBORDE hors de la barre quand celle-ci est
    /// étroite. Elle ne déborde jamais au point d'avaler l'autre poignée : sous
    /// la largeur de la zone, les deux se PARTAGENT la barre en son milieu.
    /// Sans ce partage, le premier test évalué (`.start`) prenait tout contact
    /// et la poignée de FIN d'une barre plus étroite que 22 pt devenait
    /// inatteignable (revue Opus, mineur 18).
    static func edgeHandleZones(for track: Plan2DTrack, rowIndex: Int, isSelected: Bool, zoom: Plan2DZoom,
                                laneWidth: CGFloat, slideDuration: Double) -> [EdgeHandleZone] {
        guard isSelected, !track.isLocked else { return [] }
        return edgeZoneGeometry(for: track, rowIndex: rowIndex, zoom: zoom, laneWidth: laneWidth,
                                slideDuration: slideDuration)
    }

    /// Géométrie NUE des deux zones de bord d'une piste `.timed` — sans le
    /// garde de sélection/verrou ci-dessus. `tapTarget` (mineur 19,
    /// ci-dessous) en a besoin SANS ce garde : la préséance du bord sur un
    /// losange qui le recouvre est une question de ce que le doigt VISE,
    /// indépendante de la poignée étant ou non actuellement rendue (revue
    /// Opus DoD sur D6b — coupler les deux avait rendu la fiche du clip
    /// inatteignable au tap sur une piste non sélectionnée, la régression
    /// même que mineur 19 corrigeait).
    private static func edgeZoneGeometry(for track: Plan2DTrack, rowIndex: Int, zoom: Plan2DZoom,
                                         laneWidth: CGFloat, slideDuration: Double) -> [EdgeHandleZone] {
        guard case let .timed(start, end) = track.bar else { return [] }
        let startX = x(forTime: start, zoom: zoom, laneWidth: laneWidth, slideDuration: slideDuration)
        let endX = x(forTime: end, zoom: zoom, laneWidth: laneWidth, slideDuration: slideDuration)
        let half = edgeHandleMinHitWidth / 2
        let midX = (startX + endX) / 2
        return [
            EdgeHandleZone(trackId: track.id, edge: .start, rowIndex: rowIndex,
                           minX: startX - half, maxX: min(startX + half, midX)),
            EdgeHandleZone(trackId: track.id, edge: .end, rowIndex: rowIndex,
                           minX: max(endX - half, midX), maxX: endX + half)
        ]
    }

    /// Toutes les cibles du plan, rangée par rangée — ce que la couche de
    /// poignées pose réellement à l'écran. `selectedTrackId` borne les
    /// cibles à la SEULE piste sélectionnée (trim préalable, ci-dessus).
    static func edgeHandleZones(tracks: [Plan2DTrack], selectedTrackId: String?, zoom: Plan2DZoom,
                                laneWidth: CGFloat, slideDuration: Double) -> [EdgeHandleZone] {
        tracks.enumerated().flatMap { index, track in
            edgeHandleZones(for: track, rowIndex: index, isSelected: track.id == selectedTrackId,
                            zoom: zoom, laneWidth: laneWidth, slideDuration: slideDuration)
        }
    }

    /// Poignée de bord touchée, si `touchX` tombe dans sa zone tappable. Au
    /// milieu exact d'une barre étroite, le DÉBUT l'emporte — une frontière
    /// doit appartenir à quelqu'un.
    static func edgeHandle(touchX: CGFloat, track: Plan2DTrack, isSelected: Bool,
                           zoom: Plan2DZoom, laneWidth: CGFloat, slideDuration: Double) -> Edge? {
        edgeHandleZones(for: track, rowIndex: 0, isSelected: isSelected, zoom: zoom, laneWidth: laneWidth,
                        slideDuration: slideDuration)
            .first { $0.contains(touchX) }?
            .edge
    }

    /// Rayon de tap d'un losange AFFICHÉ — même ordre de grandeur que la
    /// zone tappable de `KeyframeMarkerView` (`.inset(by: -16)` autour d'un
    /// losange de 8-10 pt) : le marqueur est petit, exiger la précision du
    /// pixel serait une régression.
    static let keyframeHitRadius: CGFloat = 16

    /// Le losange le plus proche de `touchX`, dans SA piste, s'il tombe dans
    /// `keyframeHitRadius` — `nil` si la piste n'a aucun losange ou si aucun
    /// n'est assez proche. Consulté par `handleEnded` AVANT `onSelectTrack`
    /// sur un outcome `.select` (Guard 4g) : sans lui, aucun keyframe
    /// individuel n'est jamais atteignable au tap.
    static func keyframeHit(touchX: CGFloat, track: Plan2DTrack,
                            zoom: Plan2DZoom, laneWidth: CGFloat, slideDuration: Double) -> String? {
        track.keyframes
            .map { keyframe -> (id: String, distance: CGFloat) in
                let kx = x(forTime: keyframe.time, zoom: zoom, laneWidth: laneWidth, slideDuration: slideDuration)
                return (keyframe.id, abs(touchX - kx))
            }
            .filter { $0.distance <= keyframeHitRadius }
            .min { $0.distance < $1.distance }
            .map(\.id)
    }

    /// Les deux axes du plan : horizontal = durée, vertical = empilement. Un
    /// geste armé sert L'UN des deux, jamais les deux (revue Opus, constat 2 :
    /// sans verrou, tout réordonnancement au doigt empilait aussi un
    /// `MoveClipCommand`).
    nonisolated enum DragAxis: Equatable {
        case horizontal
        case vertical
    }

    /// Zone morte avant qu'un axe ne soit élu. Un doigt vertical porte
    /// toujours quelques points d'horizontal : comparer les dominantes sur une
    /// translation nulle éliraient au bruit.
    static let axisDeadZone: CGFloat = 8

    /// L'axe dominant d'une translation, `nil` tant que la zone morte n'est pas
    /// franchie. À égalité parfaite, le vertical l'emporte : un doute ne se
    /// paie jamais d'un déplacement temporel non voulu.
    static func dominantAxis(_ translation: CGSize) -> DragAxis? {
        let dx = abs(translation.width)
        let dy = abs(translation.height)
        guard max(dx, dy) >= axisDeadZone else { return nil }
        return dx > dy ? .horizontal : .vertical
    }

    /// Ce que le plan fait d'une frame de geste pas encore armé.
    ///
    /// `arm(axis:)` porte l'axe DÉJÀ connu quand l'armement vient d'un
    /// glissement franc (« poser, hésiter, glisser ») ; `nil` quand il vient
    /// d'une tenue, où l'axe reste à élire au premier vrai mouvement.
    nonisolated enum ArmDecision: Equatable {
        case wait
        case arm(axis: DragAxis?)
        case yieldToScroller
    }

    /// Qui tient le geste — le plan ou le scroller qui l'entoure.
    ///
    /// L'ordre des trois tests EST la correction (revue Opus, constat 5) :
    ///
    ///   1. la TENUE d'abord. `DragGesture.onChanged` ne se déclenche pas sur
    ///      un doigt strictement immobile : la première frame après la tenue a
    ///      souvent déjà quitté le slop. Tester le slop avant le délai
    ///      condamnerait tout réordonnancement ;
    ///   2. sous le slop, on attend — c'est encore un tap qui tremble ;
    ///   3. au-delà, la dominante tranche : un glissement HORIZONTAL franc sur
    ///      une piste appartient à la piste (le piège déjà rencontré sur les
    ///      barres de clip de l'ancienne frise — un appui long sur doigt
    ///      immobile ne s'engage jamais sur un glissement lent) ; un glissement VERTICAL
    ///      appartient au scroller, sans quoi la liste des pistes ne défilerait
    ///      plus nulle part.
    static func armDecision(translation: CGSize, elapsed: TimeInterval) -> ArmDecision {
        guard elapsed < reorderArmDuration else { return .arm(axis: nil) }
        guard !withinSlop(translation) else { return .wait }
        return dominantAxis(translation) == .horizontal ? .arm(axis: .horizontal) : .yieldToScroller
    }

    /// Ce qu'un tap DÉSIGNE sur une piste.
    ///
    /// Un losange posé au tout début de son clip se dessine EXACTEMENT sur le
    /// bord de la barre : son rayon de tap (16 pt) tombe entier dans la zone de
    /// poignée. Consulter les losanges en premier rendait alors la fiche du
    /// CLIP inatteignable au tap sur ce bord (revue Opus, mineur 19) — le bord
    /// a donc la préséance, et le losange reste la cible la plus précise
    /// partout ailleurs sur la barre.
    ///
    /// Cette préséance est INDÉPENDANTE de `selectedTrackId` — délibérément
    /// (revue Opus DoD sur D6b) : elle tranche ce que le doigt VISE, pas
    /// quelle poignée est actuellement rendue. La coupler à la sélection
    /// (arbitrage 2, D6b) avait réintroduit exactement la régression que
    /// mineur 19 corrigeait — sur une piste NON sélectionnée, dont la barre
    /// entière tombe sous le rayon de tap d'un losange à t=0, le tap
    /// n'atteignait plus jamais `.track`, donc plus aucune sélection ne
    /// pouvait naître d'un tap sur la barre.
    ///
    /// Pour texte/média, le losange reste une cible distincte du clip — la
    /// préséance du bord y protège la ré-atteignabilité de la fiche CLIP sur
    /// une barre courte, exactement le rôle que mineur 19 lui donnait.
    nonisolated enum TapTarget: Equatable {
        case keyframe(String)
        case track
    }

    static func tapTarget(touchX: CGFloat, track: Plan2DTrack,
                          zoom: Plan2DZoom, laneWidth: CGFloat, slideDuration: Double) -> TapTarget {
        let onEdge = edgeZoneGeometry(for: track, rowIndex: 0, zoom: zoom, laneWidth: laneWidth,
                                      slideDuration: slideDuration).contains { $0.contains(touchX) }
        guard !onEdge,
              let keyframeId = keyframeHit(touchX: touchX, track: track, zoom: zoom,
                                           laneWidth: laneWidth, slideDuration: slideDuration)
        else { return .track }
        return .keyframe(keyframeId)
    }

    /// Delta de temps (secondes) pour un delta de pixels ANCRÉ au geste —
    /// inverse ponctuel de `Plan2DLayout.x`, gardé côté vue (D1 est gelé).
    static func timeDelta(forDeltaX deltaX: CGFloat, zoom: Plan2DZoom, laneWidth: CGFloat, slideDuration: Double) -> Double {
        guard laneWidth > 0, zoom.scale > 0 else { return 0 }
        return Double(deltaX / (laneWidth * zoom.scale)) * slideDuration
    }

    /// Déplacement TEMPOREL d'une piste, en secondes cumulées depuis le début
    /// du geste — `nil` quand aucun déplacement ne s'applique.
    ///
    /// Déplacer une piste dans le temps passe par le MÊME armement que le
    /// réordonnancement vertical (M11), puis par l'ÉLECTION de l'axe
    /// horizontal : les deux mutations du plan ne partent jamais du même
    /// geste.
    ///
    /// Une piste FANTÔME est exclue : elle n'a pas de fenêtre à déplacer, et
    /// lui en fabriquer une au premier glissement transformerait un défaut en
    /// choix (O4) — la même raison qui prive son bord de poignée. Une piste
    /// VERROUILLÉE (fond/synthétique) l'est aussi : NI poignées NI
    /// déplacement (revue Opus, constat 3) — la lecture ignore sa fenêtre,
    /// la déplacer au doigt mentirait.
    ///
    /// Deux verrous, tous deux nés de la revue Opus : l'axe ÉLU doit être
    /// l'horizontal (un réordonnancement vertical n'émet JAMAIS de
    /// `MoveClipCommand`), et la translation est mesurée DEPUIS l'armement —
    /// les points de slop parcourus avant lui ne se rendent pas en secondes.
    static func moveDelta(translationSinceArm: CGSize, axis: DragAxis?, gestureEdge: Edge?,
                          isReorderArmed: Bool, track: Plan2DTrack, zoom: Plan2DZoom,
                          laneWidth: CGFloat, slideDuration: Double) -> Double? {
        guard gestureEdge == nil, isReorderArmed, axis == .horizontal else { return nil }
        guard !track.isLocked, case .timed = track.bar else { return nil }
        let seconds = timeDelta(forDeltaX: translationSinceArm.width, zoom: zoom,
                                laneWidth: laneWidth, slideDuration: slideDuration)
        guard seconds != 0 else { return nil }
        return seconds
    }

    /// Ce que produit un relâchement de doigt — décidé sur la seule
    /// TRANSLATION finale, jamais sur `gestureEdge`/`isReorderArmed` seuls :
    /// une poignée de bord ARMÉE dès le touch-down (zone tappable ≥ 44 pt,
    /// débordante sur barre étroite) redevient un TAP si le doigt n'a jamais
    /// bougé au-delà du slop — sinon toute barre plus étroite que la zone de
    /// poignée (le cas même que la zone débordante existe pour couvrir)
    /// perdrait son tap-vers-Inspecteur.
    /// `nonisolated` explicite : `MeeshyUI` bascule l'isolation par défaut sur
    /// `MainActor` (SE-0466) et `Plan2DView` en hérite via sa conformance à
    /// `View` — sans ce marqueur, la conformance `Equatable` synthétisée
    /// devient elle-même main-actor-isolée et `XCTAssertEqual` (contexte non
    /// isolé) refuse de la comparer. Même précédent que `Plan2DZoom`/
    /// `TrackBar` (`Plan2DLayout.swift`).
    nonisolated enum GestureOutcome: Equatable {
        case select
        case reorder(to: Int)
        case none
    }

    static func gestureOutcome(translation: CGSize, gestureEdge: Edge?, isReorderArmed: Bool,
                               axis: DragAxis?, startRow: Int, endRow: Int) -> GestureOutcome {
        guard !withinSlop(translation) else { return .select }
        guard gestureEdge == nil, isReorderArmed, axis == .vertical,
              endRow != startRow else { return .none }
        return .reorder(to: endRow)
    }
}
