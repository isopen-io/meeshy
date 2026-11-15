import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **Les réglages d'échelle de la frise suivent la règle du pincement** (#14304) :
/// le champ « Taille » de l'inspecteur et le curseur d'une image clé grandissent
/// sans plafond et s'arrêtent quand le plus petit côté rendu vaut 5 px de la
/// scène de référence — `SceneObjectScalePolicy`, comme le geste.
@MainActor
final class TimelineScaleSettingTests: XCTestCase {

    private static let textId = "texte"
    private static let mediaId = "media"
    private static let keyframeId = "kf"

    private func makeText(scale: Double = 1) -> StoryTextObject {
        var texte = StoryTextObject(id: Self.textId, text: "Salut", scale: scale, fontSize: 72)
        texte.startTime = 0
        texte.duration = 5
        return texte
    }

    private func makeMedia(scale: Double = 1, keyframeScale: CGFloat = 1) -> StoryMediaObject {
        var media = StoryMediaObject(id: Self.mediaId, postMediaId: "pm", mediaType: "image",
                                     placement: "media", aspectRatio: 0.75, startTime: 0, duration: 5)
        media.scale = scale
        media.keyframes = [StoryKeyframe(id: Self.keyframeId, time: 1, x: 0.5, y: 0.5,
                                         scale: keyframeScale, opacity: 1, easing: .linear)]
        return media
    }

    private func makeViewModel(text: StoryTextObject? = nil, media: StoryMediaObject? = nil) -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(), commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.1))
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: 5,
                                              mediaObjects: media.map { [$0] } ?? [],
                                              audioPlayerObjects: [],
                                              textObjects: text.map { [$0] } ?? [],
                                              clipTransitions: []),
                     mediaURLs: [:], images: [:])
        return vm
    }

    private func textScale(_ vm: TimelineViewModel) -> Double {
        vm.project.textObjects.first { $0.id == Self.textId }?.scale ?? -1
    }

    private func keyframeScale(_ vm: TimelineViewModel) -> CGFloat {
        vm.project.mediaObjects.first?.keyframes?.first?.scale ?? -1
    }

    private func mediaUnitSide(_ media: StoryMediaObject) -> Double {
        SceneObjectUnitSide.designSide(of: .media(media))
    }

    // MARK: - Champ « Taille » de l'inspecteur

    func test_leChampTaille_naPlusDePlafond() {
        let vm = makeViewModel(text: makeText())
        vm.setClipTransform(id: Self.textId, field: .scale(25))
        XCTAssertEqual(textScale(vm), 25)
    }

    func test_leChampTaille_sArreteQuandUneLigneVautCinqPixels() {
        let vm = makeViewModel(text: makeText())
        vm.setClipTransform(id: Self.textId, field: .scale(0.001))
        XCTAssertEqual(textScale(vm), 5.0 / 72, accuracy: 1e-12)
    }

    func test_unPasMoinsSousZero_poseLePlancher() {
        let vm = makeViewModel(text: makeText(scale: 0.08))
        vm.setClipTransform(id: Self.textId, field: .scale(0.08 - 0.1))
        XCTAssertEqual(textScale(vm), 5.0 / 72, accuracy: 1e-12)
    }

    /// Une échelle pincée au-delà de l'ancien plafond 8 survit au réglage d'un
    /// AUTRE champ, et un pas « + » part d'elle au lieu de la ramener à 8.
    func test_uneEchellePinceeHorsDeLAnciennePlage_survitAuxReglages() {
        let vm = makeViewModel(text: makeText(scale: 20))
        vm.setClipTransform(id: Self.textId, field: .x(0.3))
        XCTAssertEqual(textScale(vm), 20)
        vm.setClipTransform(id: Self.textId, field: .scale(20 + 0.1))
        XCTAssertEqual(textScale(vm), 20.1, accuracy: 1e-12)
    }

    func test_unMediaPose_sArreteAuPlusPetitCoteDeSonCadre() {
        let media = makeMedia()
        let vm = makeViewModel(media: media)
        vm.setClipTransform(id: Self.mediaId, field: .scale(0))
        XCTAssertEqual(vm.project.mediaObjects.first?.scale ?? -1, 5 / mediaUnitSide(media), accuracy: 1e-12)
    }

    // MARK: - Curseur d'une image clé

    /// L'échelle d'une image clé MULTIPLIE celle de l'objet : son plancher est
    /// celui du côté rendu, objet ET image clé compris.
    func test_uneImageCle_sArreteQuandLeCoteRenduVautCinqPixels() {
        let media = makeMedia(scale: 2)
        let vm = makeViewModel(media: media)
        vm.moveKeyframe(clipId: Self.mediaId, keyframeId: Self.keyframeId, scale: 0.0001)
        XCTAssertEqual(Double(keyframeScale(vm)), 5 / (mediaUnitSide(media) * 2), accuracy: 1e-9)
    }

    func test_uneImageCle_naPasDePlafond() {
        let vm = makeViewModel(media: makeMedia())
        vm.moveKeyframe(clipId: Self.mediaId, keyframeId: Self.keyframeId, scale: 12)
        XCTAssertEqual(keyframeScale(vm), 12)
    }

    func test_laFicheDUneImageCle_porteSonPlancher() {
        let media = makeMedia(scale: 2)
        let vm = makeViewModel(media: media)
        vm.selection.select(Self.keyframeId)
        let fiche = TimelineInspectorHost.resolveKeyframeSnapshot(viewModel: vm)?.snapshot
        XCTAssertEqual(Double(fiche?.scaleFloor ?? -1), 5 / (mediaUnitSide(media) * 2), accuracy: 1e-9)
    }

    /// La plage du curseur contient TOUJOURS la valeur ouverte : une image clé
    /// à 10, ou sous le plancher, s'affiche telle quelle et n'est pas ramenée.
    func test_laPlageDuCurseur_contientLaValeurOuverte() {
        let haute = KeyframeInspector.scaleSliderRange(current: 10, floor: 0.03)
        XCTAssertTrue(haute.contains(10))
        XCTAssertEqual(haute.lowerBound, 0.03, accuracy: 1e-12)
        let basse = KeyframeInspector.scaleSliderRange(current: 0.01, floor: 0.03)
        XCTAssertTrue(basse.contains(0.01))
    }

    func test_laPlageDuCurseur_vaDuPlancherAQuatre() {
        let nominale = KeyframeInspector.scaleSliderRange(current: 1, floor: 0.03)
        XCTAssertEqual(nominale.lowerBound, 0.03, accuracy: 1e-12)
        XCTAssertEqual(nominale.upperBound, KeyframeInspector.scaleSliderCeiling)
    }

    /// Sans plancher prouvé, le curseur ne descend pas sous la valeur ouverte.
    func test_laPlageDuCurseurSansPlancher_partDeLaValeurOuverte() {
        let range = KeyframeInspector.scaleSliderRange(current: 0.5, floor: 0)
        XCTAssertEqual(range.lowerBound, 0.5)
        XCTAssertGreaterThan(range.upperBound, range.lowerBound)
    }

    func test_laPlageDuCurseur_neSEffondreJamais() {
        let range = KeyframeInspector.scaleSliderRange(current: 9, floor: 9)
        XCTAssertGreaterThan(range.upperBound, range.lowerBound)
        let illisible = KeyframeInspector.scaleSliderRange(current: .nan, floor: 0.03)
        XCTAssertGreaterThan(illisible.upperBound, illisible.lowerBound)
    }
}
