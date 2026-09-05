import XCTest

/// Garde de forme pour #3927 : le bouton d'envoi apparaît/disparaît en
/// tourbillon (grossit+tourne à l'arrivée, rétrécit+tourne en sens inverse
/// au départ) ; à défaut de contenu à envoyer, le même emplacement (44×44)
/// affiche deux boutons emoji rapides — les 2 plus utilisés, sourcés par
/// `EmojiUsageTracker` (même mécanisme que les réactions rapides,
/// `MessageOverlayMenu.swift`) — dont le tap envoie DIRECTEMENT ce
/// message-emoji.
final class ComposerTourbillonAndQuickEmojiSourceGuardTests: XCTestCase {

    private static let composerPath = "Meeshy/Features/Main/Components/UniversalComposerBar.swift"

    // MARK: - `actionButton` bascule entre bouton d'envoi et emojis rapides

    func test_actionButtonBlock_switchesBetweenSendButtonAndQuickEmojiButtons() throws {
        let block = try Self.actionButtonBlock()
        XCTAssertTrue(block.contains("quickEmojiButtons"), "l'emplacement idle doit afficher `quickEmojiButtons`")
        XCTAssertTrue(block.contains("showsQuickEmoji"), "la bascule doit être pilotée par une condition nommée, pas un booléen anonyme")
    }

    /// L'emplacement (slot) ne doit JAMAIS s'effondrer — directive du
    /// 2026-05-28 (bug « on ne voit pas le bouton envoyer ») déjà gardée par
    /// `ComposerTransparentAndConditionalSendSourceGuardTests` : le cadre doit
    /// rester appliqué UNE SEULE fois, à l'extérieur du if/else qui bascule le
    /// contenu — jamais dupliqué par branche (ce qui romprait l'invariant si
    /// une seule branche l'avait).
    func test_actionButtonBlock_frameIsAppliedOnceOutsideTheBranch() throws {
        let block = try Self.actionButtonBlock()
        let occurrences = block.components(separatedBy: ".frame(width:").count - 1
        XCTAssertEqual(occurrences, 1, "le cadre doit envelopper le if/else UNE seule fois — trouvé \(occurrences)")
    }

    /// **Le slot s'ÉLARGIT pour deux cibles, il ne les COMPRIME pas**
    /// (demande porteur 2026-08-31).
    ///
    /// Il avait été taillé pour UN bouton (44), et la bascule vers deux emojis
    /// y a serré 2×30 + gouttière dans la même largeur — des pastilles sous le
    /// minimum tactile de 44 pt, pour la seule raison que la largeur du slot
    /// n'avait pas suivi son contenu. La hauteur, elle, reste fixe : c'est elle
    /// qui portait l'invariant « le slot ne s'effondre pas ».
    func test_actionButtonSlot_widensForTwoTargetsInsteadOfSqueezingThem() throws {
        let block = try Self.actionButtonBlock()
        XCTAssertTrue(
            block.contains("quickEmojiSlotWidth"),
            "la largeur du slot doit suivre son contenu — une constante NOMMÉE pour le cas deux-emojis"
        )
        XCTAssertTrue(
            block.contains("sendSlotWidth"),
            "et revenir à la largeur d'un seul bouton dès qu'il y a quelque chose à envoyer"
        )
        XCTAssertTrue(
            block.contains("height: 44"),
            "la HAUTEUR reste fixe — c'est elle qui garde l'invariant « le slot ne s'effondre jamais »"
        )
    }

    /// Une cible tactile fait 44 pt (dimension 5 du `CLAUDE.md` racine), et la
    /// contre-épreuve nomme la valeur d'AVANT : `30` ne doit plus décrire une
    /// pastille d'emoji rapide.
    func test_quickEmojiButtons_meetTheFortyFourPointTouchTarget() throws {
        let block = try Self.propertyBlock(anchor: "var quickEmojiButtons: some View {")
        XCTAssertTrue(
            block.contains(".frame(width: 44, height: 44)"),
            "chaque emoji rapide doit occuper une cible de 44 pt — 30 pt était sous le minimum tactile"
        )
        XCTAssertFalse(
            block.contains("width: 30"),
            "la pastille de 30 pt doit avoir disparu, pas cohabiter avec la neuve"
        )
    }

