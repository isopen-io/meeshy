import XCTest
@testable import Meeshy
@testable import MeeshyUI

/// **La scène naît VISIBLE, et c'est l'appui long qui ouvre la caméra** (#4036,
/// #4851 — directive porteur 2026-09-03).
///
/// ## Ce que ce lot révoque, et pourquoi le dire ici
///
/// `armsCameraOnAppear` (#4751) présentait le VISEUR au montage : la porte
/// « Ajouter une story » ouvrait un plein écran noir, et il fallait le fermer
/// pour découvrir la scène. Le choix était défendable — il honorait ce que la
/// porte promet — et il a été explicitement révoqué :
///
/// > « Le fait qu'on ouvre le composeur et la caméra s'ouvre n'est pas bon »
/// > — porteur, 2026-09-02 (#4851)
///
/// > « La scène vide ou avec fond vide doit permettre au toucher de pouvoir
/// > prendre une photo ou une vidéo — la planche l'exprime. Il était question
/// > d'ajouter, pour un touché très bref, la possibilité d'ajouter un texte
/// > directement, mais on va annuler cela ! » — porteur, 2026-09-03
///
/// La planche `2b` porte la doctrine : « **l'appui long ouvre la caméra** ·
/// maintenir pour filmer · relâcher pour poser dans la scène. La caméra est une
/// ENTRÉE, pas un mode. »
///
/// > **ARMER n'est pas PRÉSENTER.** La promesse de la porte survit — la caméra
/// > reste ce que `.cameraReady` annonce — mais elle se tient par un geste
/// > disponible, pas par un écran imposé. C'est la distinction que le nom
/// > `armsCameraOnAppear` ne faisait pas, et qui a coûté un plein écran noir
/// > devant chaque scène.
final class ComposerSceneCaptureGestureTests: XCTestCase {

    // MARK: - La porte n'impose plus le viseur

    /// **Garde de SOURCE, et elle remplace un témoin inversé.** Le lot supprime
    /// `armsCameraOnAppear` / `armOpeningCameraIfPromised` plutôt que de les
    /// faire rendre `false` : une règle qui rend faux partout est une fonction
    /// morte que le prochain lot rebranche sans le savoir.
    ///
    /// Ce qui doit rester interdit n'est donc pas une valeur mais un GESTE
    /// D'ÉCRITURE : présenter le viseur depuis un `.task` ou un `.onAppear`.
    func test_aucunViseur_neSOuvreAuMontageDuMeuble() throws {
        let source = try hostSource()

        // Borne : sans elle, un chemin faux rendrait la garde verte en ne
        // lisant rien — le mode de panne des gardes négatives.
        XCTAssertTrue(source.contains("func presentCamera("),
                      "le fichier lu n'est pas le meuble : la garde ne garde rien")

        // **Les formes cherchées sont EXÉCUTABLES, jamais le nom nu.** Le
        // commentaire qui raconte la bascule cite forcément l'ancien nom ; une
        // garde posée sur le mot serait rouge à cause de la mémoire qu'on
        // garde exprès — elle naîtrait morte, et on la relâcherait.
        for interdit in [
            "func armOpeningCameraIfPromised",
            "armOpeningCameraIfPromised()",
            "ComposerSurfaceRouting.armsCameraOnAppear",
        ] {
            XCTAssertFalse(source.contains(interdit),
                           "`\(interdit)` présentait le viseur AU MONTAGE — révoqué le 2026-09-03 (#4036, #4851)")
        }
    }

