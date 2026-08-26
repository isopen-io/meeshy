import XCTest
import SwiftUI
import MeeshyUI
@testable import Meeshy

/// Test de PARITÉ — `LentilleMetrics` contre son domicile de vérité,
/// `packages/shared/design/lentille-tokens.json` → `list` (contrat LWS-5,
/// `tasks/lentille-implementation-contract.md` §0/§4.3 colonne « Liste »).
///
/// **Règle du test, recopiée du modèle `MeeshyTokenParityTest.kt` (workshop
/// §226) mot pour mot** : « ne jamais réparer le test en y recopiant la
/// valeur qui a dérivé — réparer le token. » Si un témoin ci-dessous rougit,
/// la cause est presque toujours que `LentilleMetrics` (ou, plus rarement,
/// la maquette elle-même) a dérivé du JSON committé. Le correctif touche le
/// fichier qui a dérivé — jamais ce test, et jamais le JSON pour le faire
/// coller à une régression Swift.
///
/// **Nommage** — comme #3010 WS-0 : aucun jeton qui bascule cette suite en
/// phase 2 du gate (`meeshy.sh` `FINAL_PHASE_CLASS_PATTERN`, ligne ~1591).
/// `LentilleMetricsTests`, pas `ConversationLentilleMetricsTests` : le jeton
/// `Conversation` change de phase.
@MainActor
final class LentilleMetricsTests: XCTestCase {

    // MARK: - Chargement du domicile de vérité

    /// Ressource de bundle : `packages/shared/design/lentille-tokens.json`,
    /// câblée via `project.yml` (`MeeshyTests.resources`, `type: folder`,
    /// même mécanique que `packages/shared/fixtures`). `design/` n'était PAS
    /// accessible en ressource avant ce ticket — la ligne additionnelle a
    /// été posée dans `project.yml` (cf. son commentaire, propriété LWS-5).
    private static var listTokens: [String: Any] {
        guard let url = Bundle(for: LentilleMetricsTests.self).url(
            forResource: "lentille-tokens",
            withExtension: "json",
            subdirectory: "design"
        ) else {
            XCTFail("""
                lentille-tokens.json introuvable dans le bundle de tests sous `design/`. \
                Vérifier la ressource `../../packages/shared/design` (type: folder) dans \
                project.yml, puis `xcodegen generate`.
                """)
            return [:]
        }
        guard
            let data = try? Data(contentsOf: url),
            let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let list = root["list"] as? [String: Any]
        else {
            XCTFail("lentille-tokens.json présent mais illisible, ou section `list` absente.")
            return [:]
        }
        return list
    }

    /// Descend un chemin de clés dans `listTokens` et lit un nombre.
    /// Échec de lecture (chemin absent, mauvais type) ⇒ `nil`, pas `0` — un
    /// témoin comparé à `nil` avec `XCTUnwrap` rougit distinctement d'un
    /// témoin comparé à une vraie divergence de valeur.
    private func tokenNumber(_ path: String...) throws -> Double {
        var node: Any? = Self.listTokens
        for key in path {
            node = (node as? [String: Any])?[key]
        }
        return try XCTUnwrap((node as? NSNumber)?.doubleValue, "chemin absent ou non-numérique : \(path.joined(separator: "."))")
    }

    /// Idem, pour une valeur `"16%"` — le CSS `transform-origin` de la
    /// maquette, converti en fraction `[0, 1]`.
    private func tokenPercent(_ path: String...) throws -> Double {
        var node: Any? = Self.listTokens
        for key in path {
            node = (node as? [String: Any])?[key]
        }
        let raw = try XCTUnwrap(node as? String, "chemin absent ou non-textuel : \(path.joined(separator: "."))")
        let trimmed = try XCTUnwrap(raw.hasSuffix("%") ? String(raw.dropLast()) : nil, "pas un pourcentage : \(raw)")
        return try XCTUnwrap(Double(trimmed)) / 100
    }

    /// `Font.Weight` n'expose aucune valeur numérique publique : ce mapping
    /// EST la traduction CSS → SwiftUI documentée par le contrat §0 (échelle
    /// SwiftUI 100…900). Il vit dans le test — la logique de correspondance,
    /// pas une valeur susceptible de dériver.
    private func expectedWeight(forCSS css: Double) -> Font.Weight {
        switch css {
        case 100: return .ultraLight
        case 200: return .thin
        case 300: return .light
        case 400: return .regular
        case 500: return .medium
        case 600: return .semibold
        case 700: return .bold
        case 800: return .heavy
        case 900: return .black
        default: return .regular
        }
    }