    func test_actionButtonBlock_hidesQuickEmojiInEditModeAndWhenEmojiDisabled() throws {
        let block = try Self.actionButtonBlock()
        guard let range = block.range(of: "let showsQuickEmoji = ") else {
            return XCTFail("déclaration de `showsQuickEmoji` introuvable")
        }
        let lineEnd = block[range.upperBound...].firstIndex(of: "\n") ?? block.endIndex
        let line = block[range.lowerBound..<lineEnd]
        XCTAssertTrue(line.contains("!isEditMode"), "les emojis rapides ne doivent jamais remplacer le bouton « enregistrer » de l'édition")
        XCTAssertTrue(line.contains("showEmoji"), "les emojis rapides doivent respecter le drapeau `showEmoji` de l'hôte")
    }

    // MARK: - Transition tourbillon appliquée aux deux branches

    func test_actionButtonBlock_appliesTourbillonTransitionToBothBranches() throws {
        let block = try Self.actionButtonBlock()
        let occurrences = block.components(separatedBy: "tourbillonTransition").count - 1
        XCTAssertEqual(occurrences, 2, "la transition tourbillon doit s'appliquer aux DEUX branches (emojis ↔ bouton d'envoi) — trouvé \(occurrences)")
    }

    func test_tourbillonTransition_isAsymmetricWithOppositeRotationSigns() throws {
        let block = try Self.propertyBlock(anchor: "var tourbillonTransition: AnyTransition {")
        XCTAssertTrue(block.contains(".asymmetric("), "l'apparition et la disparition doivent être des animations DISTINCTES (grossir en tournant / rétrécir en tournant en sens inverse)")
        XCTAssertTrue(block.contains("insertion:"), "insertion manquante")
        XCTAssertTrue(block.contains("removal:"), "removal manquante")
        XCTAssertTrue(
            block.contains("-250") || block.contains("-260") || block.contains("-270") || block.contains("-240"),
            "l'insertion doit tourner dans un sens (rotation négative) — tourbillon qui apparaît en grossissant"
        )
    }

    func test_tourbillonEffect_scalesRotatesAndFadesTheContent() throws {
        let source = try Self.strippedSource()
        guard let structRange = source.range(of: "struct TourbillonEffect: ViewModifier {") else {
            return XCTFail("`TourbillonEffect` introuvable — le tourbillon doit être un ViewModifier réutilisable")
        }
        var depth = 0
        var index = structRange.lowerBound
        while index < source.endIndex {
            if source[index] == "{" { depth += 1 }
            if source[index] == "}" {
                depth -= 1
                if depth == 0 { break }
            }
            index = source.index(after: index)
        }
        let block = String(source[structRange.lowerBound...index])
        XCTAssertTrue(block.contains("scaleEffect"), "le tourbillon doit grossir/rétrécir")
        XCTAssertTrue(block.contains("rotationEffect"), "le tourbillon doit tourner")
        XCTAssertTrue(block.contains("opacity"), "le tourbillon doit s'estomper à l'apparition/disparition")
    }

    // MARK: - Emojis rapides : source, envoi direct, enregistrement d'usage

    func test_quickSendEmojis_sourcesTopTwoFromEmojiUsageTracker() throws {
        let block = try Self.propertyBlock(anchor: "var quickSendEmojis: [String] {")
        XCTAssertTrue(
            block.contains("EmojiUsageTracker.topEmojis(count: 2"),
            "les emojis rapides doivent venir du tracker partagé des réactions, limité à 2"
        )
    }

    func test_sendQuickEmoji_recordsUsageAndReusesHandleSend() throws {
        let source = try Self.strippedSource()
        guard let funcRange = source.range(of: "func sendQuickEmoji(") else {
            return XCTFail("`sendQuickEmoji(_:)` introuvable")
        }
        var depth = 0
        var index = funcRange.lowerBound
        while index < source.endIndex {
            if source[index] == "{" { depth += 1 }
            if source[index] == "}" {
                depth -= 1
                if depth == 0 { break }
            }
            index = source.index(after: index)
        }
        let block = String(source[funcRange.lowerBound...index])
        XCTAssertTrue(
            block.contains("EmojiUsageTracker.recordUsage(emoji:"),
            "un tap sur un emoji rapide doit enregistrer son usage — sinon le classement top-2 ne bouge jamais"
        )
        XCTAssertTrue(
            block.contains("handleSend()"),
            "l'envoi direct doit réutiliser `handleSend()` — SOURCE UNIQUE du dispatch (onCustomSend/onSendMessage/onSend), jamais une réimplémentation locale"
        )
    }

