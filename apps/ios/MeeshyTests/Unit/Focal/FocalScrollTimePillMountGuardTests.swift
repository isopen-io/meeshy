import XCTest
@testable import Meeshy

/// F-086bis (WS-2, arbitrage coordinateur) — `ScrollTimePillOverlay` (F-081,
/// GELÉ `Focal/Chrome/`) n'était montée nulle part : cette suite prouve le
/// montage dans l'hôte, SOUS DRAPEAU, piloté par le site 1 existant et par le
/// timer de suivi de lecture déjà en place — AUCUN observateur neuf. Même
/// patron que `FocalHostSourceGuardTests`/`FocalHostCallSiteMountGuardTests`
/// (F-085) : preuves par lecture de source, pas de toolchain Swift sous
/// Linux (R5).
final class FocalScrollTimePillMountGuardTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views/MessageListViewController.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func strippedSource() throws -> String {
        AppSourceGuard.stripComments(try source())
    }

    // MARK: - Montage effectif, SOUS DRAPEAU

    func test_scrollTimePillOverlay_isMounted() throws {
        let code = try strippedSource()
        XCTAssertTrue(
            code.contains("ScrollTimePillOverlay(state: scrollTimePillState)"),
            "MessageListViewController doit monter `ScrollTimePillOverlay(state: scrollTimePillState)` — F-081 livrait la vue, personne ne la montait (arbitrage F-086bis)."
        )
        XCTAssertTrue(
            code.contains("private func updateScrollTimePillMounting() {\n        if readingMode != .bubbles {"),
            "Le montage doit être gardé par `readingMode != .bubbles` — flag off ⇒ aucun UIHostingController enfant supplémentaire (contrat §WS-6)."
        )
        XCTAssertTrue(
            code.contains("teardownScrollTimePillOverlay()"),
            "Un retour à `.bubbles` doit DÉMONTER l'overlay — pas seulement le masquer."
        )
    }

    // MARK: - Site 1 RÉUTILISÉ, aucun observateur neuf (leçon 257, corollaire de portée)

    func test_scrollTimePillActivity_isNotedFromScrollViewDidScroll_site1() throws {
        let code = try strippedSource()
        guard let range = code.range(of: "func scrollViewDidScroll(_ scrollView: UIScrollView) {"),
              let endRange = code.range(
                of: "func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {",
                range: range.upperBound..<code.endIndex
              )
        else {
            XCTFail("Corps de scrollViewDidScroll introuvable.")
            return
        }
        let body = code[range.lowerBound..<endRange.lowerBound]
        XCTAssertTrue(
            body.contains("noteScrollTimePillActivity()"),
            "scrollViewDidScroll (site 1, §4.8) doit piloter la pilule — c'est le SEUL site de scroll autorisé pour cet événement (arbitrage F-086bis : « aucun observateur neuf »)."
        )
    }

    /// Corollaire de portée (leçon 257) : le `.scrolled` lui-même doit être
    /// gardé par `readingMode` — sinon la pilule s'activerait même drapeau
    /// OFF, defaisant « bit-à-bit identique ».
    func test_noteScrollTimePillActivity_isGuardedByReadingMode() throws {
        let code = try strippedSource()
        XCTAssertTrue(
            code.contains("private func noteScrollTimePillActivity() {\n        guard readingMode != .bubbles else { return }"),
            "noteScrollTimePillActivity doit garder `readingMode != .bubbles` en tête — sinon la pilule recevrait des événements même drapeau OFF."
        )
    }

    // MARK: - `.tick` RÉUTILISE le timer de suivi de lecture — AUCUN Timer neuf

    func test_scrollTimePillTick_reusesTheExistingSeenTrackingTimer() throws {
        let code = try strippedSource()
        guard let range = code.range(of: "func startSeenTracking() {"),
              let endRange = code.range(of: "func stopSeenTracking() {", range: range.upperBound..<code.endIndex)
        else {
            XCTFail("Corps de startSeenTracking introuvable.")
            return
        }
        let body = code[range.lowerBound..<endRange.lowerBound]
        XCTAssertTrue(
            body.contains("scrollTimePillState.note(.tick(at:"),
            "Le `.tick` de la pilule doit être émis DEPUIS le timer de suivi de lecture existant (`startSeenTracking`) — pas un timer dédié (arbitrage F-086bis : « aucun observateur neuf »)."
        )
    }

    /// Égalité de compte, pas seulement présence (leçon 257) : exactement
    /// DEUX constructions `Timer(` dans tout le fichier — les DEUX
    /// préexistantes (`reconfigureDebounceTimer`, `seenTimer`). Un TROISIÈME
    /// `Timer(` ferait échouer ce test, signalant qu'un observateur neuf a
    /// été introduit pour la pilule, contrairement à l'arbitrage.
    func test_noNewTimerIntroduced_forThePill() throws {
        let code = try strippedSource()
        let occurrences = code.components(separatedBy: "Timer(").count - 1
        XCTAssertEqual(
            occurrences, 2,
            "MessageListViewController.swift construit \(occurrences) `Timer(...)` — exactement DEUX sont attendus (le debounce de reconfigure, et le suivi de lecture RÉUTILISÉ par la pilule). Un troisième signalerait un observateur neuf pour la pilule, contraire à l'arbitrage F-086bis."
        )
    }

    // MARK: - Ancrage/cotes via FocalMetrics.Pill — jamais un littéral

    func test_pillAnchor_usesFocalMetricsPillTop_neverALiteral() throws {
        let code = try strippedSource()
        XCTAssertTrue(
            code.contains("constant: topInset + FocalMetrics.Pill.top"),
            "L'ancre verticale de la pilule doit venir de `FocalMetrics.Pill.top` (miroir du token `thread.pill.top`, 72) — jamais un littéral en dur (garde R15)."
        )
        XCTAssertTrue(
            code.contains("scrollTimePillTopConstraint?.constant = topInset + FocalMetrics.Pill.top"),
            "applyTopInsetToViews doit recomposer l'ancre de la pilule quand `topInset` change — même discipline que la pill sticky de jour."
        )
    }

    // MARK: - Reduce Motion (§4.9) : « pas d'animation de fondu »

    func test_pillOverlay_disablesAnimationUnderReduceMotion() throws {
        let code = try strippedSource()
        XCTAssertTrue(
            code.contains("transaction.disablesAnimations = true"),
            "Le montage de la pilule doit désactiver la transaction d'animation sous Reduce Motion — `ScrollTimePillOverlay` (gelé) anime en interne, la désactivation vient donc de l'hôte."
        )
        XCTAssertTrue(
            code.contains("MeeshyMotion.shouldReduce("),
            "La désactivation doit passer par la loi partagée `MeeshyMotion.shouldReduce(system:userForced:)` — les DEUX sources de Reduce Motion (§4.9), jamais la clé système seule."
        )
    }

    // MARK: - Le montage NE TOUCHE PAS aux fichiers gelés `Focal/Chrome/*`

    func test_scrollTimePillOverlayAndState_remainUntouched() throws {
        // Garde légère : si `ScrollTimePillOverlay`/`ScrollTimePillState`
        // avaient été modifiées pour ce lot, leurs propres gardes source
        // F-081 (`ScrollTimePillSourceGuardTests`) resteraient seules juges —
        // ce test-ci vérifie seulement que l'hôte ne redéclare PAS un type
        // concurrent (ex. une seconde `ScrollTimePillOverlay` locale), ce
        // qui indiquerait une édition détournée du fichier gelé.
        let code = try strippedSource()
        XCTAssertFalse(
            code.contains("struct ScrollTimePillOverlay"),
            "MessageListViewController.swift ne doit JAMAIS redéclarer ScrollTimePillOverlay — la vue vit dans Focal/Chrome/, gelée, réutilisée telle quelle."
        )
    }
}
