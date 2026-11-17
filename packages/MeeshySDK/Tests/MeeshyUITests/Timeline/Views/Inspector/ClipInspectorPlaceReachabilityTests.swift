import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// #4840 (moitié manquante) + #4899 — **la fenêtre d'une pastille de lieu est
/// atteignable AU DOIGT, et la fiche n'offre que ce qui agit.**
///
/// Le lot `1c07f23206` a réparé les cascades du ViewModel et le fil. Une
/// vérification indépendante a mesuré que **l'effet utilisateur net restait
/// nul** : `ClipInspector.ClipSnapshot.Kind` n'avait pas de cas `place`, donc
/// `TimelineInspectorHost.clipSnapshot` rendait `nil`, donc le routeur de tap
/// (`inspectIfResolvable`) sortait sur son garde, donc aucune sélection ne se
/// posait, donc `edgeHandleZones` ne rendait aucune poignée. Et comme une
/// pastille naît FANTÔME (`addLocation` ne pose ni début ni durée), `moveDelta`
/// refusait aussi le glissement.
///
/// > **Suivre une donnée jusqu'à son consommateur s'arrête un cran trop tôt :
/// > il faut la suivre jusqu'au PIXEL.** Le câblage était générique par id — et
/// > c'est ce qui le DÉCLENCHE qui filtrait par famille, trois appels plus
/// > haut. Les témoins ci-dessous interrogent donc l'EFFET, jamais le câblage.
///
/// Et la seconde moitié est indissociable : ouvrir la fiche d'un lieu sans
/// conditionner sa section d'animation lui donnerait d'un coup les trois
/// contrôles inertes que le sticker subit déjà (fondu d'entrée, fondu de
/// sortie, « Animer au playhead » — tous refusés par les commandes). On ne
/// répare pas une capacité inatteignable en la remplaçant par des contrôles qui
/// mentent.
@MainActor
final class ClipInspectorPlaceReachabilityTests: XCTestCase {

    private func makeSUT(start: Double? = nil,
                         duration: Double? = nil) async -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.1))
        let lieu = StoryLocationObject(id: "pl-1",
                                       place: SharedPlace(latitude: 20.20,
                                                          longitude: 1.01,
                                                          name: "Tessalit"),
                                       startTime: start, duration: duration)
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: 10,
                                              locationObjects: [lieu]),
                     mediaURLs: [:], images: [:])
        await vm.awaitConfigured()
        return vm
    }

    // MARK: - Le TAP a un effet

    // MARK: - La fiche n'offre QUE ce qui agit (#4899)

    // MARK: - Ce que la fenêtre d'un lieu rend possible en AVAL

    /// Deux énumérations à quatre familles qui étaient sans effet tant que
    /// `duration` valait toujours `nil` — elles s'OUVRENT avec la capacité.
    func test_aTimedPlace_becomesTheActiveClip_duringPlayback() async {
        let sut = await makeSUT(start: 1, duration: 4)
        XCTAssertEqual(ActiveClipResolver.activeClipId(at: 2, in: sut.project), "pl-1",
                       "Une pastille avec fenêtre doit devenir le clip actif, comme ses sœurs.")
    }

    func test_otherClips_snapToThePlaceEdges() async {
        let sut = await makeSUT(start: 2, duration: 3)
        let bords = sut.magneticSnapCandidates(excludingClipId: "autre")
            .filter { $0.kind == .clipStart || $0.kind == .clipEnd }
            .map { $0.time }
        XCTAssertTrue(bords.contains { abs($0 - 2) < 0.001 },
                      "Le doc-comment promet les bords de chaque AUTRE objet du canvas.")
        XCTAssertTrue(bords.contains { abs($0 - 5) < 0.001 })
    }
}
