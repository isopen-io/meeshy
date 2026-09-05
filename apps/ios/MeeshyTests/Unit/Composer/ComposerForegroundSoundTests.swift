import XCTest
import MeeshySDK
@testable import Meeshy

/// **Le son placé en CONTENU de publication** (directive porteur 2026-09-01,
/// #4657) — sa résolution, et ce qu'une édition lui fait.
///
/// > « Lorsqu'on a un son en contenu de publication, sans canvas, il faut
/// > mettre juste après la zone texte le composant de lecture du contenu audio
/// > avec la transcription défilant, et la possibilité de toucher pour éditer
/// > le son via la vue de création audio. »
final class ComposerForegroundSoundTests: XCTestCase {

    private func media(_ nom: String, mime: String, ms: Int? = 12_000) -> ComposerDocumentMedia {
        ComposerDocumentMediaFactory.media(
            url: URL(fileURLWithPath: "/tmp/\(nom)"),
            declaredMimeType: mime,
            durationMs: ms
        )
    }

    private func transcription(_ texte: String,
                               segments: [MobileTranscriptionSegment] = []) -> MobileTranscriptionPayload {
        MobileTranscriptionPayload(text: texte, language: "fr", segments: segments)
    }

    // MARK: - Ce que la règle élit

    func test_resolve_unSonEtDesImages_élitLeSon() {
        let sons = ComposerForegroundSound.resolveAll(
            localMedia: [media("a.jpg", mime: "image/jpeg", ms: nil),
                         media("voix.m4a", mime: "audio/mp4"),
                         media("b.mp4", mime: "video/mp4")],
            transcriptions: [:]
        )
        XCTAssertEqual(sons.map(\.url.lastPathComponent), ["voix.m4a"])
        XCTAssertEqual(sons.first?.duration, 12)
    }

    /// **Les DEUX sons sont rendus, dans l'ordre de la POSE** (#4672).
    ///
    /// Cette suite épinglait l'inverse : « le DERNIER son gagne », au motif que
    /// le meuble ne gardait qu'UNE transcription. Le témoin décrivait
    /// fidèlement une CONSÉQUENCE de l'écrasement, pas une règle — et il
    /// PROTÉGEAIT donc le défaut : le premier son restait dans la publication,
    /// muet et invisible, et personne ne pouvait le retirer.
    ///
    /// > Un témoin qui grave la conséquence d'une limite en fait un invariant.
    /// > Relire ce qu'il PROTÈGE, pas seulement s'il passe.
    func test_resolve_deuxSons_lesRendTOUSLESDEUX() {
        let sons = ComposerForegroundSound.resolveAll(
            localMedia: [media("premier.m4a", mime: "audio/mp4"),
                         media("dernier.m4a", mime: "audio/mp4")],
            transcriptions: [:]
        )
        XCTAssertEqual(sons.map(\.url.lastPathComponent), ["premier.m4a", "dernier.m4a"])
    }

    func test_resolve_aucunSon_rendUneListeVide() {
        XCTAssertTrue(ComposerForegroundSound.resolveAll(
            localMedia: [media("a.jpg", mime: "image/jpeg", ms: nil)],
            transcriptions: [:]
        ).isEmpty)
    }

    /// Une durée absente ne disqualifie PAS le son : le lecteur relit la vraie
    /// durée du fichier et corrige. La refuser ici ferait disparaître la carte
    /// pour un champ que rien n'oblige à remplir.
    func test_resolve_duréeAbsente_gardeLeSon() {
        let sons = ComposerForegroundSound.resolveAll(
            localMedia: [media("voix.m4a", mime: "audio/mp4", ms: nil)],
            transcriptions: [:]
        )
        XCTAssertEqual(sons.count, 1)
        XCTAssertEqual(sons.first?.duration, 0)
    }

    // MARK: - La transcription qui défile

