import XCTest
import UIKit
@testable import MeeshyUI

/// **Une reconfiguration qui ne sait pas résoudre son NOUVEAU sujet n'a rien à
/// dire sur l'ANCIEN** (directive porteur 2026-09-06 : « quand j'ajoute un
/// média de fond, ça disparaît immédiatement »).
///
/// ## Le défaut que ces témoins ferment
///
/// Le fond était configuré sur le FICHIER LOCAL et se peignait. Puis la
/// pré-montée aboutissait, le média recevait son id SERVEUR, et la couche était
/// reconfigurée sur cette nouvelle identité — que le résolveur ne savait pas
/// résoudre. Mesuré au simulateur, avant correctif :
///
///     bg video configure id=…-60848601514B.mp4  resolved=CCEAFC3C-….mp4
///     arm video readiness  layerReady=true  itemStatus=1        ← prêt
///     pré-montée aboutie: …  id=6a9d44a3…  adoptée=true
///     bg video configure  id=6a9d44a3…  resolved=nil            ← ✗
///     readiness eval  hasPlayer=false hasItem=false
///
/// Le média n'avait pas disparu : **il avait changé de nom**, et la couche
/// suivait le changement sans savoir résoudre le nouveau.
///
/// > **Attendre n'est pas abandonner.** Les deux branches repliaient sur une
/// > absence en supposant que la résolution reviendrait — « le resolver peut
/// > retourner nil 1-2 frames » pour la vidéo, un `guard … else { return }` muet
/// > pour l'image. Justes pour deux frames ; ici le `nil` est DÉFINITIF, car
/// > rien ne reconfigure une troisième fois.
///
/// ## Pourquoi une règle PURE, et pas un test de rendu
///
/// La question « cette identité mène-t-elle quelque part ? » se répond sans
/// monter d'écran, et c'est elle qui décide. Le rendu, lui, a été vérifié au
/// simulateur — la vidéo se peint et joue après correctif. Ces témoins gardent
/// la DÉCISION ; l'écran a gardé son effet une fois.
final class StoryBackgroundResolutionGuardTests: XCTestCase {

    private let idServeur = "6a9d44a3e20eb04516c74676"
    private let cheminLocal = "file:///tmp/composer_photo_ABC.mp4"

    // MARK: - Ce qui ne dépend d'aucune adresse

    /// Un fond COLORÉ porte sa valeur : il est toujours résolvable, et aucune
    /// reconfiguration vers une couleur ne doit jamais être refusée.
    func test_unFondColore_estToujoursResolvable() {
        XCTAssertTrue(StoryBackgroundLayer.canResolve(.solidColor(.red), resolver: nil))
        XCTAssertTrue(StoryBackgroundLayer.canResolve(
            .gradient(colors: [.red, .blue], direction: .topToBottom), resolver: nil))
    }

    // MARK: - LE témoin du lot

    /// **L'id serveur fraîchement adopté, qu'aucun résolveur ne connaît encore.**
    /// C'est exactement l'état mesuré à 59.200 : la reconfiguration qui
    /// détruisait un fond qui se peignait.
    func test_unIdInconnuDuResolveur_neSeResoutPas() {
        XCTAssertFalse(StoryBackgroundLayer.canResolve(
            .video(postMediaId: idServeur, looping: true, mute: true, thumbHash: nil),
            resolver: { _ in nil }))
        XCTAssertFalse(StoryBackgroundLayer.canResolve(
            .image(postMediaId: idServeur, thumbHash: nil),
            resolver: { _ in nil }))
    }

    /// **Un chemin local se résout SANS résolveur** — c'est l'état d'avant
    /// l'adoption, celui qui se peignait. Le témoin est écrit avec
    /// `resolver: nil` pour prouver que la première source suffit : si un jour
    /// elle disparaissait, le repli du résolveur masquerait la régression.
    func test_unCheminLocal_seResoutSansResolveur() {
        XCTAssertTrue(StoryBackgroundLayer.canResolve(
            .video(postMediaId: cheminLocal, looping: true, mute: true, thumbHash: nil),
            resolver: nil))
    }

    /// **Un id que le résolveur CONNAÎT se résout** — sans quoi la garde
    /// bloquerait toute reconfiguration légitime, et un fond ne pourrait plus
    /// jamais être remplacé. C'est le témoin qui empêche le remède de devenir
    /// la maladie.
    func test_unIdConnuDuResolveur_seResout() {
        let resolveur: (String) -> URL? = { id in
            id == self.idServeur ? URL(string: "https://gate.example/\(id).mp4") : nil
        }
        XCTAssertTrue(StoryBackgroundLayer.canResolve(
            .video(postMediaId: idServeur, looping: true, mute: true, thumbHash: nil),
            resolver: resolveur))
        XCTAssertTrue(StoryBackgroundLayer.canResolve(
            .image(postMediaId: idServeur, thumbHash: nil), resolver: resolveur))
    }

    /// **Image et vidéo répondent PAREIL.** Les deux branches ont le même
    /// défaut et doivent avoir la même garde : la trace du porteur portait une
    /// vidéo, mais une session voisine a mesuré l'image adoptée s'effacer de la
    /// même façon — et sa règle apparente (« seul le 9:16 se peint ») n'était
    /// qu'un effet du POIDS, donc du temps de téléversement.
    func test_imageEtVideo_repondentIdentiquement() {
        for resolveur: ((String) -> URL?)? in [nil, { _ in nil }, { _ in URL(string: "https://x/y") }] {
            XCTAssertEqual(
                StoryBackgroundLayer.canResolve(
                    .image(postMediaId: idServeur, thumbHash: nil), resolver: resolveur),
                StoryBackgroundLayer.canResolve(
                    .video(postMediaId: idServeur, looping: false, mute: false, thumbHash: nil),
                    resolver: resolveur),
                "les deux natures de média doivent suivre la même règle")
        }
    }

    /// Un identifiant VIDE ne mène nulle part — et ne doit pas non plus faire
    /// croire qu'il mène quelque part par le seul fait qu'un résolveur existe.
    func test_unIdentifiantVide_neSeResoutPas() {
        XCTAssertFalse(StoryBackgroundLayer.canResolve(
            .image(postMediaId: "", thumbHash: nil), resolver: { _ in nil }))
    }
}