    // MARK: - Rang

    func test_row_height() throws {
        XCTAssertEqual(Double(LentilleMetrics.Row.height), try tokenNumber("row", "height"))
    }

    func test_row_padding() throws {
        XCTAssertEqual(Double(LentilleMetrics.Row.paddingVertical), try tokenNumber("row", "padding", "vertical"))
        XCTAssertEqual(Double(LentilleMetrics.Row.paddingHorizontal), try tokenNumber("row", "padding", "horizontal"))
    }

    func test_row_marginHorizontal() throws {
        XCTAssertEqual(Double(LentilleMetrics.Row.marginHorizontal), try tokenNumber("row", "marginHorizontal"))
        XCTAssertEqual(Double(LentilleMetrics.Row.marginVertical), try tokenNumber("row", "marginVertical"))
    }

    func test_row_radius() throws {
        XCTAssertEqual(Double(LentilleMetrics.Row.radius), try tokenNumber("row", "radius"))
    }

    func test_row_transformOrigin() throws {
        XCTAssertEqual(Double(LentilleMetrics.Row.transformOriginX), try tokenPercent("row", "transformOriginX"), accuracy: 0.0001)
        XCTAssertEqual(Double(LentilleMetrics.Row.transformOriginY), try tokenPercent("row", "transformOriginY"), accuracy: 0.0001)
    }

    // MARK: - Avatar

    /// §0 : le rang Lentille réutilise `AvatarContext.conversationHeaderCollapsed`
    /// plutôt qu'un `.custom(44)`. Un `switch` (pas `==` — `AvatarContext`
    /// n'est pas `Equatable`) verrouille QUEL contexte est branché, pas
    /// seulement sa taille : un `.custom(44)` numériquement identique
    /// passerait la comparaison de taille sans passer celle-ci.
    func test_avatar_context_isConversationHeaderCollapsed_notACustomLiteral() {
        switch LentilleMetrics.Avatar.context {
        case .conversationHeaderCollapsed: break
        default: XCTFail("LentilleMetrics.Avatar.context doit rester .conversationHeaderCollapsed (§0) — jamais un .custom(44)")
        }
    }

    func test_avatar_size_matchesToken() throws {
        XCTAssertEqual(Double(LentilleMetrics.Avatar.size), try tokenNumber("avatar", "size"))
    }

    func test_avatar_ring() throws {
        XCTAssertEqual(Double(LentilleMetrics.Avatar.ringWidth), try tokenNumber("avatar", "ring", "size"))
        XCTAssertEqual(LentilleMetrics.Avatar.ringOpacity, try tokenNumber("avatar", "ring", "opacity"))
    }

    // MARK: - Dot de présence

    func test_presenceDot() throws {
        XCTAssertEqual(Double(LentilleMetrics.PresenceDot.size), try tokenNumber("presenceDot", "size"))
        XCTAssertEqual(Double(LentilleMetrics.PresenceDot.borderSize), try tokenNumber("presenceDot", "borderSize"))
    }

    // MARK: - Nom · Heure · Ligne 2

    /// §0 : taille du nom = `MeeshyFont.bodySize`, pas un littéral `15` —
    /// re-prouve que la constante SDK porte bien la valeur du token.
    func test_name_size_isMeeshyFontBodySize() throws {
        XCTAssertEqual(LentilleMetrics.Name.size, MeeshyFont.bodySize)
        XCTAssertEqual(Double(LentilleMetrics.Name.size), try tokenNumber("name", "size"))
    }

    func test_name_weight() throws {
        let css = try tokenNumber("name", "weight")
        XCTAssertEqual(LentilleMetrics.Name.weight, expectedWeight(forCSS: css))
        XCTAssertEqual(LentilleMetrics.Name.weight, .heavy, "§0 : 800 CSS → .heavy (Font.Weight.extrabold n'existe pas)")
    }