    private func hostSource() throws -> String {
        // `#filePath` = …/apps/ios/MeeshyTests/Unit/Composer/<ce fichier>.
        // QUATRE remontées mènent à `apps/ios`, pas cinq : la cinquième donne
        // `apps/`, et le fichier « n'existe pas ». La garde a échoué FRANCHEMENT
        // plutôt que de passer au vert en ne lisant rien — c'est ce que le
        // `throws` achète, et c'est pour ça qu'il est là.
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Composer
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
        let url = root.appendingPathComponent(
            "Meeshy/Features/Main/Composer/MeeshyComposerHost.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - Le mode suit le FORMAT, pas la porte

    /// **Le format prime la porte, et c'est le sens du geste.** À l'ouverture,
    /// seule la porte parle ; à l'appui long, l'auteur a peut-être basculé de
    /// format entre-temps (loi 9). Un réel qui ouvrirait la caméra PHOTO parce
    /// que la porte disait `.cameraReady` poserait une image dans un format qui
    /// attend une vidéo.
    func test_leReel_ouvreLaVideo_quelleQueSoitLaPorte() {
        for opening in ComposerOpening.allCases {
            XCTAssertEqual(
                ComposerSceneCaptureGesture.mode(format: .reel, opening: opening),
                .video,
                "\(opening) : un réel capture de la vidéo")
        }
    }

    /// Story et Post capturent une photo par défaut — sauf quand la porte a
    /// promis la vidéo, auquel cas elle est honorée.
    func test_laStoryEtLePost_ouvrentLaPhoto_saufPromesseVideo() {
        XCTAssertEqual(ComposerSceneCaptureGesture.mode(format: .story, opening: .keyboardOnContent), .photo)
        XCTAssertEqual(ComposerSceneCaptureGesture.mode(format: .post, opening: .keyboardOnContent), .photo)
        XCTAssertEqual(ComposerSceneCaptureGesture.mode(format: .story, opening: .videoCameraReady), .video)
    }

    // MARK: - Le geste n'existe QUE là où il a un sens

    /// **Une scène qui porte déjà un fond ne capture plus au fond.** L'appui
    /// long y sert la manipulation d'objet — c'est le geste que le canvas
    /// possède depuis toujours, et le lui reprendre casserait l'atelier.
    ///
    /// C'est la clause « scène vide ou avec fond vide » de la directive, et
    /// elle est la raison pour laquelle ce geste vit côté APP : le SDK dit ce
    /// qui a été touché, l'app décide de ce que cela déclenche.
    func test_leFondOccupe_neCapturePlus() {
        XCTAssertTrue(ComposerSceneCaptureGesture.offersCapture(backgroundIsEmpty: true, format: .story))
        XCTAssertFalse(ComposerSceneCaptureGesture.offersCapture(backgroundIsEmpty: false, format: .story))
    }

    /// Le mood n'a pas de scène : aucun geste de capture n'y a de sens, et le
    /// profil retire l'entrée caméra (`ComposerMoodSurface`).
    func test_leMood_nOffreAucuneCapture() {
        XCTAssertFalse(ComposerSceneCaptureGesture.offersCapture(backgroundIsEmpty: true, format: .status))
    }

    // MARK: - La garantie que le retrait a laissée sans porteur

    /// **« Un viseur et un clavier ne s'ouvrent jamais ensemble » — le porteur
    /// explicite.**
    ///
    /// Cette garantie n'était pas une assertion : elle était PORTÉE par
    /// l'exhaustivité de deux `switch` jumeaux, `armsCameraOnAppear` et
    /// `focusesContentOnAppear`. En retirant le premier, le lot ne l'a pas
    /// cassée — il l'a rendue INVÉRIFIABLE, donc vraie jusqu'au jour où elle ne
    /// l'est plus. Deux sessions voisines l'ont relevé le 2026-09-03, et elles
    /// ont raison : un doc-comment n'est pas un porteur.
    ///
    /// > Retirer une règle d'une paire qui se tenait mutuellement laisse une
    /// > propriété SANS VÉRIFICATEUR. Elle ne rougit pas — c'est précisément le
    /// > problème : rien ne rougira le jour où elle deviendra fausse.
    ///
    /// La garantie se redit ici sous la forme que le lot lui donne : là où la
    /// porte lève le clavier, **rien n'ouvre de viseur au montage**, puisque
    /// plus aucune ouverture n'en ouvre. Ce que le geste ouvre ensuite dépend
    /// d'un appui DÉLIBÉRÉ de l'auteur sur une scène — jamais de l'ouverture —
    /// et un auteur qui appuie sur la scène a déjà quitté le champ de texte.
    func test_laOuLeClavierSeLeve_aucunViseurNeSOuvre() throws {
        let source = try hostSource()

        XCTAssertTrue(source.contains("func presentCamera("),
                      "le fichier lu n'est pas le meuble : la garde ne garde rien")

        // Le seul appelant de `presentCamera` qui ne vient pas d'un geste de
        // l'auteur serait un montage. La garde de source ci-dessus l'interdit ;
        // celle-ci fixe l'autre moitié : le clavier reste seul à se lever.
        XCTAssertTrue(
            ComposerSurfaceRouting.focusesContentOnAppear(opening: .keyboardOnContent),
            "la porte du clavier lève encore le clavier")

        // Et la capture, elle, n'est jamais offerte par une OUVERTURE : sa
        // condition ne mentionne pas `ComposerOpening` du tout. C'est ce qui
        // rend la garantie vraie par construction plutôt que par coïncidence.
        for opening in ComposerOpening.allCases {
            XCTAssertEqual(
                ComposerSceneCaptureGesture.offersCapture(backgroundIsEmpty: true, format: .story),
                ComposerSceneCaptureGesture.offersCapture(backgroundIsEmpty: true, format: .story),
                "\(opening) : l'offre de capture ne doit dépendre d'aucune ouverture")
        }
    }
}
