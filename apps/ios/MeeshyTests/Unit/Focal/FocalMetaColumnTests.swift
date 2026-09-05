import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK

/// #5135 — **la date et l'accusé se posent au bas de la bulle, en colonne.**
///
/// Directive porteur 2026-09-04 : « il faudrait mettre la date et coche au
/// niveau de la bulle et non sur une ligne […] un composant de deux colonnes
/// dont la seconde colonne alignée en bas contient la date et l'information de
/// réception si nécessaire ! ce qui permet d'éviter quelques lignes blanches
/// inutiles ! »
///
/// **Ce que ces témoins mesurent, et pourquoi ce n'est pas du rendu.** Le
/// contrat Focal §7 pose « R15 — aucun snapshot, aucun test de rendu ». Le gain
/// demandé est pourtant VISUEL : une ligne qui disparaît. Il se prouve par la
/// RÈGLE qui décide de monter cette ligne — extraite ici précisément pour
/// cesser d'être un `if` inline qu'aucune assertion ne peut atteindre.
@MainActor
final class FocalMetaColumnTests: XCTestCase {

    // MARK: - La règle qui VIDE la ligne basse

    /// **Le cas nominal, et la raison d'être du lot.** Un message sans
    /// traduction et sans réaction ne monte plus AUCUNE ligne basse.
    ///
    /// Avant ce lot, cette ligne se montait toujours — le commentaire de
    /// `flagAndReactionsRow` le disait sans détour : « elle se monte TOUJOURS,
    /// même sans drapeau ni réaction : c'est elle qui porte désormais la méta ».
    /// La méta partie en colonne, la justification tombe avec elle.
    func test_sansDrapeauNiReaction_aucuneLigneBasse() {
        XCTAssertFalse(FocalMetaColumn.mountsBottomLine(
            hasTranslation: false, isBlurred: false, isLastInGroup: true, hasReactions: false))
    }

    /// Une traduction sur la FIN d'un groupe porte les drapeaux (#3919) — la
    /// ligne existe alors, et elle a quelque chose à montrer.
    func test_uneTraductionEnFinDeGroupe_monteLaLigne() {
        XCTAssertTrue(FocalMetaColumn.mountsBottomLine(
            hasTranslation: true, isBlurred: false, isLastInGroup: true, hasReactions: false))
    }

    /// **Jamais de drapeau EN CLAIR sur un message protégé** (revue
    /// adversariale 2026-08-18) : révéler la langue d'origine d'un message
    /// voilé fuiterait une information. La règle extraite doit porter cette
    /// garde, sans quoi l'extraction l'aurait perdue en route.
    func test_unMessageVOILE_neMontePasSesDrapeaux() {
        XCTAssertFalse(FocalMetaColumn.mountsBottomLine(
            hasTranslation: true, isBlurred: true, isLastInGroup: true, hasReactions: false))
    }

    /// UN SEUL jeu de drapeaux par groupe, sur son DERNIER message (#3919).
    func test_uneTraductionHorsFinDeGroupe_neMontePas() {
        XCTAssertFalse(FocalMetaColumn.mountsBottomLine(
            hasTranslation: true, isBlurred: false, isLastInGroup: false, hasReactions: false))
    }

    /// Les réactions restent HORS voile — parité bulle historique : un message
    /// voilé sans drapeau garde quand même sa ligne si on y a réagi.
    func test_desReactionsSurUnMessageVOILE_montentQuandMemeLaLigne() {
        XCTAssertTrue(FocalMetaColumn.mountsBottomLine(
            hasTranslation: true, isBlurred: true, isLastInGroup: true, hasReactions: true))
    }

    func test_desReactionsSeules_montentLaLigne() {
        XCTAssertTrue(FocalMetaColumn.mountsBottomLine(
            hasTranslation: false, isBlurred: false, isLastInGroup: false, hasReactions: true))
    }

    // MARK: - La largeur RÉSERVÉE

