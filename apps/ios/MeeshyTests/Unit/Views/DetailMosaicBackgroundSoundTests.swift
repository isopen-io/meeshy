import XCTest
import MeeshySDK
@testable import Meeshy
@testable import MeeshyUI

/// **La fiche détail JOUE le son de fond — y compris quand le post a plusieurs
/// scènes** (directive porteur 2026-09-05, #5593).
///
/// ## La panne que ces témoins gardent
///
/// `StoryDetailPlaybackPolicy` écrit la règle du détail noir sur blanc :
///
/// > « Audio is ON by DEFAULT in detail (`isCanvasMuted` starts `false`) — the
/// > detail viewer matches the native story experience, unlike the muted feed. »
///
/// Depuis que le détail monte `PostSceneMosaic` pour un document à plusieurs
/// scènes (`4a3e13607b`), cette règle ne valait plus sur ce chemin : la
/// mosaïque montait son player en `mode: .card` EN DUR, et
/// `ScenePlayerConfig` fige `locksMute = mode == .card`. `hostMute` rendait
/// donc `true` INCONDITIONNELLEMENT — le son de fond ne se jouait jamais, et
/// le bouton muet de la barre d'actions n'atteignait aucun lecteur.
///
/// > **Un mode de player n'est pas une propriété de la vue : c'est une
/// > propriété de son HÔTE.** Enfoui dans la vue, il a suivi la mosaïque du
/// > fil jusqu'au détail, où il dit le contraire de ce que le détail veut.
///
/// ## Pourquoi le témoin lit le player, et non la source
///
/// Une garde de source prouve qu'une ligne EXISTE, jamais qu'elle S'EXÉCUTE.
/// Ces témoins montent la mosaïque et lisent le muet SERVI à l'hôte canvas —
/// la même lecture que `ScenePlayerModeTests.test_cardMode_mountsTheHostMuted`
/// côté SDK.
final class DetailMosaicBackgroundSoundTests: XCTestCase {

    // MARK: - Fabriques

    /// Un post à DEUX scènes dont la première porte une piste de fond — la
    /// forme que le composer publie réellement (`payload.isBackground`), et
    /// que le corpus de production n'avait jamais produite : aucun post vivant
    /// ne combinait plus d'une scène ET une piste de fond (mesuré 2026-09-07),
    /// donc aucun témoin existant ne POUVAIT tomber.
    private func documentAvecSonDeFond() -> CanvasV3 {
        CanvasV3(scenes: [
            SceneV3(id: "s1", objects: [
                ObjectV3(id: "a1", kind: .audio,
                         anchor: .free(x: 0.5, y: 0.65), plane: .content, z: 1,
                         transform: TransformV3(),
                         payload: ["isBackground": .bool(true),
                                   "soundId": .string("6a6f4c5d571375fd684a308c"),
                                   "name": .string("Take control"),
                                   "mediaURL": .string("/api/v1/static/take-control.mp3")]),
            ]),
            SceneV3(id: "s2", objects: [
                ObjectV3(id: "t1", kind: .text,
                         anchor: .free(x: 0.5, y: 0.5), plane: .fg, z: 1,
                         transform: TransformV3(), locale: "fr",
                         payload: ["text": .string("Deuxième scène")]),
            ]),
        ])
    }

    private func post() -> FeedPost {
        FeedPost(id: "p1", author: "atabeth", authorId: "a1",
                 content: "Deux scènes, une piste de fond", timestamp: Date())
    }

    private func mosaique(host: PostSceneMosaicHost,
                          isMuted: Bool = false) -> PostSceneMosaic {
        PostSceneMosaic(post: post(),
                        document: documentAvecSonDeFond(),
                        accentColor: "#7C3AED",
                        preferredContentLanguages: ["fr"],
                        isActive: true,
                        host: host,
                        isMuted: isMuted)
    }

    // MARK: - Le témoin discriminant

    /// **Le détail SERT le son.** C'est ce témoin qui échoue avant le
    /// correctif : `mode: .card` verrouillait le muet, et la mosaïque du
    /// détail montait donc un player définitivement silencieux.
    func test_detailMosaic_mountsThePlayerAudible() {
        let player = mosaique(host: .detail).scenePlayer(sceneIndex: 0, joue: true)
        XCTAssertFalse(player.host.mute,
                       "Le détail joue son fond — il ne peut pas hériter du muet VERROUILLÉ du fil.")
    }

