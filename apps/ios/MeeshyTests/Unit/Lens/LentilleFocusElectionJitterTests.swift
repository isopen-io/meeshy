import XCTest
import MeeshyUI
@testable import Meeshy

/// **La liste tremble quand on défile un peu** (vidéo d'un porteur, iPhone,
/// 2026-10-16) : la magnification saute d'une rangée à sa voisine en boucle,
/// les deux états se superposent en fondu (« 5 13h » sur « 44 2d »).
///
/// **Cause prouvée — l'hystérésis n'a AUCUNE zone morte au pas réel de la
/// liste.** Les rangées Lentille font `LentilleMetrics.Row.height` (84) et la
/// `LazyVStack` de `sectionConversations` les espace de `MeeshySpacing.xsPlus`
/// (6) : leurs milieux sont à 90 pt l'un de l'autre (mesuré au simulateur :
/// 338 → 428 → 518…). Le miroir garde le courant tant qu'il est à
/// `focusBandHalfHeight` (45) du foyer : 2 × 45 = 90 = le pas. La bascule
/// avant et la bascule arrière tombent donc au MÊME point, et le moindre
/// va-et-vient d'un point autour de la frontière fait changer l'élu à chaque
/// tick. Près du haut de liste (la rampe de `LentilleFocusBand.centerY`), le
/// foyer descend quand le contenu monte : la distance rang-foyer varie deux
/// fois plus vite que le défilement, et la vidéo montre des oscillations de
/// l'ordre de 10 pt par image.
///
/// Ce qui n'est PAS la cause, mesuré au simulateur iOS 26.1 avec une sonde
/// temporaire : la magnification ne change ni le `midY` des rangées ni le
/// `contentSize` du défilement au moment d'une élection — la rangée garde sa
/// hauteur de layout (`frame(height: Row.height)`), son surplus déborde.
///
/// Ces témoins jouent la loi pure (`LentilleFocusElectionHost.elect`) sur la
/// géométrie de la liste : aucun rendu, aucune horloge.
///
/// **Nommage** — aucun jeton de `FINAL_PHASE_CLASS_PATTERN` : phase 1.
final class LentilleFocusElectionJitterTests: XCTestCase {

    // MARK: - Géométrie de la liste

    /// Le pas RÉEL : hauteur de rangée + espacement de la `LazyVStack`.
    private static var pitch: CGFloat {
        LentilleMetrics.Row.height + MeeshySpacing.xsPlus
    }

    /// Région visible d'un iPhone 6,9 po (874 pt) sous l'en-tête.
    private static let viewportTop: CGFloat = 120
    private static let viewportBottom: CGFloat = 874

    /// Vingt rangées, la première 200 pt sous le haut de la région visible au
    /// repos (rail, filtres, en-tête de section).
    private static let ids = (0..<20).map { "r\($0)" }

    /// Candidats tels que `lentilleFocusCandidate` les mesure : `midY` global
    /// = position dans le contenu − distance défilée.
    private static func candidates(offsetFromTop: CGFloat) -> [FocalFocusCurve.RowCandidate] {
        ids.enumerated().map { index, id in
            FocalFocusCurve.RowCandidate(
                id: id,
                midY: viewportTop + 200 + CGFloat(index) * pitch + pitch / 2 - offsetFromTop
            )
        }
    }

    private static func elect(offsetFromTop: CGFloat, current: String?) -> String? {
        LentilleFocusElectionHost.elect(
            candidates: candidates(offsetFromTop: offsetFromTop),
            viewportTop: viewportTop,
            viewportBottom: viewportBottom,
            offsetFromTop: offsetFromTop,
            currentId: current
        )
    }

    /// Déroule un défilement point par point et rend la suite des élus.
    private static func run(_ offsets: [CGFloat], from start: String?) -> [String?] {
        var current = start
        return offsets.map { offset in
            current = elect(offsetFromTop: offset, current: current)
            return current
        }
    }

    private static func changes(_ sequence: [String?]) -> Int {
        zip(sequence, sequence.dropFirst()).filter { $0 != $1 }.count
    }

    /// Premier offset où l'élu change en descendant lentement depuis `from`.
    private static func firstSwitchOffset(from start: CGFloat, step: CGFloat = 0.25) -> (offset: CGFloat, before: String?) {
        var current = elect(offsetFromTop: start, current: nil)
        var offset = start
        while offset < start + 4 * pitch {
            offset += step
            let next = elect(offsetFromTop: offset, current: current)
            if next != current { return (offset, current) }
            current = next
        }
        XCTFail("Aucune bascule sur quatre rangées de défilement — l'élection est gelée.")
        return (offset, current)
    }

    // MARK: - Le pas mesuré est bien celui de la liste

    /// Le pas joué ici doit être celui que la liste rend : si l'espacement de
    /// la `LazyVStack` des rangées change, ces témoins doivent changer avec.
    func test_listSpacing_isTheOneThesePitchesAssume() throws {
        // L'UNITÉ de la liste : la pile des rangées d'une section vit dans `+SectionRows`.
        let source = try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationListView.swift")
        XCTAssertTrue(
            source.contains("LazyVStack(spacing: MeeshySpacing.xsPlus)"),
            "Les rangées de section sont espacées de `MeeshySpacing.xsPlus` : c'est le pas " +
            "(Row.height + xsPlus) que ces témoins de stabilité supposent."
        )
    }

