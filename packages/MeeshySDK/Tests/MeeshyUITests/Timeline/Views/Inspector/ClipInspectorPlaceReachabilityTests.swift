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

    /// Le témoin de la chaîne entière, écrit sur son maillon le plus haut :
    /// c'est `inspectIfResolvable` que le plan appelle sur `onSelectTrack`.
    /// S'il ne pose rien, rien en aval ne peut se produire.
    func test_tappingAPlaceTrack_selectsIt_andOpensItsInspector() async {
        let sut = await makeSUT()
        TimelineInspectorHost.inspectIfResolvable(id: "pl-1", viewModel: sut)
        XCTAssertEqual(sut.selection.selectedClipId, "pl-1",
                       "Sans sélection, le plan ne rend aucune poignée de rognage.")
        XCTAssertEqual(sut.selection.inspectedClipId, "pl-1",
                       "Taper la piste d'un lieu doit ouvrir sa fiche, comme pour un sticker.")
    }

    /// La fiche existe, et elle porte la fenêtre — c'est le seul chemin par
    /// lequel une pastille peut acquérir sa PREMIÈRE fenêtre, puisqu'elle naît
    /// fantôme et que le glissement exige une barre déjà `.timed`.
    func test_thePlaceSnapshot_carriesItsWindow() async {
        let sut = await makeSUT(start: 2, duration: 4)
        let fiche = TimelineInspectorHost.clipSnapshot(id: "pl-1", viewModel: sut)
        let snapshot = try? XCTUnwrap(fiche)
        XCTAssertNotNil(snapshot, "Aucune fiche pour un lieu ⇒ ni stepper, ni champ saisi.")
        XCTAssertEqual(snapshot?.startTime ?? -1, 2, accuracy: 0.001)
        XCTAssertEqual(snapshot?.duration ?? -1, 4, accuracy: 0.001)
    }

    /// Une pastille NEUVE se déclare « suit la slide » : c'est l'état qui rend
    /// le bouton de retour au fantôme cohérent, et il distingue « pas encore de
    /// fenêtre » d'« une fenêtre qui commence à zéro ».
    func test_aFreshPlace_declaresItselfFollowingTheSlide() async {
        let sut = await makeSUT()
        let fiche = TimelineInspectorHost.clipSnapshot(id: "pl-1", viewModel: sut)
        XCTAssertEqual(fiche?.isFollowingSlide, true)
    }

    /// Le chemin COMPLET, du tap au modèle : c'est lui qui répond à la question
    /// que #4840 posait — « un geste peut-il écrire cette fenêtre ? ».
    func test_theFullPath_fromTapToModel_writesTheWindow() async {
        let sut = await makeSUT()
        TimelineInspectorHost.inspectIfResolvable(id: "pl-1", viewModel: sut)
        sut.setClipStart(id: "pl-1", to: 2)
        sut.setClipDuration(id: "pl-1", to: 3)
        let lieu = sut.project.locationObjects.first
        XCTAssertEqual(lieu?.startTime ?? -1, 2, accuracy: 0.001)
        XCTAssertEqual(lieu?.duration ?? -1, 3, accuracy: 0.001)
        XCTAssertEqual(TimelineInspectorHost.clipSnapshot(id: "pl-1", viewModel: sut)?.isFollowingSlide,
                       false, "Une fenêtre posée, la pastille ne suit plus la slide.")
    }

    // MARK: - La fiche n'offre QUE ce qui agit (#4899)

    /// Trois contrôles refusés par les commandes, montés sans condition pour
    /// les cinq familles. La fiche affichait même l'ÉTAT du fondu d'un sticker
    /// (`TimelineInspectorHost` le passait), donc la puce se cochait et le
    /// modèle ne bougeait pas.
    func test_theAnimationSection_isHidden_forKindsWhoseCommandsRefuseIt() {
        for kind in [ClipInspector.ClipSnapshot.Kind.sticker, .place] {
            XCTAssertFalse(
                ClipInspector.visibleSections(kind: kind, isBackground: false).contains(.animation),
                "\(kind) : ni fondu ni keyframe n'agit — la section ne doit pas s'afficher.")
        }
    }

    /// Et elle reste offerte là où elle agit : le retirer partout « réglerait »
    /// l'inertie en supprimant une vraie capacité.
    func test_theAnimationSection_staysVisible_whereItActs() {
        for kind in [ClipInspector.ClipSnapshot.Kind.video, .image, .text, .audio] {
            XCTAssertTrue(
                ClipInspector.visibleSections(kind: kind, isBackground: false).contains(.animation),
                "\(kind) accepte le fondu ET les keyframes — la section doit rester.")
        }
    }

    /// Les deux prédicats disent AUJOURD'HUI la même chose. Ils restent deux
    /// parce que ce sont deux QUESTIONS — la commande qui les tranche n'est pas
    /// la même (`SetClipPropertyCommand` d'un côté, `mutateKeyframes` de
    /// l'autre) — et parce qu'une famille future pourra répondre différemment.
    func test_fadeAndKeyframes_areAskedSeparately() {
        XCTAssertFalse(ClipInspector.supportsFade(kind: .place))
        XCTAssertFalse(ClipInspector.supportsKeyframes(kind: .place))
        XCTAssertTrue(ClipInspector.supportsFade(kind: .audio))
        XCTAssertTrue(ClipInspector.supportsKeyframes(kind: .audio))
    }

    /// Un lieu se retire depuis le CANVAS, se coupe nulle part, n'a ni son ni
    /// plan de fond — exactement le sticker, dont `TimelineClipKind` le déclare
    /// frère temporel.
    func test_aPlace_offersNoAffordanceItsCommandsRefuse() {
        XCTAssertFalse(ClipInspector.supportsDeletion(kind: .place))
        XCTAssertFalse(ClipInspector.supportsSplit(kind: .place))
        XCTAssertFalse(ClipInspector.hasAudioAffordances(kind: .place))
        XCTAssertFalse(ClipInspector.supportsBackgroundToggle(kind: .place))
        XCTAssertFalse(ClipInspector.supportsLoop(kind: .place, isBackground: true))
        XCTAssertFalse(ClipInspector.supportsTransform(kind: .place, isBackground: false))
    }

    /// Le lecteur d'écran nomme la famille : sans son cas, un lieu s'annonçait
    /// avec le libellé d'une autre.
    func test_aPlace_isAnnouncedAsItself() {
        let libelle = ClipInspector.accessibilityLabel(for: .place)
        XCTAssertFalse(libelle.isEmpty)
        XCTAssertNotEqual(libelle, ClipInspector.accessibilityLabel(for: .sticker))
    }

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