    /// Retour porteur (2026-08-27) : le tap laissait l'emoji DANS le champ au
    /// lieu d'envoyer. `text` est un `@State` LOCAL — sa synchronisation vers
    /// `textBinding` (source lue par `onCustomSend` chez l'hôte, ex.
    /// `composerText.text`) passe par un `.adaptiveOnChange(of: text)`, donc
    /// APRÈS ce tour de run loop. `handleSend()` appelle `onCustomSend()`
    /// SYNCHRONEMENT : sans pousser `textBinding` ICI, l'hôte lit encore
    /// l'ancien texte (vide) et n'envoie rien.
    func test_sendQuickEmoji_syncsTextBindingBeforeHandleSend() throws {
        let source = try Self.strippedSource()
        guard let funcRange = source.range(of: "func sendQuickEmoji(") else {
            return XCTFail("`sendQuickEmoji(_:)` introuvable")
        }
        var depth = 0
        var index = funcRange.lowerBound
        while index < source.endIndex {
            if source[index] == "{" { depth += 1 }
            if source[index] == "}" {
                depth -= 1
                if depth == 0 { break }
            }
            index = source.index(after: index)
        }
        let block = String(source[funcRange.lowerBound...index])
        guard let bindingRange = block.range(of: "textBinding?.wrappedValue = emoji") else {
            return XCTFail("`sendQuickEmoji` doit pousser `emoji` dans `textBinding` — sinon l'hôte lit un texte vide au moment d'envoyer")
        }
        guard let sendRange = block.range(of: "handleSend()") else {
            return XCTFail("`handleSend()` introuvable")
        }
        XCTAssertTrue(
            bindingRange.lowerBound < sendRange.lowerBound,
            "le binding doit être synchronisé AVANT `handleSend()` — sinon `onCustomSend` lit encore l'ancienne valeur"
        )
    }

    /// Sans ce vidage, le MÊME `.adaptiveOnChange(of: text)` — différé —
    /// re-pousse `emoji` dans `textBinding` APRÈS que l'hôte l'a vidé au
    /// moment d'envoyer, ressuscitant l'emoji dans le champ juste après
    /// l'envoi (retour porteur 2026-08-27, bug vécu en second tour).
    func test_sendQuickEmoji_clearsLocalTextAfterHandleSend() throws {
        let block = try Self.propertyBlock(anchor: "func sendQuickEmoji(")
        guard let sendRange = block.range(of: "handleSend()") else {
            return XCTFail("`handleSend()` introuvable")
        }
        guard let clearRange = block.range(of: "text = \"\"") else {
            return XCTFail("`sendQuickEmoji` doit vider `text` (local) après l'envoi — sinon l'onChange différé ressuscite l'emoji dans le champ")
        }
        XCTAssertTrue(
            sendRange.upperBound <= clearRange.lowerBound,
            "`text` doit être vidé APRÈS `handleSend()` — le vider avant enverrait un champ vide"
        )
    }

    // MARK: - Extraction

    private struct GuardIsBlind: Error, CustomStringConvertible {
        let description: String
    }

    private static func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Composer
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // repo root
    }

    /// **L'UNITÉ, jamais le seul fichier-tête.** Le type a été découpé pour
    /// rentrer dans le budget de taille, et les blocs que cette garde ancre ont
    /// suivi dans ses extensions. Une garde de source qui nomme des FICHIERS se
    /// périme au premier fichier ajouté ; une garde qui nomme une UNITÉ survit
    /// au découpage — c'est ce que `AppSourceGuard.unit` fait, par glob sur
    /// `Type+*.swift`.
    private static func strippedSource() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(composerPath))
    }

    private static func actionButtonBlock() throws -> String {
        try propertyBlock(anchor: "var actionButton: some View {")
    }

    private static func propertyBlock(anchor: String) throws -> String {
        let source = try strippedSource()
        guard let anchorRange = source.range(of: anchor) else {
            throw GuardIsBlind(description: "Ancre « \(anchor) » introuvable : la garde ne garde plus rien")
        }
        var depth = 0
        var index = anchorRange.lowerBound
        while index < source.endIndex {
            let character = source[index]
            if character == "{" {
                depth += 1
            } else if character == "}" {
                depth -= 1
                if depth == 0 {
                    return String(source[anchorRange.lowerBound...index])
                }
            }
            index = source.index(after: index)
        }
        throw GuardIsBlind(description: "Accolade fermante du bloc introuvable pour « \(anchor) »")
    }
}
