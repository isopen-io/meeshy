import XCTest
@testable import MeeshyUI
import MeeshySDK

/// **Le muet reste LOCAL à sa surface — le couper dans le viewer ne coupe rien
/// dans le fil (vue `2f`, #4084).**
///
/// `.storyComposerMuteCanvas` / `.storyComposerUnmuteCanvas` sont postées
/// `object: nil` : **TOUS** les `StoryCanvasUIView` montés les reçoivent, y
/// compris les cartes de fil restées vivantes derrière un `fullScreenCover`.
/// Relever le muet au rail du viewer story coupait donc aussi celui du fil.
///
/// Le verrou existait déjà — `ScenePlayerConfig(mode: .card).locksMute == true`,
/// éprouvé par `ScenePlayerReaderContractTests` — et il était **contournable** :
/// il vivait sur le PROP, et n'atteignait le canvas qu'à la passe de rendu
/// suivante. Entre les deux, la diffusion gagnait.
///
/// > **Un champ de service qui DÉCLARE une restriction ne la fait pas
/// > respecter.** La question à poser à une garde n'est pas « est-elle posée ? »
/// > mais « le site qui MUTE la lit-il ? ».
///
/// Les témoins interrogent donc l'EFFET — la valeur après la notification — et
/// jamais le prop, qui était déjà juste quand le défaut était là.
@MainActor
final class StoryCanvasMuteLockTests: XCTestCase {

    private func canvas(locked: Bool, muted: Bool) -> StoryCanvasUIView {
        // `.play` : c'est le mode des surfaces de LECTURE, celles que la
        // notification diffusée atteint indûment. En `.edit` la question ne se
        // pose pas — l'atelier est la surface qui POSTE.
        let vue = StoryCanvasUIView(slide: StorySlide(), mode: .play)
        vue.setReaderContext(StoryReaderContext(mute: muted, locksMute: locked))
        return vue
    }

    // MARK: - Une surface verrouillée ne bouge pas

    func test_uneCarteVerrouilleeMuette_resteMuette_quandLeViewerReleveLeSon() {
        let carte = canvas(locked: true, muted: true)
        XCTAssertTrue(carte.isAudioMuted)

        NotificationCenter.default.post(name: .storyComposerUnmuteCanvas, object: nil)

        XCTAssertTrue(carte.isAudioMuted,
                      "relever le muet au rail du viewer ne doit rien couper dans le fil : "
                      + "la notification est diffusée, la carte est verrouillée")
    }

    /// La jumelle, et il faut les DEUX : un canvas verrouillé muet qu'on
    /// laisserait se faire muter resterait cohérent par accident, jusqu'au jour
    /// où le verrou servira une surface verrouillée SONORE.
    func test_uneSurfaceVerrouilleeSonore_resteSonore_quandLeComposerCoupeLeSon() {
        let surface = canvas(locked: true, muted: false)
        XCTAssertFalse(surface.isAudioMuted)

        NotificationCenter.default.post(name: .storyComposerMuteCanvas, object: nil)

        XCTAssertFalse(surface.isAudioMuted)
    }

    // MARK: - Le fusible : une surface NON verrouillée obéit toujours

    /// Sans lui, un verrou posé partout passerait les deux témoins ci-dessus en
    /// supprimant la fonction qu'ils protègent — le composer ne pourrait plus
    /// couper son propre son.
    func test_uneSurfaceNonVerrouillee_obeitEncoreALaDiffusion() {
        let atelier = canvas(locked: false, muted: false)

        NotificationCenter.default.post(name: .storyComposerMuteCanvas, object: nil)
        XCTAssertTrue(atelier.isAudioMuted, "le composer doit encore pouvoir couper son son")

        NotificationCenter.default.post(name: .storyComposerUnmuteCanvas, object: nil)
        XCTAssertFalse(atelier.isAudioMuted, "et le relever")
    }

    /// Le verrou vient du CONTEXTE, jamais d'un défaut du type : un canvas monté
    /// sans contexte n'est pas verrouillé, sinon l'atelier naîtrait sourd.
    func test_leVerrouEstFERME_parDefaut_seulementQuandLeContexteLeDit() {
        XCTAssertFalse(StoryCanvasUIView(slide: StorySlide(), mode: .play).muteIsLocked)
        XCTAssertTrue(canvas(locked: true, muted: true).muteIsLocked)
    }
}