    func test_cues_segmentsDatés_deviennentDesLignesOrdonnées() {
        let cues = ComposerForegroundSound.cues(from: transcription(
            "Bonjour à midi",
            segments: [MobileTranscriptionSegment(text: "Bonjour", start: 0, end: 1.2),
                       MobileTranscriptionSegment(text: "à midi", start: 1.2, end: 2.5)]
        ))
        XCTAssertEqual(cues.map(\.text), ["Bonjour", "à midi"])
        XCTAssertEqual(cues.map(\.id), [0, 1])
        XCTAssertEqual(AudioTranscriptCue.activeIndex(in: cues, at: 1.5), 1)
    }

    /// **Deux lignes au texte IDENTIQUE restent deux lignes.** L'identité est
    /// l'index, pas le texte : « oui » suivi de « oui » se surligne une fois à
    /// la fois, sinon le défilement sauterait à la première à chaque tour.
    func test_cues_deuxLignesAuMêmeTexte_gardentDesIdentitésDISTINCTES() {
        let cues = ComposerForegroundSound.cues(from: transcription(
            "oui oui",
            segments: [MobileTranscriptionSegment(text: "oui", start: 0, end: 1),
                       MobileTranscriptionSegment(text: "oui", start: 1, end: 2)]
        ))
        XCTAssertEqual(Set(cues.map(\.id)).count, 2)
    }

    /// Une transcription saisie à la main (« Rédiger », « Coller ») n'a aucun
    /// segment : elle voyage par le texte entier, qui se lit sans s'allumer.
    func test_transcriptionManuelle_aucuneLigneDatée_maisLeTexteEstSERVI() {
        let voix = media("voix.m4a", mime: "audio/mp4")
        let sons = ComposerForegroundSound.resolveAll(
            localMedia: [voix],
            transcriptions: [voix.url: transcription("Écrit à la main")]
        )
        XCTAssertTrue(sons.first?.cues.isEmpty == true)
        XCTAssertEqual(sons.first?.text, "Écrit à la main")
    }

    // MARK: - Ce qu'une édition fait à la transcription

    private let ancienne = URL(fileURLWithPath: "/tmp/voix.m4a")
    private let rognee = URL(fileURLWithPath: "/tmp/voix-rognee.m4a")

    func test_survivingTranscription_laFeuilleEnRendUne_cEstELLE() {
        let servie = ComposerForegroundSound.survivingTranscription(
            returned: transcription("neuve"), previous: transcription("ancienne"),
            editedURL: ancienne, returnedURL: ancienne
        )
        XCTAssertEqual(servie?.text, "neuve")
    }

    /// **LE témoin de cette règle.** La feuille ne re-transcrit pas un son
    /// qu'on lui remet : elle rend `nil`. L'écrire tel quel effaçait le texte
    /// dès le premier aller-retour — rouvrir pour regarder la forme d'onde
    /// suffisait à perdre la transcription.
    func test_survivingTranscription_rienDeRenduEtFichierINCHANGÉ_lAncienneTient() {
        let servie = ComposerForegroundSound.survivingTranscription(
            returned: nil, previous: transcription("ancienne"),
            editedURL: ancienne, returnedURL: ancienne
        )
        XCTAssertEqual(servie?.text, "ancienne")
    }

    /// Rogné ⇒ les bornes de l'ancienne désignent des instants qui n'existent
    /// plus. Une transcription qui surligne à côté est PIRE qu'une absence :
    /// elle a l'air d'une reconnaissance ratée.
    func test_survivingTranscription_leFichierACHANGÉ_lAncienneTombe() {
        XCTAssertNil(ComposerForegroundSound.survivingTranscription(
            returned: nil, previous: transcription("ancienne"),
            editedURL: ancienne, returnedURL: rognee
        ))
    }

    /// Un son NEUF (aucune édition en cours) n'hérite jamais de la
    /// transcription du précédent.
    func test_survivingTranscription_aucuneÉditionEnCours_nHériteDeRien() {
        XCTAssertNil(ComposerForegroundSound.survivingTranscription(
            returned: nil, previous: transcription("ancienne"),
            editedURL: nil, returnedURL: rognee
        ))
    }
}