    /// Le bouton muet de la barre d'actions atteint RÉELLEMENT ce lecteur —
    /// sans quoi il serait le contrôle inerte que `MuteButtonExistenceGuardTests`
    /// a déjà rejeté deux fois.
    func test_detailMosaic_followsTheViewerMuteCommand() {
        let coupe = mosaique(host: .detail, isMuted: true).scenePlayer(sceneIndex: 0, joue: true)
        XCTAssertTrue(coupe.host.mute,
                      "Le muet du viewer doit descendre jusqu'à l'hôte canvas de la mosaïque.")
    }

    // MARK: - Le pendant négatif : le fil ne bouge pas

    /// **Le fil reste muet PAR CONSTRUCTION** (#4084, E3). Sans ce témoin, le
    /// correctif pourrait ouvrir le son de toutes les cartes du fil — la
    /// panne inverse, et bien pire.
    func test_feedMosaic_staysMutedByConstruction() {
        let player = mosaique(host: .feed).scenePlayer(sceneIndex: 0, joue: true)
        XCTAssertTrue(player.host.mute,
                      "La carte de fil n'a aucun lecteur à piloter : son muet est verrouillé.")
    }

    /// Et le verrou du fil ne se lève pas par une demande d'hôte — c'est ce
    /// que `locksMute` garantit, et ce témoin l'éprouve à travers la mosaïque.
    func test_feedMosaic_ignoresAnyUnmuteRequest() {
        let player = mosaique(host: .feed, isMuted: false).scenePlayer(sceneIndex: 0, joue: true)
        XCTAssertTrue(player.host.mute)
    }

    /// L'hôte par DÉFAUT est le fil : un site qui ne dit rien ne doit pas
    /// ouvrir le son par inadvertance.
    func test_theDefaultHostIsTheFeed() {
        let implicite = PostSceneMosaic(post: post(),
                                        document: documentAvecSonDeFond(),
                                        accentColor: "#7C3AED",
                                        preferredContentLanguages: ["fr"])
        XCTAssertEqual(implicite.host, .feed)
        XCTAssertTrue(implicite.scenePlayer(sceneIndex: 0, joue: true).host.mute)
    }

    // MARK: - L'indicateur « son coupé » ne ment pas

    /// **Le haut-parleur barré n'existe que là où le muet est VERROUILLÉ.**
    ///
    /// Son libellé dit « ouvrir en plein écran pour l'entendre » : dans le
    /// détail, où le son joue et où un bouton local le coupe, ce conseil est
    /// faux deux fois. L'indicateur suit donc le verrou, jamais un `true`
    /// écrit en dur.
    func test_theMutedGlyph_onlyWhereMuteIsLocked() {
        XCTAssertTrue(mosaique(host: .feed).montreLIndicateurDeSonCoupe)
        XCTAssertFalse(mosaique(host: .detail).montreLIndicateurDeSonCoupe)
    }

    /// Et il ne paraît que si le document a vraiment quelque chose à couper —
    /// la règle `SceneMotion.isAudible` que ce lot ne change pas.
    func test_theMutedGlyph_staysAbsentWithoutATrack() {
        let muet = PostSceneMosaic(post: post(),
                                   document: CanvasV3(scenes: [
                                       SceneV3(id: "s1", objects: [
                                           ObjectV3(id: "t1", kind: .text,
                                                    anchor: .free(x: 0.5, y: 0.5),
                                                    plane: .fg, z: 1,
                                                    transform: TransformV3(),
                                                    payload: ["text": .string("Rien à entendre")]),
                                       ]),
                                   ]),
                                   accentColor: "#7C3AED",
                                   preferredContentLanguages: ["fr"])
        XCTAssertFalse(muet.montreLIndicateurDeSonCoupe)
    }

    // MARK: - La règle d'hôte, éprouvée seule

    func test_hostRule_theFeedLocksTheMute_theDetailDoesNot() {
        XCTAssertTrue(ScenePlayerConfig(mode: PostSceneMosaicHost.feed.playerMode).locksMute)
        XCTAssertFalse(ScenePlayerConfig(mode: PostSceneMosaicHost.detail.playerMode).locksMute)
    }
}
