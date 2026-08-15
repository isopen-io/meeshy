// apps/ios/MeeshyTests/Unit/Focal/FocalHostInsetCompositionTests.swift

import XCTest
import GRDB
import UIKit
@testable import Meeshy
@testable import MeeshySDK

/// F-085 (WS-6) — composition `topInset + headInset` (§4.5), sur le VRAI
/// `MessageListViewController` monté dans une fenêtre (même harnais que
/// `MessageListViewControllerTests`, F-085 le réutilise plutôt que d'en
/// inventer un second).
///
/// **Ce que cette suite NE reprouve PAS** : la FORMULE de `headInset` est
/// déjà couverte par `FocalScrollPassGeometryTests` (F-084, sur le type pur
/// `FocalPerspectiveGeometry`). Ici, on prouve le CÂBLAGE hôte : la
/// composition avec `topInset`, la garde `readingMode.usesPerspective &&
/// hasReachedOldest`, l'idempotence sous appels répétés, et l'interaction
/// avec `applyBottomInset` (§4.5 : « vérifie l'interaction avec
/// applyTopInsetToViews existant »).
@MainActor
final class FocalHostInsetCompositionTests: XCTestCase {

    // MARK: - Helpers

    private func makeEmptyStore() throws -> MessageStore {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        return MessageStore(conversationId: "c1", persistence: persistence)
    }

    private func makeSUT(store: MessageStore) -> MessageListViewController {
        MessageListViewController(
            store: store,
            currentUserId: "user_me",
            accentColor: "#6366F1",
            isDirect: false,
            isDark: false,
            router: Router(),
            storyViewModel: StoryViewModel(),
            statusViewModel: StatusViewModel(),
            conversationListViewModel: ConversationListViewModel()
        )
    }

    /// Monte le VC dans une vraie fenêtre — sans cela `viewDidLoad` (et donc
    /// `configureCollectionView`) ne s'exécute jamais, et `focalCollectionViewForTesting`
    /// reste `nil`.
    private func mount(_ vc: MessageListViewController) {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()
    }

    // MARK: - Flag off (défaut `.bubbles`) ⇒ headInset == 0, bit-à-bit identique

    /// Contrat §WS-6, critère « Flag off » : `readingMode == .bubbleLegacy`
    /// ⇒ `headInset == 0`. Ici avec le VRAI défaut du contrôleur (`.bubbles`,
    /// jamais touché) — aucune mutation de `readingMode` dans ce test.
    func test_headInset_isZero_byDefault_readingModeNeverTouched() throws {
        let vc = makeSUT(store: try makeEmptyStore())
        mount(vc)
        vc.applyTopInset(20)

        XCTAssertEqual(
            vc.focalCollectionViewForTesting?.contentInset.bottom, 20,
            "readingMode par défaut (.bubbles) ⇒ contentInset.bottom == topInset SEUL — headInset doit être 0 (contrat §WS-6 « Flag off » : bit-à-bit identique à aujourd'hui)."
        )
    }

    // MARK: - `.focal` + `hasReachedOldest` ⇒ headInset > 0

    func test_headInset_isPositive_whenFocalAndHasReachedOldest() throws {
        let vc = makeSUT(store: try makeEmptyStore())
        mount(vc)
        vc.readingMode = .focal
        vc.hasReachedOldest = true
        vc.applyTopInset(0)

        let bottom = try XCTUnwrap(vc.focalCollectionViewForTesting?.contentInset.bottom)
        XCTAssertGreaterThan(
            bottom, 0,
            "readingMode == .focal ET hasReachedOldest == true doit produire headInset > 0 (contrat §WS-6 : « Le tout premier message atteint la bande de focus et se lit plein cadre »)."
        )
    }

    /// `hasReachedOldest == false` (page pas encore atteinte) : même en
    /// `.focal`, `headInset` reste 0 — l'inset n'anticipe jamais une page non
    /// chargée.
    func test_headInset_isZero_whenFocalButNotYetReachedOldest() throws {
        let vc = makeSUT(store: try makeEmptyStore())
        mount(vc)
        vc.readingMode = .focal
        vc.hasReachedOldest = false
        vc.applyTopInset(30)

        XCTAssertEqual(
            vc.focalCollectionViewForTesting?.contentInset.bottom, 30,
            "hasReachedOldest == false ⇒ headInset == 0, même en .focal — l'inset ne doit jamais anticiper une page non chargée (§4.5)."
        )
    }

    /// `.script` (rangée plate, zéro perspective) : `usesPerspective ==
    /// false` ⇒ `headInset == 0`, même `hasReachedOldest == true`. L'inset de
    /// tête n'existe QU'en perspective — Script est plat par construction.
    func test_headInset_isZero_inScriptMode_evenWhenHasReachedOldest() throws {
        let vc = makeSUT(store: try makeEmptyStore())
        mount(vc)
        vc.readingMode = .script
        vc.hasReachedOldest = true
        vc.applyTopInset(15)

        XCTAssertEqual(
            vc.focalCollectionViewForTesting?.contentInset.bottom, 15,
            "readingMode == .script ⇒ headInset == 0 (Script est plat par construction, WS-4 : « même rangée, densité uniforme, zéro perspective »)."
        )
    }

    // MARK: - Idempotence sous appels répétés

