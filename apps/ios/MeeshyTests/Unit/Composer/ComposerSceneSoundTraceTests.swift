import XCTest
@testable import Meeshy
@testable import MeeshySDK
import MeeshyUI

/// **Un son de fond posé sur une scène doit laisser une TRACE** (#4918).
///
/// > Directive porteur 2026-09-02 : « Lorsqu'on ajoute un son de fond à un
/// > slide de story, on ne voit pas où le son se trouve. »
///
/// ## Ce que ces témoins gardent, et ce qu'ils ne gardent PAS
///
/// Ils gardent la DÉCISION — la trace est-elle servie, et pour quel son. Ils ne
/// gardent pas son apparence : la capsule est `ComposerAvatarSoundBadge`, déjà
/// livrée et déjà éprouvée pour la surface document (#4657, #4668, #4669).
/// **C'est le point du lot** — il ne manquait ni composant, ni loi, ni
/// résolveur, seulement le câblage d'une surface sur l'autre.
///
/// Le témoin qui compte est donc celui de l'EXCLUSION : sans lui, « servir la
/// trace » et « la servir toujours » rendent le même verdict sur le cas
/// nominal, et la marche du bas se met à pousser la scène dès qu'un outil est
/// ouvert.
final class ComposerSceneSoundTraceTests: XCTestCase {

    private func fond(id: String = "bg-1") -> StoryAudioPlayerObject {
        var son = StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                         x: 0.5, y: 0.5, volume: 1, waveformSamples: [])
        son.id = id
        son.isBackground = true
        son.duration = 12
        return son
    }

    // MARK: - Le cas nominal — il garde le service, il ne prouve pas la loi

    func test_unFondPose_laisseUneTraceSurLaScene() {
        let son = fond()
        XCTAssertEqual(
            ComposerSceneSoundTrace.served(background: son, toolIsOpen: false)?.id,
            "bg-1",
            "critère 1 de #4918 : l'auteur doit VOIR qu'un fond est là sans ouvrir de panneau")
    }

    func test_sansFond_laSceneNaRienAPeindre() {
        XCTAssertNil(ComposerSceneSoundTrace.served(background: nil, toolIsOpen: false))
    }

    // MARK: - Le témoin qui porte la loi

    /// **Un outil ouvert prend la place, comme pour la bande et la rangée de
    /// jetons.**
    ///
    /// La marche du bas de `ComposerSceneSurface` descend les niveaux du modèle
    /// — l'objet, la scène, la slide, la publication — et sa règle constante est
    /// qu'un outil ouvert occupe cette zone seul. Une trace qui s'y ajouterait
    /// ferait remonter la scène sous le doigt pendant qu'on règle autre chose.
    ///
    /// Et le critère 1 n'en souffre pas : il exige de voir le fond **sans
    /// ouvrir de panneau**. Quand un panneau est ouvert, l'exigence ne porte
    /// plus.
    func test_unOutilOuvert_prendLaPlaceDeLaTrace() {
        XCTAssertNil(
            ComposerSceneSoundTrace.served(background: fond(), toolIsOpen: true),
            "la zone basse appartient à l'outil ouvert — deux occupants la feraient enfler")
    }

    // MARK: - Critère 4 : le fond LEGACY

    /// **Un fond legacy affiche la MÊME trace** (critère 4 de #4918).
    ///
    /// `resolvedBackgroundAudio` le SYNTHÉTISE depuis `backgroundAudioId` sous
    /// l'identifiant `legacy-bg-audio` : il n'existe dans aucun tableau
    /// d'objets. Une loi qui aurait cherché son objet — pour lire sa position,
    /// son volume ou son rang — l'aurait écarté en silence, et la seule forme
    /// de fond qu'une reprise de brouillon produit serait restée invisible.
    ///
    /// La trace ne demande donc RIEN d'autre que le son servi.
    func test_unFondLegacySynthetise_laisseLaMemeTrace() {
        let legacy = fond(id: "legacy-bg-audio")
        XCTAssertEqual(
            ComposerSceneSoundTrace.served(background: legacy, toolIsOpen: false)?.id,
            "legacy-bg-audio",
            "critère 4 : la forme qu'une reprise de brouillon produit doit se voir comme les autres")
    }

    // MARK: - Critère 3 : la trace n'est pas un objet POSÉ

    /// **Elle ne devient pas une puce POSÉE sur le canvas** — et c'est
    /// structurel, pas une précaution.
    ///
    /// `AudioForegroundReaderOverlay.visibleAudios` écarte le fond à la SOURCE, avec sa
    /// raison écrite : « le bg n'a pas de chip visuel — il joue en boucle sur
    /// toute la slide ». Servir la trace dans le couloir ne touche pas cette
    /// garde : le canvas continue de ne rien peindre pour ce son, et la trace
    /// reste le seul endroit qui le dit.
    ///
    /// > Ce témoin garde l'INTERDIT du critère 3. Il tomberait le jour où
    /// > quelqu'un « corrigerait » l'exclusion en croyant réparer #4918 — la
    /// > solution (3) que l'issue déconseille explicitement.
    @MainActor
    func test_laTrace_neFabriquePasDePuceSurLeCanvas() {
        XCTAssertTrue(
            AudioForegroundReaderOverlay.visibleAudios(in: [fond()], elapsed: 1, slideDuration: 15).isEmpty,
            "critère 3 : un fond n'a pas de puce — la trace vit dans le couloir, jamais sur la scène")
    }
}
