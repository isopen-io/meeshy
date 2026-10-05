import XCTest
@testable import MeeshyUI
import MeeshySDK

/// **#5086 (vue `4c`) — l'adoption d'une PRÉ-MONTÉE.**
///
/// La montée commence à la POSE ; quand elle aboutit, l'objet doit cesser
/// d'être local. C'est le seul geste qui rende la promesse de la planche
/// tenable : « au moment de publier, il ne reste qu'un accusé à attendre ».
///
/// L'adoption est aussi ce qui donne au lot sa garantie la plus délicate — un
/// échec de pré-montée ne peut pas faire échouer la publication. La boucle de
/// publication saute tout objet dont `postMediaId` est non vide : adopter
/// SAUTE, ne pas adopter LAISSE le chemin d'hier.
@MainActor
final class ComposerPreUploadAdoptionTests: XCTestCase {

    private func sut() -> StoryComposerViewModel { StoryComposerViewModel() }

    private func poserImage(_ vm: StoryComposerViewModel, local: String) -> String? {
        guard let objet = vm.addMediaObject(kind: .image, toSlideId: vm.currentSlide.id) else {
            return nil
        }
        vm.setMediaURL(id: objet.id, url: local, slideId: vm.currentSlide.id)
        return objet.id
    }

    private func media(_ vm: StoryComposerViewModel, _ id: String) -> StoryMediaObject? {
        vm.slides.compactMap { $0.effects.mediaObjects?.first { $0.id == id } }.first
    }

    /// **Les deux champs se posent ENSEMBLE.** Un objet qui porterait
    /// l'identifiant distant sans l'URL distante serait SAUTÉ par la
    /// publication et publié avec un `file://` que personne ne peut lire — un
    /// défaut pire que l'absence de pré-montée, et invisible chez l'auteur, qui
    /// a le fichier.
    func test_lAdoption_poseLIdentifiantETLURLDistante() {
        let vm = sut()
        guard let id = poserImage(vm, local: "file:///tmp/a.jpg") else {
            return XCTFail("la pose a échoué")
        }
        XCTAssertTrue(vm.adoptPreUploadedMedia(
            localURL: "file:///tmp/a.jpg", postMediaId: "pm1", remoteURL: "https://cdn/a.jpg"))
        XCTAssertEqual(media(vm, id)?.postMediaId, "pm1")
        XCTAssertEqual(media(vm, id)?.mediaURL, "https://cdn/a.jpg")
    }

    /// **Un média retiré pendant la montée n'est pas une erreur.** L'appelant y
    /// lit qu'il peut oublier cette pré-montée — et surtout, l'adoption ne doit
    /// pas ressusciter un objet que l'auteur a jeté.
    func test_unMediaRetirePendantLaMontee_neSAdoptePas() {
        let vm = sut()
        XCTAssertFalse(vm.adoptPreUploadedMedia(
            localURL: "file:///tmp/jamais-pose.jpg", postMediaId: "pm1", remoteURL: "https://cdn/x"))
    }

    /// **La recherche balaie TOUTES les slides.** La montée est lancée à la
    /// pose, et l'auteur peut déplacer l'objet pendant qu'elle voyage : un
    /// index de slide capturé au départ désignerait la mauvaise à l'arrivée.
    ///
    /// Le témoin pose l'objet sur la première slide, en crée une seconde qui
    /// devient courante, puis adopte — ce qui échouerait si la recherche
    /// s'arrêtait à la slide courante.
    func test_lAdoption_trouveLObjetSurUneAutreSlideQueLaCourante() {
        let vm = sut()
        guard let id = poserImage(vm, local: "file:///tmp/b.jpg") else {
            return XCTFail("la pose a échoué")
        }
        vm.addSlide()
        XCTAssertNotEqual(vm.currentSlide.id, vm.slides.first?.id,
                          "le témoin exige que la slide courante ait changé")
        XCTAssertTrue(vm.adoptPreUploadedMedia(
            localURL: "file:///tmp/b.jpg", postMediaId: "pm2", remoteURL: "https://cdn/b.jpg"))
        XCTAssertEqual(media(vm, id)?.postMediaId, "pm2")
    }