    func test_applyTopInset_isIdempotent_underRepeatedCalls() throws {
        let vc = makeSUT(store: try makeEmptyStore())
        mount(vc)
        vc.readingMode = .focal
        vc.hasReachedOldest = true
        vc.applyTopInset(10)
        let first = vc.focalCollectionViewForTesting?.contentInset.bottom

        vc.applyTopInset(10)
        vc.applyTopInset(10)
        let third = vc.focalCollectionViewForTesting?.contentInset.bottom

        XCTAssertEqual(
            first, third,
            "trois appels consécutifs à applyTopInset(10) doivent composer la MÊME valeur — le pass est idempotent (§4.2/§4.5), rejouer la composition ne doit jamais dériver."
        )
    }

    // MARK: - Interaction `applyBottomInset` ↔ `applyTopInsetToViews` (§4.5)

    /// `headInset` dépend de `contentInset.top` (le `bottomClearance` de
    /// `focusY`, §4.3) : un changement de composeur/clavier DOIT recomposer
    /// `headInset` — sans quoi le HAUT visuel resterait calculé contre un
    /// ANCIEN bas visuel (contrat §WS-6 : « vérifie l'interaction avec
    /// applyTopInsetToViews existant »).
    func test_applyBottomInset_recomputesHeadInset_whenComposerHeightChanges() throws {
        let vc = makeSUT(store: try makeEmptyStore())
        mount(vc)
        vc.readingMode = .focal
        vc.hasReachedOldest = true
        vc.applyBottomInset(0)
        vc.applyTopInset(0)
        let beforeKeyboard = try XCTUnwrap(vc.focalCollectionViewForTesting?.contentInset.bottom)

        // Le clavier s'ouvre : le composeur grandit, `contentInset.top`
        // (bas visuel) augmente — la bande de focus doit MONTER en
        // conséquence (§4.3 : « la formule retenue … fait MONTER la bande
        // avec le clavier »), donc `headInset` doit varier.
        vc.applyBottomInset(400)
        let afterKeyboard = try XCTUnwrap(vc.focalCollectionViewForTesting?.contentInset.bottom)

        XCTAssertNotEqual(
            beforeKeyboard, afterKeyboard,
            "applyBottomInset (composeur/clavier) doit recomposer headInset via applyTopInsetToViews — sinon la bande de focus reste calée sur un ancien bas visuel (§4.5)."
        )
    }

    /// `contentInset.bottom` n'a qu'un écrivain — `applyBottomInset` ne doit
    /// jamais poser une valeur INCOHÉRENTE avec ce que `applyTopInsetToViews`
    /// aurait calculé seule (pas de désynchronisation entre les deux sites).
    func test_applyBottomInset_neverDesyncsFromApplyTopInsetToViews() throws {
        let vc = makeSUT(store: try makeEmptyStore())
        mount(vc)
        vc.readingMode = .focal
        vc.hasReachedOldest = true
        vc.applyTopInset(5)
        vc.applyBottomInset(120)
        let viaBottomInset = try XCTUnwrap(vc.focalCollectionViewForTesting?.contentInset.bottom)

        // Rejouer applyTopInset EXPLICITEMENT à ce point doit reproduire
        // EXACTEMENT la même valeur — la composition ne dépend que de l'état
        // courant (topInset/readingMode/hasReachedOldest/contentInset.top),
        // jamais de l'ORDRE des deux appels.
        vc.applyTopInset(5)
        let viaExplicitReapply = try XCTUnwrap(vc.focalCollectionViewForTesting?.contentInset.bottom)

        XCTAssertEqual(
            viaBottomInset, viaExplicitReapply,
            "applyBottomInset doit laisser contentInset.bottom dans le MÊME état qu'un appel explicite de applyTopInsetToViews — écrivain unique, aucune dérive possible entre les deux sites d'appel (§4.5)."
        )
    }

    // MARK: - Reduce Motion (§4.9) : le focus ET la carte survivent

    /// `isEnabled == false` (Reduce Motion) doit CONSERVER l'élection — la
    /// surbrillance seule subsiste (§4.9). Vérifié ici via le `Rendering`
    /// exposé par le pass : `.focal` + reduce motion IN-APP forcé ⇒ `.flat`,
    /// jamais `.off` (qui perdrait la carte).
    func test_focalPass_rendering_isFlatNotOff_whenFocalWithForcedReduceMotion() throws {
        let vc = makeSUT(store: try makeEmptyStore())
        mount(vc)
        vc.readingMode = .focal
        vc.isReduceMotionEnabled = true

        XCTAssertEqual(
            vc.focalPass.rendering, .flat,
            "readingMode == .focal + Reduce Motion forcé (in-app) doit produire Rendering.flat (échelle 1, alpha au plafond, élection CONSERVÉE) — jamais .off, qui perdrait la carte de focus (§4.9)."
        )
    }

    func test_focalPass_rendering_isOff_whenBubbles() throws {
        let vc = makeSUT(store: try makeEmptyStore())
        mount(vc)

        XCTAssertEqual(
            vc.focalPass.rendering, .off,
            "readingMode par défaut (.bubbles) doit laisser focalPass.rendering à .off — jamais touché (garde « flag off ⇒ zéro appel »)."
        )
    }
}