    // MARK: - 1. Un va-et-vient d'un point à la frontière ne fait pas trembler

    /// Hors rampe (liste défilée loin du haut) : le pouce immobile qui tremble
    /// d'un point autour de la frontière entre deux rangées. Aujourd'hui l'élu
    /// change à CHAQUE tick — la zone morte de l'hystérésis est nulle.
    func test_onePointJitterAtTheBoundary_doesNotFlipTheElectedRow_farFromTheTop() {
        let (boundary, before) = Self.firstSwitchOffset(from: 420)
        let jitter = (0..<24).map { boundary + ($0.isMultiple(of: 2) ? -1 : 1) }
        let sequence = Self.run(jitter, from: before)

        XCTAssertLessThanOrEqual(
            Self.changes(sequence), 1,
            "Un tremblement de ±1 pt autour de la frontière a changé l'élu " +
            "\(Self.changes(sequence)) fois en 24 ticks : chaque changement relance le fondu " +
            "de la magnification entre deux rangées. Pas \(Self.pitch) pt, hystérésis " +
            "\(FocalFocusCurve.focusBandHalfHeight) pt : 2 × hystérésis ≤ pas, aucune zone morte."
        )
    }

    /// Dans la RAMPE du haut de liste (là où la vidéo a été prise : en-tête
    /// replié, ÉPINGLES collé), avec l'amplitude mesurée sur la vidéo — des
    /// allers-retours d'environ 10 pt d'une image à l'autre.
    func test_videoAmplitudeJitter_inTheTopRamp_doesNotFlipTheElectedRow() {
        let (boundary, before) = Self.firstSwitchOffset(from: 60)
        let travel = (Self.viewportBottom - Self.viewportTop) / 2
        XCTAssertLessThan(boundary, travel, "Le témoin doit se jouer DANS la rampe.")

        // Écarts relevés image par image sur la vidéo (pt), recentrés.
        let measured: [CGFloat] = [-3, -5, 0, 0, 4, -4, -5, 4, 0, 4, -3, -5, 0, -5, -5, 0, -3, 3, -4, 4, -3, -5]
        let sequence = Self.run(measured.map { boundary + $0 }, from: before)

        XCTAssertLessThanOrEqual(
            Self.changes(sequence), 1,
            "Dans la rampe, la distance rang-foyer varie deux fois plus vite que le " +
            "défilement : les allers-retours de la vidéo ont changé l'élu " +
            "\(Self.changes(sequence)) fois — c'est la magnification qui saute d'une rangée " +
            "à sa voisine, en boucle."
        )
    }

    // MARK: - 2. Non-vacuité : un vrai défilement déplace toujours l'élu

    /// Un défilement monotone de plusieurs rangées doit élire chaque rangée à
    /// son tour, sans en sauter ni revenir en arrière.
    func test_aSteadyScroll_stillElectsEachRowInTurn() {
        let offsets = stride(from: CGFloat(420), through: 420 + 5 * Self.pitch, by: 2).map { $0 }
        let sequence = Self.run(offsets, from: nil).compactMap { $0 }
        var distinct: [String] = []
        for id in sequence where distinct.last != id { distinct.append(id) }

        XCTAssertGreaterThanOrEqual(distinct.count, 5, "Un défilement de cinq rangées doit déplacer l'élu : \(distinct)")
        XCTAssertEqual(Set(distinct).count, distinct.count, "L'élu n'est jamais revenu en arrière : \(distinct)")
        let order = distinct.compactMap { Self.ids.firstIndex(of: $0) }
        XCTAssertEqual(order, order.sorted(), "Les rangées sont élues dans l'ordre du défilement : \(distinct)")
    }

    /// La zone morte ne doit pas faire traîner la magnification : l'élu cède
    /// avant que sa voisine ne soit plus proche du foyer que lui d'une
    /// demi-rangée.
    func test_theElectedRow_neverLagsMoreThanHalfARowBehindTheNearest() {
        var current: String? = nil
        for offset in stride(from: CGFloat(420), through: 420 + 5 * Self.pitch, by: 1) {
            current = Self.elect(offsetFromTop: offset, current: current)
            let candidates = Self.candidates(offsetFromTop: offset)
            let focusY = LentilleFocusBand.centerY(
                viewportTop: Self.viewportTop, viewportBottom: Self.viewportBottom, offsetFromTop: offset
            )
            let distances = Dictionary(uniqueKeysWithValues: candidates.map { ($0.id, abs($0.midY - focusY)) })
            let nearest = distances.values.min() ?? 0
            let elected = current.flatMap { distances[$0] } ?? .infinity
            XCTAssertLessThanOrEqual(
                elected - nearest, LentilleMetrics.Row.height / 2,
                "À \(offset) pt, l'élu est \(elected - nearest) pt plus loin du foyer que la rangée " +
                "la plus proche : la magnification traîne."
            )
        }
    }
}