    /// Un autre média du même document ne doit pas être touché : l'adoption
    /// vise UN fichier, pas une famille.
    func test_lAdoption_neToucheQueLObjetDeCeFichier() {
        let vm = sut()
        guard let a = poserImage(vm, local: "file:///tmp/c.jpg"),
              let b = poserImage(vm, local: "file:///tmp/d.jpg") else {
            return XCTFail("la pose a échoué")
        }
        vm.adoptPreUploadedMedia(
            localURL: "file:///tmp/c.jpg", postMediaId: "pm3", remoteURL: "https://cdn/c.jpg")
        XCTAssertEqual(media(vm, a)?.postMediaId, "pm3")
        XCTAssertTrue(media(vm, b)?.postMediaId.isEmpty ?? false,
                      "le voisin doit rester local, donc monté par la publication")
    }

    // MARK: - Une adoption IMPERCEPTIBLE (retour porteur 2026-09-28)

    /// **L'image ne se recharge pas quand l'objet change d'adresse.** Adopté,
    /// l'objet est désormais cherché sous son `postMediaId` : sans ce relais,
    /// le canvas ne trouvait plus son bitmap et le rechargeait par le réseau —
    /// la carte disparaissait 0,6 s, mesuré à l'enregistrement d'écran.
    func test_lAdoption_rangeLeBitmapSousLIdentifiantServeur() {
        let vm = sut()
        guard let id = poserImage(vm, local: "file:///tmp/b.jpg") else { return XCTFail("la pose a échoué") }
        let image = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { _ in }
        vm.registerLoadedImage(image, for: id)
        let avant = vm.loadedImagesVersion

        XCTAssertTrue(vm.adoptPreUploadedMedia(
            localURL: "file:///tmp/b.jpg", postMediaId: "pm-b", remoteURL: "https://cdn/b.jpg"))

        XCTAssertTrue(vm.loadedImages["pm-b"] === image, "le canvas retrouve le MÊME bitmap sous l'id serveur")
        XCTAssertTrue(vm.loadedImages["https://cdn/b.jpg"] === image,
                      "…et sous l'ADRESSE, la clé de routage d'un fond")
        XCTAssertTrue(vm.loadedImages[id] === image, "…sans perdre la clé locale")
        XCTAssertNotEqual(vm.loadedImagesVersion, avant, "le lecteur d'images doit se reconstruire")
    }

    /// Le fichier temporaire nommé d'après l'objet (`{id}.jpg`) est l'autre clé
    /// sous laquelle le FOND cherche son bitmap.
    func test_lAdoption_relaieAussiLaCleDuFichier() {
        let vm = sut()
        guard poserImage(vm, local: "file:///tmp/fichier-c.jpg") != nil else { return XCTFail("la pose a échoué") }
        let image = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { _ in }
        vm.registerLoadedImage(image, for: "fichier-c")

        XCTAssertTrue(vm.adoptPreUploadedMedia(
            localURL: "file:///tmp/fichier-c.jpg", postMediaId: "pm-c", remoteURL: "https://cdn/c.jpg"))

        XCTAssertTrue(vm.loadedImages["pm-c"] === image)
    }

    /// Un FOND n'a parfois que son fichier local : le relais le lit, pour que
    /// le canvas n'attende pas le réseau.
    func test_sansBitmapEnMemoire_leRelaisLitLeFichierLocal() throws {
        let vm = sut()
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("adopt-\(UUID().uuidString).png")
        let image = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { _ in }
        try XCTUnwrap(image.pngData()).write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        guard poserImage(vm, local: url.absoluteString) != nil else { return XCTFail("la pose a échoué") }

        XCTAssertTrue(vm.adoptPreUploadedMedia(
            localURL: url.absoluteString, postMediaId: "pm-d", remoteURL: "https://cdn/d.png"))

        XCTAssertNotNil(vm.loadedImages["pm-d"])
    }
}
