import Foundation
import XCTest
@testable import Meeshy

/// **Un `@State` semé seulement par un `onChange` n'a pas de valeur initiale :
/// il a celle du DERNIER usage de la vue.**
///
/// `AudioMediaView.selectedAudioLangCode` gouverne trois choses — la piste
/// jouée (`currentAudioUrl`), la nature du média téléchargé
/// (`currentMediaKind`) et le drapeau actif du pied (`audioFooter`) — et il est
/// passé au player en `externalLanguage:`. Il n'était semé nulle part : son
/// unique écrivain, `adaptiveOnChange(of: activeAudioLanguageOverride)`, porte
/// `initial: false` et ne tire donc pas à la première apparition.
///
/// Sur une liste ordinaire, cela n'aurait produit qu'une incohérence de départ
/// (le pied sur la V.O., la piste sur le Prisme). Le fil de messages, lui,
/// configure ses cellules par `UIHostingConfiguration` mise à jour EN PLACE :
/// l'identité SwiftUI du sous-arbre ne change pas au recyclage, donc l'état
/// survit d'un message au suivant. Le verrou d'entrée du player
/// (`guard code != selectedAudioLanguage`) comparait alors la bascule demandée
/// à un HÉRITAGE, et l'avalait — « le premier marche, le suivant non »
/// (retour porteur 2026-09-13).
///
/// La garde tient DEUX faits, parce que l'un sans l'autre ne protège rien :
/// que le semis existe, et qu'il soit porté par l'identité de l'attachment.
/// Un semis sans identité ne serait rejoué à aucun recyclage — exactement la
/// panne — et une identité sans semis ne poserait rien.
final class AudioLanguageSeedingSourceGuardTests: XCTestCase {

    private var source: String {
        get throws {
            let url = URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()  // Views
                .deletingLastPathComponent()  // Unit
                .deletingLastPathComponent()  // MeeshyTests
                .deletingLastPathComponent()  // ios
                .appendingPathComponent("Meeshy/Features/Main/Views/ConversationMediaViews.swift")
            return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        }
    }

    /// Sans cette assertion, un chemin faux rendrait toute la suite VERTE PAR
    /// OMISSION : `contains` sur une chaîne vide est faux pour l'interdit et
    /// vrai pour rien.
    func test_laGardeLitUneSourceNonVide() throws {
        let text = try source
        XCTAssertGreaterThan(text.count, 10_000)
        XCTAssertTrue(text.contains("selectedAudioLangCode"),
            "La garde ne lit plus la vue qui porte l'état — chemin cassé ou état renommé.")
    }

    func test_laLangueAudio_estSemeeParLidentiteDeLattachment() throws {
        let text = try source
        guard let start = text.range(of: ".task(id: attachment.id)") else {
            return XCTFail("""
                Aucun semis porté par `attachment.id`. Sans lui, `selectedAudioLangCode` \
                garde la langue du message précédent sur toute cellule recyclée, et le \
                verrou du player avale la bascule suivante.
                """)
        }
        // La portée du `.task` : jusqu'à l'accolade de fermeture au même niveau
        // d'indentation. On se contente du bloc qui suit immédiatement, ce que
        // le semis occupe.
        let body = text[start.upperBound...].prefix(400)
        XCTAssertTrue(body.contains("selectedAudioLangCode ="), """
            Le `.task(id: attachment.id)` existe mais ne sème pas la langue. \
            Un semis posé ailleurs ne serait pas rejoué au recyclage.
            """)
    }

    /// **Le semis DÉRIVE de la loi, il ne devine pas.**
    /// `resolvedPreferredTranscriptionLanguage` projette
    /// `AudioTrackLanguageResolver.resolve`, la même descente que le player
    /// reçoit en `initialTranscriptionLanguage` et que le coordinateur applique
    /// à la lecture. Semer une constante (`nil`, la V.O.) réintroduirait
    /// l'écart pied/piste que ce lot ferme.
    func test_leSemis_deriveDeLaLoiPartagee_jamaisDuneConstante() throws {
        let text = try source
        guard let start = text.range(of: ".task(id: attachment.id)") else {
            return XCTFail("Semis absent — voir le témoin précédent.")
        }
        let body = text[start.upperBound...].prefix(400)
        XCTAssertTrue(body.contains("selectedAudioLangCode = resolvedPreferredTranscriptionLanguage"), """
            Le semis n'est pas dérivé de `resolvedPreferredTranscriptionLanguage`. \
            Le pied afficherait une langue que la piste ne joue pas.
            """)
    }

    /// Le player reste alimenté par CET état : si un lot le débranchait, le
    /// semis ci-dessus deviendrait décoratif et la garde, verte pour rien.
    func test_letatSeme_estBienCeluiQueLePlayerRecoit() throws {
        XCTAssertTrue(try source.contains("externalLanguage: $selectedAudioLangCode"), """
            L'état semé n'alimente plus le player : la garde ne mesure plus le \
            chemin qu'elle protège.
            """)
    }
}
