import Testing
import Foundation
@testable import MeeshyUI

/// #7362 — ouvrir un document (fichier générique) depuis le fil doit remonter
/// sa consommation pour que l'onglet « Ouvert » de « Vu par » s'alimente.
///
/// `AttachmentConsumptionResolver.primaryAction` (MeeshySDK) ne tient qu'UNE
/// action pour un fichier générique : `.downloaded` — il n'existe aucune
/// action « opened » côté passerelle (`AttachmentStatusBodySchema` gateway).
/// `DocumentFullSheet.saveDocument()` la reportait déjà, mais seulement sur le
/// bouton Enregistrer explicite : simplement LIRE le document dans la fiche ne
/// reportait rien. `DocumentOpenReport` est le même corps, posé à l'ouverture.
struct DocumentOpenReportTests {

    @Test("propre message → aucun rapport, même en ouvrant la fiche")
    func ownDocumentStaysSilent() {
        #expect(DocumentOpenReport.bodyForOpening(isMine: true) == nil)
    }

    @Test("document reçu → rapport 'downloaded', le seul marqueur que le serveur tient pour un fichier")
    func receivedDocumentReports() {
        let body = DocumentOpenReport.bodyForOpening(isMine: false)
        #expect(body?.action == "downloaded")
        #expect(body?.complete == true)
    }
}

/// Garde de CÂBLAGE : la règle ci-dessus peut être juste et n'être appelée par
/// personne — le défaut #7362 exact (seul le bouton Enregistrer rapportait).
struct DocumentOpenReportWiringTests {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    @Test("DocumentFullSheet demande la règle à l'apparition de la fiche, pas seulement au bouton Enregistrer")
    func fullSheetAsksTheRuleOnAppear() throws {
        let source = try sdkSource("Sources/MeeshyUI/Media/DocumentViewerView.swift")
        #expect(source.contains("DocumentOpenReport.bodyForOpening("))
        #expect(source.contains(".onAppear"))
    }
}
