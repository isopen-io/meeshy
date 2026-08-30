import XCTest

/// Garde de forme sur le BLOC `sendButton` de `UniversalComposerBar`.
///
/// Le bouton d'envoi — le contrôle le plus visible du fil — figeait
/// `[MeeshyColors.indigo500, MeeshyColors.indigo400]` pendant que le reste du
/// composer honorait l'accent de la conversation (CLAUDE.md § Conversation
/// Accent Color : « ALL conversation-context components MUST use `accentColor`,
/// never hardcode colors »).
///
/// La garde vise le BLOC, jamais le FICHIER : `UniversalComposerBar.swift`
/// contient d'autres surfaces légitimement indigo (les boutons de marque du
/// sélecteur de langue, entre autres) que cette garde ne doit pas condamner.
/// `editColors` reste lui aussi hors de portée — le jaune d'édition est un état
/// SÉMANTIQUE, pas une identité de conversation.
final class ComposerSendButtonAccentSourceGuardTests: XCTestCase {

    /// **L'UNITE, jamais le seul fichier-tete.** `UniversalComposerBar` a ete
    /// decoupee pour rentrer dans le budget de taille, et `sendButton` a suivi
    /// dans `UniversalComposerBar+Send.swift`. La garde, qui lisait le
    /// fichier-tete, ne trouvait plus son ancre : elle levait `GuardIsBlind` —
    /// bruyamment, ce qui est son merite — mais elle ne gardait plus rien.
    ///
    /// C'est le mode d'extinction exact que `AppSourceGuard.unitURLs` existe
    /// pour empecher : « une liste de parties se perime au premier fichier
    /// ajoute ». Elle lit desormais le type ET ses extensions, par GLOB — un
    /// second decoupage ne la reprendra pas.
    private static let composerPath = "Meeshy/Features/Main/Components/UniversalComposerBar.swift"
    private static let blockAnchor = "var sendButton: some View {"

    // MARK: - La garde voit bien le bloc qu'elle prétend garder

    /// **Une garde aveugle passe au vert en ayant perdu sa protection.** Ces deux
    /// témoins prouvent que l'extraction rend le bloc ENTIER : son glyphe
    /// d'envoi (première moitié) et son identifiant d'accessibilité (dernière
    /// ligne). Si l'ancre bouge, c'est ici que ça rougit — pas en silence.
    func test_sendButtonBlock_isExtractedWhole() throws {
        let block = try Self.sendButtonBlock()
        XCTAssertTrue(block.contains("paperplane.fill"), "le bloc extrait ne contient pas le glyphe d'envoi")
        XCTAssertTrue(
            block.contains("MeeshyA11yID.composerSend"),
            "le bloc extrait s'arrête avant sa dernière ligne — l'extraction est tronquée"
        )
    }

    // MARK: - L'accent de la conversation, jamais l'indigo de marque

    func test_sendButton_usesConversationAccent_notHardcodedIndigo() throws {
        let block = try Self.sendButtonBlock()
        XCTAssertTrue(
            block.contains("let sendColors = [Color(hex: accentColor), Color(hex: secondaryColor)]"),
            "le dégradé d'envoi doit être le miroir exact du bouton « Écrire » de la variante minimisée"
        )
        XCTAssertFalse(
            Self.mentionsBrandIndigo(block),
            "le bloc `sendButton` réintroduit l'indigo de marque — il doit porter l'accent de son hôte"
        )
    }

    /// Le jaune d'édition est un état sémantique : le corriger « pour cohérence »
    /// ferait disparaître le seul signal visuel du mode édition.
    func test_sendButton_keepsTheSemanticEditPair() throws {
        let block = try Self.sendButtonBlock()
        XCTAssertTrue(
            block.contains("let editColors = [MeeshyColors.warning, MeeshyColors.warning.opacity(0.75)]"),
            "le couple d'édition (warning) doit rester sémantique et distinct de l'accent"
        )
    }

    /// L'ombre suit le premier arrêt du dégradé servi — donc l'accent en envoi,
    /// le warning en édition. Une ombre figée trahirait la teinte du bouton.
    func test_sendButton_shadowFollowsTheServedGradient() throws {
        let block = try Self.sendButtonBlock()
        XCTAssertTrue(
            block.contains("colors[0].opacity(0.4)"),
            "l'ombre du bouton d'envoi doit dériver du dégradé servi, pas d'une teinte figée"
        )
    }

    // MARK: - Contre-épreuve du scanner

    /// **Une garde NÉGATIVE meurt en silence** : elle passe au vert dès qu'elle
    /// ne reconnaît plus la forme qu'elle interdit. Ces vecteurs prouvent
    /// qu'elle rougirait si l'indigo de marque revenait, sous ses deux formes
    /// (jeton `Color` et jeton hexadécimal), et qu'elle laisse passer les deux
    /// formes légitimes.
    func test_brandIndigoScanner_recognizesTheFormItForbids() {
        XCTAssertTrue(Self.mentionsBrandIndigo("let sendColors = [MeeshyColors.indigo500, MeeshyColors.indigo400]"))
        XCTAssertTrue(Self.mentionsBrandIndigo("LinearGradient(colors: [Color(hex: MeeshyColors.indigo600Hex)])"))
        XCTAssertFalse(Self.mentionsBrandIndigo("let sendColors = [Color(hex: accentColor), Color(hex: secondaryColor)]"))
        XCTAssertFalse(Self.mentionsBrandIndigo("let editColors = [MeeshyColors.warning, MeeshyColors.warning.opacity(0.75)]"))
    }

    // MARK: - Scanner

    private static func mentionsBrandIndigo(_ source: String) -> Bool {
        source.contains("MeeshyColors.indigo")
    }

    // MARK: - Extraction du bloc

    private struct GuardIsBlind: Error, CustomStringConvertible {
        let description: String
    }

    /// Le bloc `sendButton`, de son ancre à son accolade fermante appariée,
    /// COMMENTAIRES RETIRÉS (`AppSourceGuard.stripComments`, le stripper partagé
    /// des gardes app-side) : un commentaire citant le symbole interdit ne doit
    /// ni satisfaire ni faire échouer une garde — seul le code peint des pixels.
    private static func sendButtonBlock() throws -> String {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit(composerPath))
        guard let anchor = source.range(of: blockAnchor) else {
            throw GuardIsBlind(description: "Ancre « \(blockAnchor) » introuvable : la garde ne garde plus rien")
        }

        var depth = 0
        var index = anchor.lowerBound
        while index < source.endIndex {
            let character = source[index]
            if character == "{" {
                depth += 1
            } else if character == "}" {
                depth -= 1
                if depth == 0 {
                    return String(source[anchor.lowerBound...index])
                }
            }
            index = source.index(after: index)
        }
        throw GuardIsBlind(description: "Accolade fermante du bloc `sendButton` introuvable")
    }
}
