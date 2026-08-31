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

    /// **L'UNITÉ du type, jamais son fichier.**
    ///
    /// Les invariants ci-dessous portent sur `MessageListViewController` —
    /// « son timer de suivi de lecture porte le tick de la pilule », « il n'en
    /// construit pas un troisième ». Une EXTRACTION les fait franchir une
    /// frontière que la loi ne connaît pas : sortir le cluster de suivi vers
    /// `MessageListViewController+SeenTracking.swift` (#3947) a fait tomber
    /// `startSeenTracking` d'un côté et laissé la garde de l'autre, qui
    /// rougissait en annonçant la disparition d'une méthode toujours là.
    ///
    /// La source lue est donc la CONCATÉNATION des fichiers du type. Ajouter
    /// une extension à cette liste est le geste attendu ; l'oublier fait
    /// rougir la garde, ce qui est exactement le bon sens de panne.
    private static let unitFiles = [
        "Meeshy/Features/Main/Views/MessageListViewController.swift",
        "Meeshy/Features/Main/Views/MessageListViewController+SeenTracking.swift",
    ]

    private func source() throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
        return try Self.unitFiles
            .map { try String(contentsOf: root.appendingPathComponent($0), encoding: .utf8) }
            .joined(separator: "\n")
    }

    private func strippedSource() throws -> String {
        AppSourceGuard.stripComments(try source())
    }

    // MARK: - Le SUPPORT a changé, la loi F-081 doit toujours atteindre l'œil

    /// **Recalibré — déplacé par `85cf1ec4` (« ressuscite la magnification du
    /// message élu et rend l'heure aux messages »), l'invariant est
    /// inchangé : la loi F-081 ne doit pas rester orpheline.**
    ///
    /// Ce commit a démonté la pilule flottante, inconditionnellement, et le
    /// motif est écrit : elle datait un POINT DE L'ÉCRAN (« Mercredi · 17:42 »
    /// figé en haut) pendant que le sticker de jour occupait déjà la bande
    /// au-dessus et que chaque rangée portait son heure — trois chromes
    /// temporels concurrents pour une seule question, « quand ce message-ci ? »,
    /// à laquelle seule la rangée répond.
    ///
    /// L'ancien témoin exigeait le MONTAGE, c'est-à-dire le support de la
    /// veille. Or ce que F-086bis avait arbitré n'était pas « il faut une
    /// pilule » : c'était « la loi F-081, livrée puis laissée sans aucun
    /// consommateur, doit atteindre le lecteur — et sans observateur neuf ».
    /// Cette exigence-là SURVIT au changement de support, et c'est elle que le
    /// témoin éprouve maintenant : l'état est toujours alimenté, et il est
    /// toujours LU — par `timestampReveal`, qui porte désormais l'information.
    /// Un démontage qui laisserait la loi orpheline (un état qu'on nourrit et
    /// que plus personne ne lit) fait tomber ce test, exactement comme
    /// l'absence de montage faisait tomber le précédent.
    ///
    /// Les gardes « aucun observateur neuf » (site 1 unique, zéro `Timer`
    /// supplémentaire) sont INTACTES plus bas : le changement de support ne
    /// les concerne pas.
    func test_scrollTimePillLaw_stillReachesTheReader_evenUnmounted() throws {
        let code = try strippedSource()

        // 1. Le démontage est INCONDITIONNEL — décision de `85cf1ec4`, gelée
        //    ici pour qu'un remontage accidentel se signale.
        XCTAssertTrue(
            code.contains("private func updateScrollTimePillMounting() {\n        teardownScrollTimePillOverlay()\n    }"),
            "`updateScrollTimePillMounting` doit se réduire au démontage INCONDITIONNEL — la pilule flottante n'est plus montée nulle part (`85cf1ec4`), et un contrôleur recyclé depuis un mode antérieur ne doit pas en garder une à l'écran."
        )

        // 2. Le monteur survit en CODE MORT (restauration en une ligne) : il ne
        //    doit avoir AUCUN site d'appel. C'est la forme la plus dure de
        //    « flag off ⇒ aucun UIHostingController enfant supplémentaire »
        //    que portait l'ancien témoin — plus dure, car elle vaut pour TOUS
        //    les modes et non pour `.bubbles` seul.
        let mounterOccurrences = code.components(separatedBy: "configureScrollTimePillOverlay()").count - 1
        XCTAssertEqual(
            mounterOccurrences, 1,
            "`configureScrollTimePillOverlay()` apparaît \(mounterOccurrences) fois — UNE seule attendue, sa DÉCLARATION. Toute occurrence supplémentaire est un site d'appel, donc un remontage de la pilule (`85cf1ec4` l'a retirée de tous les modes)."
        )

        // 3. La loi n'est pas orpheline — l'état est toujours alimenté…
        XCTAssertTrue(
            code.contains("scrollTimePillState.note(.scrolled(at:"),
            "`ScrollTimePillState` doit continuer de recevoir `.scrolled` — la loi F-081 reste la source de vérité du « quand », seul son SUPPORT a changé (`85cf1ec4`)."
        )
        XCTAssertTrue(
            code.contains("scrollTimePillState.note(.tick(at:"),
            "`ScrollTimePillState` doit continuer de recevoir `.tick` — sans quoi sa loi ne s'éteindrait jamais et le signal resterait figé."
        )

        // 4. … et il est LU. C'est ce couple alimenté/consommé qui interdit
        //    la « loi livrée que personne ne consomme » — le défaut même que
        //    l'arbitrage F-086bis avait fait corriger.
        XCTAssertTrue(
            code.contains("timestampReveal.note(.scrolled(at:"),
            "`timestampReveal` doit recevoir `.scrolled` — c'est lui qui porte désormais l'information de la pilule (l'heure, sur la rangée elle-même). Sans ce relais, la loi F-081 redeviendrait orpheline."
        )
        XCTAssertTrue(
            code.contains("timestampReveal.note(.tick(at:"),
            "`timestampReveal` doit recevoir `.tick` — même loi, même extinction : le relais consomme la loi ENTIÈRE, pas la moitié."
        )

        // 5. … par une VUE. Un relais qu'on alimente et qui n'est injecté nulle
        //    part serait un second orphelin remplaçant le premier : la garde
        //    tomberait dans le défaut qu'elle existe pour attraper. C'est le
        //    dernier maillon de « la loi atteint le lecteur », et le seul qui
        //    aille jusqu'à l'écran.
        XCTAssertTrue(
            code.contains(".environmentObject(timestampReveal)"),
            "`timestampReveal` doit être injecté dans la hiérarchie des rangées (`.environmentObject`) — sinon la loi F-081 serait simplement passée d'un orphelin à un autre, et l'arbitrage F-086bis resterait à refaire."
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
    /// DEUX constructions `Timer(` dans tout le TYPE — les DEUX préexistantes
    /// (`reconfigureDebounceTimer` dans l'hôte, `seenTimer` dans l'extension
    /// de suivi depuis #3947). Un TROISIÈME `Timer(` ferait échouer ce test,
    /// signalant qu'un observateur neuf a été introduit pour la pilule,
    /// contrairement à l'arbitrage.
    func test_noNewTimerIntroduced_forThePill() throws {
        let code = try strippedSource()
        let occurrences = code.components(separatedBy: "Timer(").count - 1
        XCTAssertEqual(
            occurrences, 2,
            "MessageListViewController (hôte + extensions) construit \(occurrences) `Timer(...)` — exactement DEUX sont attendus (le debounce de reconfigure, et le suivi de lecture RÉUTILISÉ par la pilule). Un troisième signalerait un observateur neuf pour la pilule, contraire à l'arbitrage F-086bis."
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