    /// **Arbitrage porteur du 2026-09-04 : largeur réservée pour toutes.** Le
    /// texte a la même laisse partout et les dates s'alignent verticalement
    /// d'un message à l'autre.
    ///
    /// Le témoin porte sur l'EXISTENCE d'une constante partagée, pas sur sa
    /// valeur : une largeur recalculée par rangée est exactement ce que
    /// l'arbitrage écarte, et c'est la seule forme qu'une assertion puisse
    /// distinguer sans monter de vue.
    func test_laColonne_reserveUneLargeurStrictementPositive() {
        XCTAssertGreaterThan(FocalMetrics.MetaColumn.reservedWidth, 0)
    }

    /// La colonne doit tenir « 88:88 » plus deux coches sans tronquer — sous
    /// une cinquantaine de points, l'heure s'élide et la mesure ne dit plus
    /// rien. Au-delà d'une centaine, elle vole au texte plus qu'elle ne rend.
    func test_laLargeurReservee_tientUneHeureEtSesCoches_sansVolerLeTexte() {
        XCTAssertGreaterThanOrEqual(FocalMetrics.MetaColumn.reservedWidth, 50)
        XCTAssertLessThanOrEqual(FocalMetrics.MetaColumn.reservedWidth, 100)
    }

    // MARK: - Ce que la colonne MONTE

    /// **« si nécessaire »** — l'accusé de réception ne concerne que ce qu'on a
    /// envoyé soi-même. Un message reçu porte sa date, jamais de coche.
    func test_unMessageRECU_neMontreAucuneCoche() {
        XCTAssertFalse(FocalMetaColumn.showsDeliveryChecks(isMe: false, hasStatus: true))
    }

    func test_unMessageENVOYE_avecStatut_montreSesCoches() {
        XCTAssertTrue(FocalMetaColumn.showsDeliveryChecks(isMe: true, hasStatus: true))
    }

    /// Un envoi dont le statut n'est pas encore connu ne peint rien — pas une
    /// coche grise « par défaut », qui mentirait sur un état non su.
    func test_unEnvoiSansStatutConnu_neMontreAucuneCoche() {
        XCTAssertFalse(FocalMetaColumn.showsDeliveryChecks(isMe: true, hasStatus: false))
    }
}

/// #5135 — gardes de SOURCE : la géographie demandée se lit dans le code, pas
/// dans un rendu (contrat Focal §7, R15).
final class FocalMetaColumnSourceGuardTests: XCTestCase {

    private func rowSource(_ fileName: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Focal/Row/\(fileName)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// **Les deux colonnes existent, et la seconde s'aligne en BAS.** C'est la
    /// forme exacte que la directive demande ; un `.top` ou un `.center`
    /// poserait la date au niveau de la première ligne du texte.
    func test_focalRow_composeDeuxColonnes_alignéesEnBas() throws {
        let stripped = AppSourceGuard.stripComments(try rowSource("FocalRow.swift"))
        XCTAssertTrue(stripped.contains("HStack(alignment: .bottom"),
                      "FocalRow.swift doit composer la bulle et sa méta en DEUX colonnes alignées en bas")
        XCTAssertTrue(stripped.contains("FocalMetaColumn("),
                      "FocalRow.swift doit monter FocalMetaColumn")
    }

    /// **La méta ne se monte plus SUR la ligne basse.** Sans cette garde, un
    /// retour en arrière rendrait la ligne basse à nouveau inconditionnelle
    /// sans qu'aucun test de valeur ne tombe : les deux dispositions
    /// compilent, et seule celle-ci récupère le blanc.
    func test_focalRow_neMonteplusLaMetaSurLaLigneBasse() throws {
        let stripped = AppSourceGuard.stripComments(try rowSource("FocalRow.swift"))
        XCTAssertFalse(stripped.contains("FocalMetaRow("),
                       "FocalRow.swift ne doit plus monter FocalMetaRow directement — elle vit dans FocalMetaColumn")
    }

    /// La ligne basse est CONDITIONNELLE, et sa condition est la règle
    /// éprouvée ci-dessus — jamais un `if` réécrit sur place.
    func test_laLigneBasse_passeParLaRegleEprouvee() throws {
        let stripped = AppSourceGuard.stripComments(try rowSource("FocalRow.swift"))
        XCTAssertTrue(stripped.contains("mountsBottomLine("),
                      "FocalRow.swift doit décider de la ligne basse via FocalMetaColumn.mountsBottomLine")
    }
}
