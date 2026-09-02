import XCTest
@testable import MeeshyUI

/// La règle qui décide QUELLE ligne de transcription s'allume (#4657).
///
/// Elle est écrite à part de la vue parce que c'est elle qui se trompe : le
/// défilement n'est qu'un `scrollTo` sur l'index qu'elle rend.
final class AudioTranscriptCueTests: XCTestCase {

    private func cues() -> [AudioTranscriptCue] {
        [
            AudioTranscriptCue(id: 0, text: "Bonjour", start: 0, end: 2),
            AudioTranscriptCue(id: 1, text: "on se voit demain", start: 2, end: 5),
            AudioTranscriptCue(id: 2, text: "à midi", start: 5, end: 8)
        ]
    }

    func test_activeIndex_auMilieuDUneLigne_rendCetteLigne() {
        XCTAssertEqual(AudioTranscriptCue.activeIndex(in: cues(), at: 3.4), 1)
    }

    /// **Le témoin de la frontière.** `end` de l'une vaut `start` de l'autre :
    /// sans borne haute EXCLUE, l'instant 2 appartiendrait aux deux et la
    /// surbrillance clignoterait à chaque passage.
    func test_activeIndex_àLInstantDeBascule_rendLaLigneQuiCOMMENCE() {
        XCTAssertEqual(AudioTranscriptCue.activeIndex(in: cues(), at: 2), 1)
        XCTAssertEqual(AudioTranscriptCue.activeIndex(in: cues(), at: 5), 2)
    }

    func test_activeIndex_avantLaPremièreLigne_nAllumeRien() {
        let tardives = [AudioTranscriptCue(id: 0, text: "Bonjour", start: 1.5, end: 3)]
        XCTAssertNil(AudioTranscriptCue.activeIndex(in: tardives, at: 0.4))
    }

    func test_activeIndex_aprèsLaDernièreLigneDATÉE_nAllumeRien() {
        XCTAssertNil(AudioTranscriptCue.activeIndex(in: cues(), at: 9))
    }

    /// Une transcription saisie à la main n'a AUCUN minutage : elle se lit sans
    /// jamais s'allumer. C'est le cas nominal des boutons « Rédiger » et
    /// « Coller », donc pas un cas limite.
    func test_activeIndex_lignesSansMinutage_nAllumentJamais() {
        let manuelles = [
            AudioTranscriptCue(id: 0, text: "Écrit à la main"),
            AudioTranscriptCue(id: 1, text: "sur deux lignes")
        ]
        XCTAssertNil(AudioTranscriptCue.activeIndex(in: manuelles, at: 0))
        XCTAssertNil(AudioTranscriptCue.activeIndex(in: manuelles, at: 42))
    }

    /// Sans `end`, une ligne court jusqu'au départ de la SUIVANTE — pas jusqu'à
    /// un trou noir entre les deux.
    func test_activeIndex_sansBorneHaute_courtJusquAuDépartSuivant() {
        let partielles = [
            AudioTranscriptCue(id: 0, text: "un", start: 0),
            AudioTranscriptCue(id: 1, text: "deux", start: 4)
        ]
        XCTAssertEqual(AudioTranscriptCue.activeIndex(in: partielles, at: 3.9), 0)
        XCTAssertEqual(AudioTranscriptCue.activeIndex(in: partielles, at: 4), 1)
    }

    /// **La DERNIÈRE ligne sans `end` court jusqu'à la fin du son.** C'est le
    /// seul moment où l'utilisateur regarde encore le texte : l'éteindre là
    /// serait le pire endroit possible.
    func test_activeIndex_dernièreLigneOuverte_resteAlluméeJusquAuBout() {
        let partielles = [
            AudioTranscriptCue(id: 0, text: "un", start: 0, end: 2),
            AudioTranscriptCue(id: 1, text: "deux", start: 2)
        ]
        XCTAssertEqual(AudioTranscriptCue.activeIndex(in: partielles, at: 900), 1)
    }

    func test_activeIndex_aucuneLigne_rendNil() {
        XCTAssertNil(AudioTranscriptCue.activeIndex(in: [], at: 1))
    }

    /// L'horloge MONTRÉE ne passe jamais par `String(format:)` — les chiffres
    /// suivent la locale. Contre-épreuve minimale : la borne négative (une tête
    /// de lecture peut valoir `-0.0`) ne produit pas « -1:00 ».
    func test_horloge_valeurNonFinieOuNégative_rendZéro() {
        XCTAssertEqual(MeeshyAudioTranscriptPlayer.horloge(-4),
                       MeeshyAudioTranscriptPlayer.horloge(0))
        XCTAssertEqual(MeeshyAudioTranscriptPlayer.horloge(.nan),
                       MeeshyAudioTranscriptPlayer.horloge(0))
    }
}

