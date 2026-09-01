import XCTest
import MeeshySDK
@testable import MeeshyUI

/// **Ce qu'une piste montre d'elle-même** (directive porteur 2026-09-01).
///
/// > « Il ne faut plus mettre un chip mais juste la note musicale et l'onde si
/// > c'est un enregistrement, ou alors le titre si disponible et le crédit
/// > (sans onde) si ça vient de la bibliothèque. »
final class StoryAudioIdentityTests: XCTestCase {

    private func piste(soundId: String? = nil,
                       name: String? = nil,
                       author: String? = nil,
                       duration: Float? = 12) -> StoryAudioPlayerObject {
        var audio = StoryAudioPlayerObject(id: "a1", postMediaId: "m1")
        audio.soundId = soundId
        audio.name = name
        audio.soundAuthorUsername = author
        audio.duration = duration
        return audio
    }

    // MARK: - Les deux formes

    /// Un son CAPTÉ n'a ni titre ni auteur à créditer : son onde est le seul
    /// repère qu'on en ait.
    func test_unEnregistrement_montreSonONDEEtSaDurée() {
        guard case .recording(let duree) = StoryAudioIdentity.form(of: piste()) else {
            return XCTFail("une piste sans soundId est un enregistrement")
        }
        XCTAssertEqual(duree, 12)
        XCTAssertTrue(StoryAudioIdentity.showsWaveform(for: piste()))
    }

    /// **LE témoin de la directive.** Un morceau de bibliothèque a un NOM : son
    /// onde n'apprend rien que son titre ne dise mieux, et elle occupe la place
    /// où le crédit doit tenir.
    func test_unSonEMPRUNTÉ_montreTitreEtCrédit_SANSOnde() {
        let emprunte = piste(soundId: "s9", name: "Nuits blanches", author: "belva")
        guard case .borrowed(let titre, let credit) = StoryAudioIdentity.form(of: emprunte) else {
            return XCTFail("une piste avec soundId est un emprunt")
        }
        XCTAssertEqual(titre, "Nuits blanches")
        XCTAssertEqual(credit, "belva")
        XCTAssertFalse(StoryAudioIdentity.showsWaveform(for: emprunte),
                       "l'onde d'un emprunt vole la place de son crédit")
    }

    // MARK: - Ce qui décide, et ce qui ne décide pas

    /// **`soundId` décide, jamais la présence d'un titre.** Un enregistrement
    /// peut porter un `name` — l'auteur l'a nommé — sans devenir un emprunt
    /// pour autant ; lire le titre pour trancher ferait dépendre l'attribution
    /// d'un champ facultatif.
    func test_unEnregistrementNOMMÉ_resteUnEnregistrement() {
        let nomme = piste(name: "Mémo du mardi")
        XCTAssertTrue(StoryAudioIdentity.showsWaveform(for: nomme))
        guard case .recording = StoryAudioIdentity.form(of: nomme) else {
            return XCTFail("un nom ne fait pas un emprunt")
        }
    }

    /// Et un emprunt SANS titre reste un emprunt, qui doit son crédit.
    func test_unEmpruntSANSTitre_resteUnEmprunt_etGardeSonCrédit() {
        let sansTitre = piste(soundId: "s9", author: "belva")
        guard case .borrowed(let titre, let credit) = StoryAudioIdentity.form(of: sansTitre) else {
            return XCTFail("l'absence de titre ne rend pas la piste propre")
        }
        XCTAssertNil(titre)
        XCTAssertEqual(credit, "belva")
        XCTAssertFalse(StoryAudioIdentity.showsWaveform(for: sansTitre))
    }

    /// Un `soundId` VIDE n'est pas un emprunt — un décodeur permissif peut
    /// rendre `""` là où le serveur n'a rien mis, et une chaîne vide ferait
    /// alors disparaître l'onde d'un enregistrement.
    func test_unSoundIdVIDE_neFabriquePasUnEmprunt() {
        XCTAssertTrue(StoryAudioIdentity.showsWaveform(for: piste(soundId: "")))
    }

    /// Les champs blancs ne fabriquent ni titre ni crédit : une capsule
    /// afficherait un « par  » avec un trou à la place du nom.
    func test_lesChampsBLANCS_neFabriquentNiTitreNiCrédit() {
        guard case .borrowed(let titre, let credit) =
                StoryAudioIdentity.form(of: piste(soundId: "s9", name: "  ", author: "\n")) else {
            return XCTFail("c'est un emprunt")
        }
        XCTAssertNil(titre)
        XCTAssertNil(credit)
    }

    // MARK: - Ce que la SURFACE montre du son

    /// **Le témoin de la seconde moitié de la directive.** Un post se LIT : le
    /// texte y a sa place de plein droit. Une story se REGARDE : l'auteur y a
    /// composé une image, et un bloc défilant posé par-dessus détruirait ce
    /// qu'il vient de cadrer.
    func test_laTranscription_seSertAuPOST_jamaisÀLaSTORY() {
        XCTAssertTrue(StoryAudioIdentity.showsTranscript(on: .post))
        XCTAssertFalse(StoryAudioIdentity.showsTranscript(on: .story))
    }

    /// La question se pose sur un objet de scène sans qu'un appelant ait à
    /// dépiauter la somme lui-même.
    func test_laQuestion_sePoseSurUnObjetDeSCÈNE() {
        let son = MeeshySceneObject.audio(piste())
        XCTAssertEqual(StoryAudioIdentity.showsTranscript(for: son, on: .post), true)
        XCTAssertEqual(StoryAudioIdentity.showsTranscript(for: son, on: .story), false)
    }

    /// **`nil`, pas `false`.** Un texte n'a pas de transcription à cacher : lui
    /// répondre « non » ferait croire à une décision là où il n'y a pas de
    /// question, et un appelant qui teste `== false` peindrait alors une
    /// absence pour un objet qui n'a jamais été concerné.
    func test_unObjetQuiNEstPasUnSon_neRépondPasÀLaQuestion() {
        let texte = MeeshySceneObject.text(StoryTextObject(text: "bonjour"))
        XCTAssertNil(StoryAudioIdentity.showsTranscript(for: texte, on: .post))
    }

    /// **La NOTE se peint toujours** — c'est elle qui porte le toucher qui ouvre
    /// l'édition. Une forme qui la retirerait retirerait le seul chemin vers la
    /// vue de création audio.
    func test_laNOTE_sePeintDansLesDEUXFormes() {
        XCTAssertTrue(StoryAudioIdentity.alwaysShowsNote)
    }
}
