import XCTest
@testable import Meeshy

/// **L'enregistrement de la barre universelle ne peut plus être SIMULÉ** (#4560).
///
/// ## Ce que la barre faisait
///
/// `startRecording()` avait deux chemins. Le délégué confie un vrai
/// `AVAudioRecorder` au parent. Le chemin **interne** n'enregistrait RIEN :
/// aucun `AVAudioRecorder`, aucune session audio, aucun fichier — un `Timer` qui
/// incrémentait un compteur. À l'arrêt il ajoutait pourtant une pièce jointe
/// `voice(duration:)` et appelait :
///
/// ```swift
/// if let url = FileManager.default.temporaryDirectory
///       .appendingPathComponent("voice_\(Int(Date().timeIntervalSince1970)).m4a") as URL? {
///     onVoiceRecord?(url, duration)
/// }
/// ```
///
/// L'URL est **fabriquée** : un chemin composé depuis l'horloge, qui ne désigne
/// aucun fichier écrit. Et le `if let … as URL?` est un cast optionnel qui
/// réussit toujours — **il a la forme d'une garde et n'en est pas une** ; le
/// lecteur suivant y lit « on a vérifié », et rien ne l'a été.
///
/// > Un repli FABRIQUÉ ne se distingue pas d'un vrai résultat. Une URL bien
/// > formée, un compteur qui avance, une pièce jointe qui apparaît : tout ce que
/// > l'écran montre est cohérent, et rien n'existe. Le mensonge n'est lisible
/// > qu'à la LECTURE du vocal, chez quelqu'un d'autre, plus tard.
///
/// ## Pourquoi le compilateur, et pas un témoin
///
/// Les quatre hôtes passent les quatre relais ; le chemin interne était donc
/// déjà inatteignable, et rien ne se payait en production. Ce qui se payait
/// était le PROCHAIN hôte : `onStartRecording` étant optionnel, l'oublier ne
/// produisait ni erreur, ni avertissement, ni écran cassé — une barre qui
/// affiche une prise, compte les secondes, et pose un vocal muet.
///
/// Le `?` code « ce relais peut légitimement manquer ». Il ne le peut pas : un
/// composer sans bouton d'enregistrement n'est pas un état du produit, c'est un
/// hôte mal câblé. Les quatre relais deviennent donc obligatoires, et **le
/// garde-fou est le compilateur** — un témoin ne rougit que si quelqu'un pense à
/// l'écrire pour le nouveau site.
final class UniversalComposerBarRecordingContractTests: XCTestCase {

    private func source(_ fichier: String) throws -> String {
        var racine = URL(fileURLWithPath: #filePath)
        for _ in 0..<4 { racine = racine.deletingLastPathComponent() }
        let url = racine.appendingPathComponent("Meeshy/Features/Main/Components/" + fichier)
        let brut = try String(contentsOf: url, encoding: .utf8)
        XCTAssertGreaterThan(brut.count, 800,
                             "source vide ou déplacée — la garde serait verte par omission : \(fichier)")
        return AppSourceGuard.stripComments(brut)
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// **Aucune URL n'est plus FABRIQUÉE.** L'interdit porte sur le motif exact,
    /// pas sur le nom du relais : un chemin composé dans le dossier temporaire
    /// et rendu comme s'il désignait un enregistrement.
    func test_aucuneURLDeVocal_nEstPlusFabriquee() throws {
        let code = compact(try source("UniversalComposerBar+Recording.swift"))
        XCTAssertFalse(code.contains("temporaryDirectory.appendingPathComponent"),
                       "une URL composée depuis l'horloge ne désigne aucun fichier écrit")
        XCTAssertFalse(code.contains("onVoiceRecord"),
                       "le relais n'avait que des sites d'appel fabriqués")
    }

    /// **Le chemin interne n'existe plus.** Le `Timer` était toute la
    /// « prise » : sans lui, il n'y a plus de compteur à faire passer pour une
    /// durée enregistrée.
    func test_leChemin_interne_nExistePlus() throws {
        let code = compact(try source("UniversalComposerBar+Recording.swift"))
        XCTAssertFalse(code.contains("Timer.scheduledTimer"),
                       "un compteur n'est pas un enregistrement")
        XCTAssertFalse(code.contains("recordingTimer"))
    }

    /// **Les quatre relais sont OBLIGATOIRES.** C'est la garde qui compte : elle
    /// rend le défaut impossible à réintroduire, là où les trois autres témoins
    /// constatent qu'il a été retiré.
    func test_lesQuatreRelais_sontObligatoires() throws {
        let code = compact(try source("UniversalComposerBar.swift"))
        for relais in ["onStartRecording", "onStopRecordingToAttachment",
                       "onSendRecording", "onCancelRecording"] {
            XCTAssertTrue(code.contains("let\(relais):()->Void"),
                          "\(relais) doit être non optionnel — le compilateur porte la garde")
            XCTAssertFalse(code.contains("var\(relais):(()->Void)?=nil"),
                           "\(relais) est redevenu facultatif")
        }
    }

    /// **L'état de la prise a UNE source : le parent.** Le miroir local
    /// (`isRecording`, `recordingDuration`) n'était plus alimenté une fois le
    /// timer parti — et `externalRecordingDuration ?? recordingDuration` aurait
    /// servi « 0:00 » comme s'il s'agissait d'une durée. C'est le repli
    /// fabriqué une seconde fois, deux lignes plus bas.
    func test_laPrise_aUneSeuleSourceDeVerite() throws {
        let code = compact(try source("UniversalComposerBar.swift"))
        XCTAssertTrue(code.contains("letexternalIsRecording:Bool"))
        XCTAssertTrue(code.contains("letexternalRecordingDuration:TimeInterval"))
        XCTAssertFalse(code.contains("@Statevarrecordingduration"),
                       "aucun miroir local que rien n'alimente")
    }
}
