import XCTest

/// Gardes d'accessibilité sur la feuille d'envoi de l'extension de partage.
///
/// `MeeshyShareExtension` est une cible `app-extension` : ses types ne sont pas
/// liables depuis ce bundle, les assertions lisent donc le source — même idiome
/// que `ConversationInfoSheetAccessibilityTests` et `CallViewAccessibilityTests`.
///
/// **Réancrées le 2026-07-29** sur la feuille autonome (`ShareTargetRow`,
/// aperçu texte/URL). Les GARANTIES sont inchangées — un seul élément par
/// rangée, sélection annoncée autrement que par la couleur, pilules tactiles sur
/// toute leur surface — seuls les noms ont suivi la réécriture. Les assertions
/// portant sur les tuiles image/vidéo/fichier/localisation ont disparu avec
/// elles : le lot 1 n'accepte que le texte et les URL.
@MainActor
final class ShareExtensionAccessibilityTests: XCTestCase {

    private func shareSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("MeeshyShareExtension/ShareViewController.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Réduit toute suite d'espaces à un seul, pour que les assertions portent
    /// sur la FORME du code et non sur son indentation — l'ancienne version de
    /// ce fichier matchait un retrait exact et se serait cassée au premier
    /// reformatage sans qu'aucune garantie ne soit perdue.
    private func condensed(_ source: String) -> String {
        source.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    /// Corps d'un membre, borné par le membre suivant. Nécessaire pour compter
    /// des occurrences : la feuille contient TROIS `Button` (les deux boutons
    /// d'action et la rangée de conversation), donc un décompte sur le fichier
    /// entier mesurerait autre chose que ce qu'il prétend.
    private func member(_ signature: String, in source: String) throws -> String {
        guard let range = source.range(of: signature) else {
            XCTFail("ShareViewController doit déclarer \(signature)")
            return ""
        }
        let rest = source[range.upperBound...]
        let end = rest.range(of: "\n    private ")?.lowerBound ?? source.endIndex
        return String(rest[..<end])
    }

    /// Corps d'une déclaration de type, borné par la suivante. Préféré à une
    /// fenêtre de N caractères : un span figé cesse silencieusement de couvrir
    /// la fin du type à mesure qu'il grossit, et peut déborder sur son voisin.
    private func declaration(of typeName: String, in source: String) throws -> String {
        let anchor = "struct \(typeName): View"
        guard let range = source.range(of: anchor) else {
            XCTFail("ShareViewController doit déclarer \(typeName)")
            return ""
        }
        let rest = source[range.upperBound...]
        let end = rest.range(of: "\nstruct ")?.lowerBound ?? source.endIndex
        return String(rest[..<end])
    }

    // MARK: - Rangée de conversation

    func test_conversationRow_exposesSingleAccessibilityElementNamedAfterTheConversation() throws {
        // La rangée est faite d'une pastille d'initiales, d'un nom et d'une
        // coche. Sans élément explicite, VoiceOver s'arrête sur chaque fragment
        // et ne dit jamais que c'est la rangée entière qu'on active.
        let row = condensed(try declaration(of: "ShareTargetRow", in: try shareSource()))

        XCTAssertTrue(
            row.contains(".accessibilityElement(children: .ignore)"),
            "ShareTargetRow doit replier pastille/nom/coche en un seul élément."
        )
        XCTAssertTrue(
            row.contains(".accessibilityLabel(target.displayName)"),
            "Le nom accessible de la rangée doit être celui de la conversation."
        )
    }

    func test_conversationRow_announcesSelectionBeyondColour() throws {
        // La sélection ne tenait qu'à une teinte et une coche — couleur et forme
        // seules (WCAG 1.4.1). Le trait `.isSelected` laisse iOS annoncer l'état
        // dans la langue de l'utilisateur, sans nouvelle clé i18n.
        let row = condensed(try declaration(of: "ShareTargetRow", in: try shareSource()))

        XCTAssertTrue(
            row.contains(".accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : [.isButton])"),
            "La conversation sélectionnée doit porter le trait .isSelected."
        )
    }

    func test_conversationRow_isActivatedByARealButton() throws {
        // `.onTapGesture` sur un conteneur nu ne donne ni trait .isButton, ni
        // retour d'appui, ni focus Full Keyboard Access. Un vrai Button, si.
        let source = try shareSource()

        XCTAssertFalse(
            source.contains(".onTapGesture"),
            "La sélection doit passer par un Button, pas par un .onTapGesture nu."
        )

        let list = condensed(source)
        XCTAssertTrue(
            list.contains("selectedId = target.id") && list.contains(".buttonStyle(.plain)"),
            "La rangée doit être enveloppée dans un Button en .buttonStyle(.plain), "
            + "pour gagner le comportement natif sans changer son apparence."
        )
    }

    // MARK: - Aperçu du contenu partagé

    func test_contentPreview_exposesOneNamedElementCarryingTheSharedText() throws {
        // L'aperçu est un symbole SF décoratif plus le contenu. Non replié,
        // VoiceOver annonce le glyphe (« Doc Text Fill ») comme du contenu.
        let view = condensed(try declaration(of: "ShareContentView", in: try shareSource()))

        XCTAssertTrue(
            view.contains(".accessibilityElement(children: .ignore)"),
            "L'aperçu doit replier glyphe et texte en un seul élément."
        )
        XCTAssertTrue(
            view.contains(".accessibilityLabel(isLink(content)"),
            "L'aperçu doit être nommé d'après le TYPE partagé (lien ou texte)."
        )
        XCTAssertTrue(
            view.contains(".accessibilityValue(content)"),
            "Replier l'aperçu ne doit pas escamoter le contenu partagé : il va dans la valeur."
        )
    }

    /// Le lot 1 n'accepte que deux natures de contenu ; les deux doivent être
    /// nommées, sinon un aperçu resterait muet.
    func test_contentPreview_namesBothShippedContentKinds() throws {
        let source = try shareSource()

        for key in ["share.type.text", "share.type.url"] {
            XCTAssertTrue(
                source.contains("\"\(key)\""),
                "\(key) doit nommer l'aperçu correspondant."
            )
        }
    }

    /// Corollaire de la portée annoncée : aucune clé de type non expédié ne doit
    /// subsister dans le code, sinon l'écran prétendrait savoir traiter un
    /// contenu que l'`Info.plist` n'accepte plus.
    func test_contentPreview_doesNotNameUnshippedContentKinds() throws {
        let source = try shareSource()

        for key in ["share.type.image", "share.type.video", "share.type.file", "share.type.location"] {
            XCTAssertFalse(
                source.contains("\"\(key)\""),
                "\(key) désigne un type que le lot 1 n'accepte pas — l'Info.plist ne l'annonce plus."
            )
        }
    }

    // MARK: - Titre de section

    func test_sendToHeading_isExposedToTheRotor() throws {
        let view = condensed(try declaration(of: "ShareContentView", in: try shareSource()))

        guard let headingRange = view.range(of: "share.sendTo") else {
            return XCTFail("La feuille doit porter un titre de section « Envoyer à »")
        }
        let after = view[headingRange.upperBound...].prefix(300)

        XCTAssertTrue(
            after.contains(".accessibilityAddTraits(.isHeader)"),
            "Le titre « Envoyer à » doit porter .isHeader pour que le rotor Titres y saute."
        )
    }

    // MARK: - Boutons d'action

    func test_actionButtons_areLocalized() throws {
        let source = try shareSource()

        XCTAssertFalse(
            source.contains("Button(\"Cancel\")") || source.contains("Button(\"Send\")"),
            "Les boutons d'action ne doivent pas porter de littéral brut."
        )
        for key in ["share.cancel", "share.send", "share.title"] {
            XCTAssertTrue(
                source.contains("String(localized: \"\(key)\""),
                "\(key) doit être déclarée en String(localized:defaultValue:)."
            )
        }
    }

    func test_sendButton_labelStaysLegibleWhileDisabled() throws {
        // Le label était figé à .white par-dessus un fond Color.secondary
        // opacité 0,2 tant qu'aucune conversation n'était choisie — blanc sur
        // quasi-blanc, ~1,2:1, le bouton paraissait vide.
        let source = condensed(try shareSource())

        XCTAssertTrue(
            source.contains(".foregroundStyle(canSend ? Color.white : Color.secondary)"),
            "La couleur du label d'envoi doit suivre son état actif ; .white sur le fond "
            + "gris désactivé échoue à WCAG 1.4.3."
        )
    }

    func test_actionButtons_areTappableAcrossTheirWholePill() throws {
        // `.frame(maxWidth:).padding()` appliqués À L'EXTÉRIEUR d'un Button
        // dessinent la pilule mais laissent la zone tactile sur le seul glyphe.
        // À l'intérieur du label, c'est toute la pilule de 44 pt qui répond.
        let bar = condensed(try member("private var actionBar: some View", in: try shareSource()))

        XCTAssertEqual(
            bar.components(separatedBy: "} label: {").count - 1, 2,
            "Les deux boutons d'action doivent utiliser la forme à label fermant."
        )
        XCTAssertEqual(
            bar.components(separatedBy: ".frame(maxWidth: .infinity) .padding()").count - 1, 2,
            "Les deux boutons doivent porter .frame(maxWidth: .infinity) et .padding() DANS "
            + "leur label, pour que toute la pilule soit tactile et pas seulement le texte."
        )
    }
}