/// **Le regroupement des segments en phrases** — la granularité que l'œil suit.
///
/// La reconnaissance sur appareil segmente par MOT. Le minutage est exact ; ce
/// qui ne l'est pas, c'est de rendre une ligne par mot. Mesuré au simulateur le
/// 2026-09-01 : une colonne « OK, / dans / tous » d'un mot de large.
final class AudioTranscriptPhraseTests: XCTestCase {

    private func mots(_ liste: [(String, Double, Double)]) -> [AudioTranscriptCue] {
        liste.enumerated().map { index, m in
            AudioTranscriptCue(id: index, text: m.0, start: m.1, end: m.2)
        }
    }

    func test_phrases_desMotsCourts_seRegroupentEnUneLigne() {
        let lignes = AudioTranscriptCue.phrases(from: mots([
            ("OK,", 0, 0.4), ("dans", 0.4, 0.7), ("tous", 0.7, 1.0), ("les", 1.0, 1.2), ("cas", 1.2, 1.6)
        ]))
        XCTAssertEqual(lignes.count, 1)
        XCTAssertEqual(lignes.first?.text, "OK, dans tous les cas")
    }

    /// **La phrase hérite du DÉBUT du premier mot et de la FIN du dernier.**
    /// Sans cela, elle s'éteindrait au premier mot prononcé — c'est-à-dire au
    /// moment précis où le lecteur commence à la lire.
    func test_phrases_héritentDesBornesDuPREMIEREtDuDERNIERMot() {
        let lignes = AudioTranscriptCue.phrases(from: mots([
            ("Bonjour", 0, 0.5), ("tout", 0.5, 0.8), ("le", 0.8, 0.9), ("monde", 0.9, 1.4)
        ]))
        XCTAssertEqual(lignes.first?.start, 0)
        XCTAssertEqual(lignes.first?.end, 1.4)
        XCTAssertEqual(AudioTranscriptCue.activeIndex(in: lignes, at: 1.2), 0)
    }

    /// Une fin de phrase coupe, MÊME courte : c'est la frontière que l'auteur a
    /// dictée, et elle prime sur le remplissage de la ligne.
    func test_phrases_uneFinDePhrase_coupeMêmeCourte() {
        let lignes = AudioTranscriptCue.phrases(from: mots([
            ("Salut.", 0, 0.5), ("Ça", 0.5, 0.8), ("va", 0.8, 1.2)
        ]))
        XCTAssertEqual(lignes.map(\.text), ["Salut.", "Ça va"])
    }

    /// Sinon on coupe AVANT de dépasser — jamais après, sinon la ligne déborde
    /// de la carte au lieu d'y tenir.
    func test_phrases_coupentAVANTDeDépasserLaLargeur() {
        let longs = mots((0..<6).map { i in ("motdedixc\(i)", Double(i), Double(i) + 1) })
        let lignes = AudioTranscriptCue.phrases(from: longs, maxCharacters: 24)
        XCTAssertGreaterThan(lignes.count, 1)
        for ligne in lignes {
            XCTAssertLessThanOrEqual(ligne.text.count, 24, "« \(ligne.text) » déborde de la carte")
        }
    }

    /// Les identités sont RENUMÉROTÉES sur les phrases : ce sont elles que le
    /// défilement vise, pas les segments dont elles sont faites.
    func test_phrases_portentDesIdentitésCONTIGUËS() {
        let lignes = AudioTranscriptCue.phrases(from: mots([
            ("Un.", 0, 1), ("Deux.", 1, 2), ("Trois.", 2, 3)
        ]))
        XCTAssertEqual(lignes.map(\.id), [0, 1, 2])
    }

    func test_phrases_aucunSegment_rendAucuneLigne() {
        XCTAssertTrue(AudioTranscriptCue.phrases(from: []).isEmpty)
    }

    /// Un segment vide ou blanc ne fabrique pas une ligne vide — la carte
    /// afficherait un trou au milieu du texte.
    func test_phrases_segmentsVides_neFabriquentPasDeLigneVide() {
        let lignes = AudioTranscriptCue.phrases(from: [
            AudioTranscriptCue(id: 0, text: "   ", start: 0, end: 1),
            AudioTranscriptCue(id: 1, text: "Bonjour", start: 1, end: 2)
        ])
        XCTAssertEqual(lignes.map(\.text), ["Bonjour"])
    }
}
