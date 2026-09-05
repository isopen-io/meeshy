import XCTest
@testable import Meeshy

/// **La caméra du tray ouvre le MEUBLE, plus l'atelier** (#4751, directive
/// porteur 2026-09-01 23 h : « se concentrer sur le composer v3 et non
/// l'ancien »).
///
/// ## La chaîne qui montait l'ancien écran
///
/// Trois règles, chacune juste isolément, dont la composition faisait ouvrir
/// `StoryComposerView` à qui tape « Créer une story » depuis le Feed :
///
/// | règle | ce qu'elle disait |
/// |---|---|
/// | `ComposerIntent` | `.storyTray` → `opensWith: .cameraReady` |
/// | `ComposerSurfaceRouting.surface` | `.cameraReady` → `.scene` |
/// | `ComposerMountedView.mounted` | `.scene` → **`.atelier`** |
///
/// Le #4700 avait fait basculer la story vers le meuble pour les ouvertures où
/// l'auteur CHOISIT (`keyboardOnContent`, `moodGrid`), en nommant le reste
/// comme un lot séparé : « le chemin caméra puis STORY demande de faire
/// descendre la capture dans les slides du meuble ». C'est ce lot.
///
/// ## Ce que l'exemption disait, et pourquoi elle tombe
///
/// L'ancien commentaire justifiait l'exemption ainsi : « elles n'ouvrent pas
/// sur un choix : elles arrivent avec une capture […] et l'atelier est le seul
/// écran qui les tienne déjà ». C'était vrai de `.resume` et de `.mediaSeeded`,
/// qui arrivent avec de la matière que le meuble ne sait pas encore reprendre.
///
/// Ce ne l'était PAS de `.cameraReady`, qui n'arrive avec rien : elle promet
/// un VISEUR, et le meuble sait l'ouvrir depuis toujours
/// (`presentMediaIntake(.camera)` → `presentedPortal = .camera`).
///
/// > Une exemption qui couvre quatre cas d'un seul argument doit être vérifiée
/// > sur les quatre. Ici l'argument valait pour trois — et le quatrième, celui
/// > de la porte la plus visible du Feed, y était entré par ressemblance.
final class ComposerCameraOpensTheMeubleTests: XCTestCase {

    /// **LE témoin de la directive.** Une story ouverte par la caméra du tray
    /// atterrit sur la surface DOCUMENT — donc, la scène naissant toujours pour
    /// une story (#4700), sur `ComposerSceneSurface`, le composer v3.
    func test_laCameraDuTray_ouvreLeMeuble_pasLAtelier() {
        XCTAssertEqual(
            ComposerSurfaceRouting.surface(opening: .cameraReady, format: .story),
            .document,
            "« Créer une story » depuis le Feed montait l'atelier du SDK")
    }

    /// Et sur les trois formats que le tray peut offrir — l'éventail de
    /// `.storyTray` sert `[.story, .post]` plus le réel dès qu'une vidéo
    /// qualifie. Un correctif qui ne vaudrait que pour la story laisserait
    /// l'auteur changer de composer en changeant de format, sur un écran qu'il
    /// croit unique.
    func test_lesTroisFormatsDuTray_atterrissentSurLeMeuble() {
        for format in [ComposerFormat.story, .post, .reel] {
            XCTAssertEqual(
                ComposerSurfaceRouting.surface(opening: .cameraReady, format: format),
                .document,
                "\(format) ouvert à la caméra doit rester dans le meuble")
        }
    }

    /// **Le mood garde sa grille.** `.cameraReady` ne l'atteint pas aujourd'hui
    /// — le tray n'offre pas `status` — mais la règle est totale, et la rendre
    /// juste ici coûte une ligne quand la rendre fausse coûterait un écran.
    func test_leMood_gardeSaGrille() {
        XCTAssertEqual(ComposerSurfaceRouting.surface(opening: .cameraReady, format: .status),
                       .mood)
    }

    /// **Les TROIS autres ouvertures gardent l'atelier, et c'est délibéré.**
    ///
    /// Elles arrivent avec de la matière que le meuble ne sait pas encore
    /// tenir : un brouillon repeuplé (`.resume`) ou un média reçu d'une
    /// conversation (`.mediaSeeded`), dont `ComposerDocumentDraft` ne porte ni
    /// les identifiants ni les fichiers. Les router ailleurs ferait disparaître
    /// de l'écran ET de la publication ce que l'auteur vient de confier.
    ///
    /// Ce témoin est donc une DETTE NOMMÉE, pas une approbation : il tombera
    /// quand le meuble saura reprendre et semer, et c'est à ce moment-là qu'on
    /// le retournera — jamais avant.
    ///
    /// **La dette a désormais un document à citer** (2026-09-02) :
    /// `docs/product/meeshy-composer-modele.md` § 1 bis « Ce qu'une publication
    /// DEVIENT — la projection ». Il établit, avec ses sites, qu'aucune couche
    /// sous le composer ne porte la publication comme un objet — `PublishIntent`
    /// n'a ni slide ni objet ni effet, et `model Post` n'a aucune clé de
    /// regroupement. C'est ce qui manque à `.resume` : non pas un champ oublié
    /// dans `ComposerDocumentDraft`, mais **l'identité d'une publication
    /// existante**, qui n'a de référent nulle part.
    ///
    /// Le § ne tranche PAS qui exécutera la projection (#4733). Ce témoin ne
    /// doit donc pas se lire comme attendant une implémentation décidée : il
    /// garde un état de fait, et le document dit lequel.
    func test_lesTroisAutresOuvertures_restentSurLAtelier_dettesNOMMEES() {
        for opening in [ComposerOpening.resume, .mediaSeeded, .videoCameraReady] {
            XCTAssertEqual(
                ComposerSurfaceRouting.surface(opening: opening, format: .story),
                .scene,
                "\(opening) porte de la matière que le meuble ne reprend pas encore (#4751)")
        }
    }

    /// **La caméra reste PROMISE — mais par un GESTE** (#4036, 2026-09-03).
    ///
    /// Ce témoin affirmait l'inverse : « `.cameraReady` n'est pas une entrée
    /// neutre, c'est un viseur ouvert ». Le porteur l'a révoqué — l'auteur qui
    /// venait composer traversait un plein écran noir. La promesse survit dans
    /// le MODE que l'appui long ouvrira ; c'est `ComposerSceneCaptureGesture`
    /// qui la porte, et `ComposerSceneCaptureGestureTests` qui la garde.
    ///
    /// > Une bascule de doctrine se lit dans l'historique d'un témoin
    /// > RÉÉCRIT, jamais dans son absence : supprimé, il n'aurait rien dit à la
    /// > session qui rebranchera le viseur au montage en croyant réparer.
    func test_laPorteChoisitEncoreLeMode_maisNOuvreAucunViseur() {
        XCTAssertEqual(ComposerCameraMode.mode(for: .cameraReady), .photo)
        XCTAssertEqual(ComposerCameraMode.mode(for: .videoCameraReady), .video)
        XCTAssertFalse(ComposerSurfaceRouting.focusesContentOnAppear(opening: .cameraReady),
                       "la porte caméra ne lève pas le clavier")
    }
}
