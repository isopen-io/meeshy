import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// #4840 — **la fenêtre temporelle d'une pastille de lieu est ATTEIGNABLE.**
///
/// Le lot #4591 a donné cette fenêtre au modèle (`startTime` / `duration` /
/// `fadeIn` / `fadeOut`) et sa barre à la timeline (`Plan2DLayout.placeTracks`),
/// en réparant six sites. **Aucun des six n'était l'ÉDITION**, et la note de
/// livraison promettait pourtant à l'auteur « quatre champs comme ses quatre
/// sœurs ». Le trou ne se voyait pas : sans chemin pour poser une fenêtre,
/// `startTime` valait toujours `nil`, donc la barre rendait son FANTÔME —
/// jamais un contrôle qui ment, une capacité inatteignable.
///
/// Les témoins ci-dessous s'écrivent sur le GESTE, pas sur la présence du cas :
/// `clipKind(forId:)` rendait `nil` pour un lieu, et `applyWindow` sortait sur
/// son `guard`. Un témoin qui ne ferait que citer `TimelineClipKind.place`
/// prouverait qu'une ligne existe, pas qu'un doigt l'atteint.
@MainActor
final class TimelineViewModelPlaceWindowTests: XCTestCase {

    private func makeSUT(start: Double? = nil,
                         duration: Double? = nil) async -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.1))
        let lieu = StoryLocationObject(id: "pl-1",
                                       place: SharedPlace(latitude: 20.20,
                                                          longitude: 1.01,
                                                          name: "Tessalit"),
                                       startTime: start,
                                       duration: duration)
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: 10,
                                              locationObjects: [lieu]),
                     mediaURLs: [:], images: [:])
        await vm.awaitConfigured()
        return vm
    }

    private func window(_ vm: TimelineViewModel) -> (start: Double?, duration: Double?) {
        let lieu = vm.project.locationObjects.first { $0.id == "pl-1" }
        return (lieu?.startTime, lieu?.duration)
    }

    // MARK: - La famille est RECONNUE

    /// La cascade de `clipKind(forId:)` s'arrêtait aux quatre familles et
    /// rendait `nil` — c'est ce `nil` que tous les gardes en aval lisaient.
    func test_aPlace_hasATimelineKind() async {
        let sut = await makeSUT()
        XCTAssertNotNil(sut.clipKind(forId: "pl-1"),
                        "Un lieu sans kind fait sortir applyWindow et beginClipDrag sur leur guard.")
    }

    /// Le nom du cas suit le vocabulaire CIBLE du modèle produit
    /// (`docs/product/meeshy-composer-modele.md` § 7) : le contrat nomme cet
    /// objet `place`, et `location` désigne, dans le même langage, le lieu de
    /// la PUBLICATION. Ajouter un cas est le seul moment où le nom cible est
    /// gratuit — le prendre ici évite un troisième site à renommer.
    func test_thatKind_isNamedAfterTheWireVocabulary() async {
        let sut = await makeSUT()
        // Écrit sur le `rawValue` : le témoin doit pouvoir TOMBER avant que le
        // cas existe, et `.place` ne compilerait pas.
        XCTAssertEqual(sut.clipKind(forId: "pl-1")?.rawValue, "place")
    }

    // MARK: - Le GESTE atteint la fenêtre

    func test_settingTheStart_movesThePlace_keepingItsDuration() async {
        let sut = await makeSUT(start: 2, duration: 4)
        sut.setClipStart(id: "pl-1", to: 3.5)
        let w = window(sut)
        XCTAssertEqual(w.start ?? -1, 3.5, accuracy: 0.001)
        XCTAssertEqual(w.duration ?? -1, 4, accuracy: 0.001,
                       "Régler le début déplace la pastille, il ne la rogne pas.")
    }

    func test_settingTheEnd_trimsThePlace_keepingItsStart() async {
        let sut = await makeSUT(start: 2, duration: 4)
        sut.setClipEnd(id: "pl-1", to: 9)
        let w = window(sut)
        XCTAssertEqual(w.start ?? -1, 2, accuracy: 0.001)
        XCTAssertEqual(w.duration ?? -1, 7, accuracy: 0.001)
    }

    func test_settingTheDuration_keepsTheStart() async {
        let sut = await makeSUT(start: 2, duration: 4)
        sut.setClipDuration(id: "pl-1", to: 1.5)
        let w = window(sut)
        XCTAssertEqual(w.start ?? -1, 2, accuracy: 0.001)
        XCTAssertEqual(w.duration ?? -1, 1.5, accuracy: 0.001)
    }

    /// Le glissement de la barre : `beginClipDrag` sortait sur
    /// `guard let original = clipStartTime(id:)`, donc aucune session ne
    /// démarrait — le host attache pourtant `onMove` génériquement par id.
    func test_draggingThePlaceBar_startsASession_andMovesIt() async {
        let sut = await makeSUT(start: 1, duration: 3)
        sut.beginClipDrag(clipId: "pl-1")
        XCTAssertNotNil(sut.selection.activeDrag,
                        "Sans session de glissement, la barre du lieu ne suit pas le doigt.")
        sut.dragClipMoved(rawTime: 4, snapCandidates: [],
                          geometry: TimelineGeometry(zoomScale: 1))
        sut.endClipDrag()
        XCTAssertEqual(window(sut).start ?? -1, 4, accuracy: 0.05)
    }

    // MARK: - L'édition s'ANNULE comme les autres

    func test_eachPlaceEdit_pushesExactlyOneUndoEntry() async {
        let sut = await makeSUT(start: 2, duration: 4)
        let avant = sut.commandHistoryDepth
        sut.setClipEnd(id: "pl-1", to: 9)
        XCTAssertEqual(sut.commandHistoryDepth, avant + 1)
        sut.undo()
        XCTAssertEqual(window(sut).duration ?? -1, 4, accuracy: 0.001,
                       "Annuler doit rendre la fenêtre d'avant, pas la laisser rognée.")
    }

    func test_aNoOpPlaceEdit_pushesNothing() async {
        let sut = await makeSUT(start: 2, duration: 4)
        let avant = sut.commandHistoryDepth
        sut.setClipStart(id: "pl-1", to: 2)
        XCTAssertEqual(sut.commandHistoryDepth, avant)
    }

    // MARK: - Ce que le lieu NE fait PAS, exactement comme son frère sticker

    /// `TimelineClipKind` déclare le sticker et le lieu de la même famille
    /// temporelle. Un lieu se pose et se retire depuis le CANVAS ; le proposer
    /// à la suppression depuis la timeline offrirait un geste inerte.
    func test_aPlace_isNotDeletableFromTheTimeline() async {
        let sut = await makeSUT(start: 2, duration: 4)
        sut.deleteClip(id: "pl-1")
        XCTAssertEqual(sut.project.locationObjects.count, 1,
                       "La timeline ne supprime pas un lieu — le canvas le fait.")
    }

    /// Une pastille SANS fenêtre garde son fantôme : rien ne fabrique un
    /// début à zéro au premier accès, sinon toute story déjà publiée verrait
    /// ses lieux acquérir une fenêtre qu'aucun auteur n'a posée.
    func test_aPlaceWithoutAWindow_keepsItsNilFields() async {
        let sut = await makeSUT()
        let w = window(sut)
        XCTAssertNil(w.start)
        XCTAssertNil(w.duration)
    }
}