    func test_time() throws {
        XCTAssertEqual(Double(LentilleMetrics.Time.size), try tokenNumber("time", "size"))
        let css = try tokenNumber("time", "weight")
        XCTAssertEqual(LentilleMetrics.Time.weight, expectedWeight(forCSS: css))
    }

    /// §0 : ligne 2 = `MeeshyFont.subheadSize`, pas un littéral `13`.
    func test_line2_size_isMeeshyFontSubheadSize() throws {
        XCTAssertEqual(LentilleMetrics.Line2.size, MeeshyFont.subheadSize)
        XCTAssertEqual(Double(LentilleMetrics.Line2.size), try tokenNumber("line2", "size"))
    }

    // MARK: - Point de non-lu
    //
    // Le token SURVIT au lot 2 (2026-08-22) bien qu'AUCUNE vue iOS ne le
    // consomme plus (le point de 8 px était le doublon strict de la pastille
    // chiffrée rétablie sur la ligne de titre — voir
    // `LentilleRowSourceGuardTests.test_unreadDotToken_isGoneFromEveryRowFile_supersededByTheCountedBadge`).
    // La peau WEB, elle, le consomme toujours
    // (`LentilleRow.tsx`, `--lentille-list-unread-dot-size`) : le retirer du
    // JSON y ferait un point de 0×0 en silence. La parité reste donc due.

    func test_unreadDot_size() throws {
        XCTAssertEqual(Double(LentilleMetrics.UnreadDot.size), try tokenNumber("unreadDot", "size"))
    }

    // MARK: - Carte de focus

    func test_focusCard() throws {
        XCTAssertEqual(Double(LentilleMetrics.FocusCard.ringSize), try tokenNumber("focusCard", "ringSize"))
        XCTAssertEqual(Double(LentilleMetrics.FocusCard.radius), try tokenNumber("focusCard", "radius"))
    }

    // MARK: - Encoche de mode

    func test_modeNotch() throws {
        XCTAssertEqual(Double(LentilleMetrics.ModeNotch.size), try tokenNumber("modeNotch", "size"))
        let css = try tokenNumber("modeNotch", "weight")
        XCTAssertEqual(LentilleMetrics.ModeNotch.weight, expectedWeight(forCSS: css))
        XCTAssertEqual(Double(LentilleMetrics.ModeNotch.top), try tokenNumber("modeNotch", "top"))
        XCTAssertEqual(Double(LentilleMetrics.ModeNotch.right), try tokenNumber("modeNotch", "right"))
    }

    // MARK: - Sticker de section

    func test_sticker() throws {
        XCTAssertEqual(Double(LentilleMetrics.Sticker.size), try tokenNumber("sticker", "size"))
        let css = try tokenNumber("sticker", "weight")
        XCTAssertEqual(LentilleMetrics.Sticker.weight, expectedWeight(forCSS: css))
        XCTAssertEqual(Double(LentilleMetrics.Sticker.letterSpacingEm), try tokenNumber("sticker", "letterSpacingEm"))
        XCTAssertEqual(Double(LentilleMetrics.Sticker.paddingVertical), try tokenNumber("sticker", "padding", "vertical"))
        XCTAssertEqual(Double(LentilleMetrics.Sticker.paddingHorizontal), try tokenNumber("sticker", "padding", "horizontal"))
    }

    // MARK: - Pilule de défilement

    func test_pill_top_and_fade() throws {
        XCTAssertEqual(Double(LentilleMetrics.Pill.top), try tokenNumber("pill", "top"))
        XCTAssertEqual(LentilleMetrics.Pill.fadeDurationMs, try tokenNumber("pill", "fadeDurationMs"))
    }

