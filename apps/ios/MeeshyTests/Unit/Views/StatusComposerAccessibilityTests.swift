import XCTest
@testable import Meeshy

/// La flèche de publication du mood échangeait son libellé contre un
/// `ProgressView` nu pendant l'envoi. Un bouton dont l'unique enfant est un
/// `ProgressView` sans nom n'a AUCUN nom accessible : VoiceOver n'annonçait donc
/// rien à l'instant précis où l'action tournait.
///
/// Le correctif d'origine épinglait le nom à l'ACTION et portait les états
/// transitoire et bloqué en `accessibilityValue` + `accessibilityHint`.
///
/// **RE-VISÉE au lot 4.8**, avec sa raison d'origine intacte. Elle lisait
/// `StatusComposerView.swift`, retiré par ce lot ; l'affordance livrée est
/// `MeeshyComposerHost.publishButton`, la flèche du socle, qui sert les six
/// déclencheurs du mood depuis le lot 4.6. La laisser sur l'ancien chemin
/// l'aurait fait ÉCHOUER à la lecture ; la supprimer aurait perdu la seule
/// mesure qui interdit de réintroduire l'échange de libellé.
///
/// Ce qu'elle mesure et que `MeeshyComposerHostGuardTests
/// .test_laFlecheDuSocle_porteSonEtatAccessible` ne mesure pas : le NOM que le
/// bouton garde pendant l'envoi. Cette garde-là vérifie la valeur et l'indice ;
/// elle est verte sur un bouton devenu anonyme.
@MainActor
final class StatusComposerAccessibilityTests: XCTestCase {

    private func hostSource() throws -> String {
        return try AppSourceGuard.composerHostSource()
    }

    /// Le CORPS d'une déclaration, par appariement d'accolades — et non une
    /// fenêtre de N caractères : la flèche du socle est suivie d'autres membres,
    /// et une fenêtre les avalerait, si bien qu'un modificateur posé sur le
    /// voisin satisferait une assertion portant sur elle.
    private func declarationBody(startingAt anchor: String, in source: String) throws -> String {
        guard let start = source.range(of: anchor) else {
            XCTFail("MeeshyComposerHost doit contenir \(anchor) — la garde ne mesurerait RIEN.")
            return ""
        }
        guard let open = source[start.upperBound...].firstIndex(of: "{") else { return "" }
        var depth = 0
        var index = open
        while index < source.endIndex {
            if source[index] == "{" { depth += 1 }
            if source[index] == "}" {
                depth -= 1
                if depth == 0 { return String(source[open ... index]) }
            }
            index = source.index(after: index)
        }
        return ""
    }

    /// **Ce que le bouton MONTRE** — son libellé, partagé par les deux flèches
    /// depuis le #4995. Le socle et l'en-tête du mood composaient chacun le
    /// leur, avec deux glyphes déjà divergents ; ils lisent désormais un seul
    /// site, et cette garde le suit.
    private func publishLabelBody() throws -> String {
        try declarationBody(startingAt: "var publishCapsuleLabel: some View", in: try hostSource())
    }

    /// **Ce que le bouton DÉCLARE** — l'habillage, qui porte le verre, le gate
    /// et les trois attributs d'accessibilité.
    ///
    /// > Une garde de source ancre sur une PLACE, pas sur une propriété : elle
    /// > ne distingue pas « ce site a perdu sa protection » de « la protection
    /// > a déménagé chez un voisin ». Les deux se lisent comme l'absence d'une
    /// > chaîne, et c'est pourquoi une factorisation qui RENFORCE une règle
    /// > fait rougir la garde qui la protégeait.
    ///
    /// `MeeshyComposerHostGuardTests.test_laFlecheDuSocle_estUnBouton_gateEtBranche`
    /// exige en retour que chaque flèche passe par cet habillage — sans quoi le
    /// déménagement coûterait à cette suite la moitié de sa portée, en silence.
    private func publishCapsuleBody() throws -> String {
        try declarationBody(startingAt: "func publishCapsule<Contenu: View>", in: try hostSource())
    }

    func test_publishButton_keepsAccessibleNameWhilePublishing() throws {
        let body = try publishLabelBody()
        XCTAssertTrue(
            body.contains("Text(\"composer.socle.publish\""),
            "La flèche doit porter un libellé TEXTE issu du catalogue : c'est lui qui lui donne son nom " +
            "accessible, et il ne change pas pendant l'envoi."
        )
        XCTAssertFalse(
            body.contains("ProgressView"),
            "La flèche échange son libellé contre un `ProgressView` nu : le bouton perd son nom accessible " +
            "à l'instant précis où il est occupé — le défaut que l'écran historique du mood avait corrigé, " +
            "et que le socle ne doit pas réintroduire. L'état en vol est porté par `accessibilityValue`."
        )
    }

    func test_publishButton_announcesPublishingState() throws {
        XCTAssertTrue(
            try publishCapsuleBody().contains("ComposerSocleCopy.publishInProgress"),
            "La flèche doit exposer son état EN VOL en `accessibilityValue` : sans lui, l'occupation n'est " +
            "portée que par la teinte."
        )
        XCTAssertTrue(
            try hostSource().contains("a11y.status.publish.in-progress"),
            "… et cette valeur passe par le catalogue : un littéral posé ici échapperait au cliquet de " +
            "complétude et ne serait jamais traduit."
        )
    }

    func test_publishButton_explainsWhyItIsDisabled() throws {
        XCTAssertTrue(
            try publishCapsuleBody().contains(".accessibilityHint(publishBlockedHint)"),
            "La flèche doit dire POURQUOI elle refuse : le dégradé éteint ne le porte que visuellement."
        )
        let hint = try declarationBody(startingAt: "var publishBlockedHint: String", in: try hostSource())
        XCTAssertTrue(
            hint.contains("guard !canPublishDocument"),
            "L'indice doit être CONDITIONNEL au refus, sinon il est annoncé sur une flèche actionnable."
        )
        XCTAssertTrue(
            try hostSource().contains("a11y.status.publish.disabled.hint"),
            "La phrase du refus vient du catalogue, et c'est celle du mood — la seule déjà traduite dans " +
            "les sept locales."
        )
    }

    func test_newAccessibilityKeysAreFullyLocalized() throws {
        let catalogURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Localizable.xcstrings")
        let data = try Data(contentsOf: catalogURL)
        let catalog = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let strings = catalog?["strings"] as? [String: Any] ?? [:]
        let supportedLocales: Set<String> = ["ar", "de", "en", "es", "fr", "it", "pt-BR"]

        for key in ["a11y.status.publish.in-progress", "a11y.status.publish.disabled.hint"] {
            let entry = strings[key] as? [String: Any]
            let localizations = entry?["localizations"] as? [String: Any] ?? [:]
            XCTAssertEqual(
                Set(localizations.keys), supportedLocales,
                "\(key) must ship translated in every locale the app supports — an accessibility string " +
                "left untranslated is read out in the wrong language by VoiceOver."
            )
        }
    }
}