    /// Garde R15 (contrat §4.3/§0) : `900` (le `dismissAfterMs` du JSON) ne
    /// doit JAMAIS apparaître en littéral dans `LentilleMetrics.swift` — la
    /// constante appartient à la loi partagée (`scroll-activity.ts` →
    /// `SCROLL_ACTIVITY_LINGER_MS`), pas au fichier de tokens de design.
    /// Confirme aussi que le JSON continue de porter `900` : si le token de
    /// LOI dérivait, ce serait visible ailleurs (miroir Swift de la loi,
    /// hors périmètre LWS-5) — pas ici, en dupliquant le littéral.
    func test_pill_dismissAfterMs_isNeverMirroredAsALiteral_sourceGuard() throws {
        XCTAssertEqual(try tokenNumber("pill", "dismissAfterMs"), 900, "le JSON documente toujours la loi à 900 ms")

        // Ce fichier vit sous apps/ios/MeeshyTests/Unit/Lentille/ ; la source
        // sous apps/ios/Meeshy/Features/Main/Lentille/Core/ — 4 remontées
        // jusqu'à apps/ios/, puis redescente vers la source.
        let sourceURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Lentille/
            .deletingLastPathComponent() // Unit/
            .deletingLastPathComponent() // MeeshyTests/
            .deletingLastPathComponent() // apps/ios/
            .appendingPathComponent("Meeshy/Features/Main/Lentille/Core/LentilleMetrics.swift")
        let source = try String(contentsOf: sourceURL, encoding: .utf8)
        let codeLines = source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.hasPrefix("//") && !$0.hasPrefix("///") }
        XCTAssertFalse(
            codeLines.contains { $0.contains("900") },
            "LentilleMetrics.swift ne doit contenir aucun littéral `900` hors commentaire (garde R15) — la valeur vient de la loi partagée, référencée en commentaire uniquement"
        )
    }

    // MARK: - Rail vivants & stories

    func test_rail() throws {
        XCTAssertEqual(Double(LentilleMetrics.Rail.size), try tokenNumber("rail", "size"))
        XCTAssertEqual(Double(LentilleMetrics.Rail.ringWidth), try tokenNumber("rail", "ring"))
        XCTAssertEqual(Double(LentilleMetrics.Rail.paddingVertical), try tokenNumber("rail", "paddingVertical"))
        XCTAssertEqual(LentilleMetrics.Rail.maxEntries, Int(try tokenNumber("rail", "maxEntries")))
    }

    // MARK: - Tags / favori

    func test_tags() throws {
        XCTAssertEqual(Double(LentilleMetrics.Tags.size), try tokenNumber("tags", "size"))
        XCTAssertEqual(LentilleMetrics.Tags.maxCount, Int(try tokenNumber("tags", "maxCount")))
        XCTAssertEqual(Double(LentilleMetrics.Tags.emojiSize), try tokenNumber("tags", "emojiSize"))
    }

    // MARK: - Sourdine

    func test_muted_opacity() throws {
        XCTAssertEqual(LentilleMetrics.Muted.opacity, try tokenNumber("muted", "opacity"))
    }

    // MARK: - Agent ✦

    func test_agent_avatarRingWidth() throws {
        XCTAssertEqual(Double(LentilleMetrics.Agent.avatarRingWidth), try tokenNumber("agent", "avatarRing", "size"))
    }

    /// **L'invariant qui interdit le chevauchement de D7.** La respiration
    /// écarte les voisines de la rangée élue ; si son amplitude dépasse la
    /// marge qui sépare une rangée du sticker suivant, la rangée poussée MANGE
    /// cette marge et mord le header.
    ///
    /// C'est exactement ce qui se produisait : `breathing` valait 18 pour une
    /// marge de 8. Chevauchement mesuré à géométrie stabilisée, deux
    /// frontières, deux relevés indépendants — 9,6 / 8,9 puis 9,2 / 9,1 pt — et
    /// l'arithmétique bouclait : `18 − 8 − (88 − h)/2 = 9,6` pour `h = 87,3`.
    ///
    /// Ce témoin est ce qui empêche qu'on remonte l'amplitude sans rapprocher
    /// les deux chiffres, comme cela s'était produit : la marge n'était alors
    /// même pas NOMMÉE, elle vivait en littéral dans un `LazyVStack(spacing:)`.
    func test_breathing_neverExceedsTheMarginItHasToMoveInto() throws {
        XCTAssertLessThanOrEqual(
            LentilleMetrics.FocusCard.breathing,
            LentilleMetrics.Row.marginVertical,
            "La respiration ne peut pas dépasser la marge qui la reçoit : au-delà elle ne "
            + "déplace plus les rangées, elle les fait se chevaucher avec le sticker suivant."
        )
        XCTAssertEqual(
            Double(LentilleMetrics.FocusCard.breathing), try tokenNumber("focusCard", "breathing"),
            "l'amplitude est miroitée dans le JSON partagé comme toute cote de loi"
        )
    }
}
