import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// Règle produit du badge « Transféré », RÉVISÉE le 2026-08-23 par le porteur :
/// « le forward d'un message, document ne doit pas dire de qui il vient mais de
/// quel groupe si cela vient d'un groupe AU MOINS PUBLIC ».
///
/// La question n'est plus « quel nom de groupe ajouter au nom de la personne ? »
/// (l'ancienne `conversationName(for:)`, dont la signature `String?` ne pouvait
/// pas exprimer « ne nomme personne ») mais « QUI a le droit d'être nommé ? ».
///
/// Les trois issues, et pourquoi :
/// - `public`, `global`, `broadcast`, `channel`, `community` → `.group(nom)`.
///   Seuls types atteignables hors d'un cercle fermé : nommer la source n'y
///   révèle rien qui ne soit déjà public. **La personne disparaît.**
/// - `group` → `.anonymous`. `Conversation` ne porte AUCUNE colonne de
///   visibilité (packages/shared/prisma/schema.prisma, `type String` documenté
///   « direct, group, public, global ») : un `group` ne PEUT PAS être public,
///   il est sous le seuil. Ni le groupe, ni la personne.
/// - `direct`, `bot` → `.person(nom)`. Aucun groupe à nommer, et la directive ne
///   parle que de groupes. **Arbitrage remonté au porteur** : c'est le seul cas
///   où un nom de personne survit.
/// - type `nil` ou inconnu → `.anonymous`. RETOURNEMENT du statu quo : une règle
///   de confidentialité échoue FERMÉE. C'est ce qui rend obligatoire la gravure
///   du type dans le cache (cf. `ForwardAttributionSiteGuardTests`).
///
/// RÈGLE JUMELLE : apps/web/lib/forward-badge.ts et
/// apps/android/core/model/.../ForwardBadgePolicy.kt — ces deux surfaces ne
/// nomment DÉJÀ jamais la personne ; seul le seuil y reste à corriger, dans un
/// lot séparé (elles sont hors du périmètre de cette branche iOS).
@MainActor
final class ForwardBadgePolicyTests: XCTestCase {

    private func ref(name: String? = "Équipe Design", sender: String = "Belva Tano", type: String?) -> ForwardReference {
        ForwardReference(
            originalMessageId: "fm1", senderName: sender, previewText: "…",
            conversationId: "conv5", conversationName: name, conversationType: type
        )
    }

    /// Le cas exact signalé à l'écran : « Fwd. from Belva Tano » sur un transfert
    /// venu d'un salon public. L'attribution ne doit nommer QUE le salon.
    func test_publiclyReachableTypes_nameTheGroup_neverThePerson() {
        for type in ["public", "global", "broadcast", "channel", "community"] {
            XCTAssertEqual(
                ForwardBadgePolicy.attribution(for: ref(type: type)), .group("Équipe Design"),
                "un groupe au moins public se nomme lui-même (\(type)) — l'auteur disparaît"
            )
        }
    }

    /// INVERSION ASSUMÉE de `test_groupTypes_showTheName` : un `group` était nommé.
    /// Il ne peut pas être public (aucune visibilité en base), donc il est sous le
    /// seuil « au moins public » — et le repli sur la personne SERAIT la fuite.
    func test_privateGroup_namesNobody_neitherTheGroupNorThePerson() {
        let attribution = ForwardBadgePolicy.attribution(for: ref(type: "group"))
        XCTAssertEqual(attribution, .anonymous,
                       "un cercle privé n'est pas « au moins public » : ni le groupe, ni la personne")
    }

    /// Conservé tel quel : un tête-à-tête n'a pas de groupe à nommer.
    func test_directAndBot_nameThePerson_andNeverTheConversation() {
        for type in ["direct", "bot"] {
            XCTAssertEqual(
                ForwardBadgePolicy.attribution(for: ref(type: type)), .person("Belva Tano"),
                "un tête-à-tête (\(type)) ne révèle jamais le nom de la conversation"
            )
        }
    }

    /// INVERSION ASSUMÉE de `test_unknownType_keepsStatusQuo_nameShown` : le statu
    /// quo « type inconnu ⇒ on affiche » autorisait une divulgation par défaut.
    func test_unknownOrMissingType_failsClosed() {
        XCTAssertEqual(ForwardBadgePolicy.attribution(for: ref(type: nil)), .anonymous,
                       "un type qu'on ne sait pas classer ne peut pas autoriser une divulgation")
        XCTAssertEqual(ForwardBadgePolicy.attribution(for: ref(type: "quantum-lounge")), .anonymous,
                       "un type neuf côté serveur n'est pas nommable par défaut (liste BLANCHE, pas noire)")
        XCTAssertEqual(ForwardBadgePolicy.attribution(for: nil), .anonymous)
    }

    /// LE point exact où le code basculait sur « Fwd. from {personne} » : nom de
    /// groupe absent ou vide. Un défaut de donnée n'est pas une permission de
    /// nommer quelqu'un d'autre.
    func test_aPublicRoomWithoutAName_fallsBackToAnonymous_neverToThePerson() {
        for name in [nil, "", "   "] as [String?] {
            XCTAssertEqual(
                ForwardBadgePolicy.attribution(for: ref(name: name, sender: "Belva Tano", type: "public")),
                .anonymous,
                "nom de groupe manquant ⇒ « Transféré », JAMAIS « Transf. de Belva Tano »"
            )
        }
    }

    /// La SDK écrit « ? » quand l'expéditeur source est inconnu
    /// (MessageModels.swift, `fwd.sender?.name ?? "?"`). Nommer « ? » serait un
    /// libellé cassé, pas une attribution.
    func test_aPlaceholderSenderIsNotAName() {
        XCTAssertEqual(ForwardBadgePolicy.attribution(for: ref(sender: "?", type: "direct")), .anonymous)
        XCTAssertEqual(ForwardBadgePolicy.attribution(for: ref(sender: "  ", type: "direct")), .anonymous)
    }
}

// MARK: - Directive produit 2026-08-23 — le badge « Transféré » ne nomme JAMAIS la personne

/// « Le forward d'un message, document ne doit pas dire de qui il vient mais de
/// quel groupe si cela vient d'un groupe au moins public. »
///
/// Ces gardes visent les DEUX sites qui lisaient `senderName` en clair, le
/// chemin de cache qui rendait la politique aveugle, et les clés de catalogue
/// dont l'absence faisait sortir « Fwd. from Belva Tano » en anglais dans une
/// interface française.
@MainActor
final class ForwardAttributionSiteGuardTests: XCTestCase {

    private func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // …/Views
            .deletingLastPathComponent()  // …/Unit
            .deletingLastPathComponent()  // …/MeeshyTests
            .deletingLastPathComponent()  // …/apps/ios
            .deletingLastPathComponent()  // …/apps
            .deletingLastPathComponent()  // racine
    }

    private func source(_ relativePath: String) throws -> String {
        try String(contentsOf: repoRoot().appendingPathComponent(relativePath), encoding: .utf8)
    }

    func test_theBubble_neverReadsTheForwardSenderName() throws {
        let code = try source("apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift")
        XCTAssertFalse(
            code.contains("message.forwardedFrom?.senderName"),
            "la bulle ne peut plus choisir la personne : elle reçoit une attribution déjà tranchée"
        )
        XCTAssertTrue(
            code.contains("ForwardBadgePolicy.attribution(for: message.forwardedFrom)"),
            "un seul résolveur décide qui a le droit d'être nommé"
        )
    }

    func test_theMessageDetailSheet_neverPrintsTheForwardSenderName() throws {
        let code = try source("apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageViewsDetailView.swift")
        XCTAssertFalse(
            code.contains("value: forward.senderName"),
            "la fiche de détail fuyait l'identité que la bulle masque — deux surfaces, une seule règle"
        )
        XCTAssertFalse(
            code.contains("if let convo = forward.conversationName"),
            "le nom brut de la conversation source ne s'affiche plus hors politique (un tête-à-tête le révélait)"
        )
        XCTAssertTrue(
            code.contains("ForwardBadgePolicy.attribution(for: message.forwardedFrom)"),
            "la fiche passe par le même résolveur que la bulle"
        )
    }

    /// Le chemin de persistance ne gravait NI le type NI le repli d'identifier :
    /// toute rangée relue du cache arrivait avec `conversationType == nil`. Avec
    /// une règle qui échoue FERMÉE, l'oubli anonymiserait tous les groupes.
    func test_thePersistedForwardReference_gravesTheTypeLikeTheNetworkPath() throws {
        let code = try source("packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift")
        guard let start = code.range(of: "let forwardedFromJson: Data? = api.forwardedFrom.flatMap"),
              let end = code.range(of: "field: \"forwardedFromJson\"", range: start.upperBound..<code.endIndex) else {
            return XCTFail("bloc forwardedFromJson introuvable — la garde ne mesure plus rien")
        }
        let block = String(code[start.lowerBound..<end.upperBound])
        XCTAssertTrue(
            block.contains("conversationType: api.forwardedFromConversation?.type"),
            "sans le type gravé, la politique est aveugle sur tout message relu du cache"
        )
        XCTAssertTrue(
            block.contains("?? api.forwardedFromConversation?.identifier"),
            "même repli de nom que le chemin réseau : un public sans titre garde un nom affichable"
        )
    }

    /// Les deux libellés du badge n'étaient PAS au catalogue : leur
    /// `defaultValue` anglais sortait tel quel — d'où « Fwd. from … » en français.
    func test_theForwardBadgeKeys_areCatalogued_inEveryShippedLanguage() throws {
        let data = try Data(contentsOf: repoRoot().appendingPathComponent("apps/ios/Meeshy/Localizable.xcstrings"))
        let root = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(root["strings"] as? [String: Any])
        let required = ["fr", "en", "de", "es", "pt-BR", "it", "ar"]

        for key in ["bubble.meta.forwarded", "bubble.meta.forwarded.from", "bubble.meta.forwarded.fromGroup"] {
            let node = try XCTUnwrap(strings[key] as? [String: Any], "clé absente du catalogue : \(key)")
            let locs = try XCTUnwrap(node["localizations"] as? [String: Any], "aucune localisation pour \(key)")
            for lang in required {
                XCTAssertNotNil(locs[lang], "\(key) n'est pas traduite en \(lang)")
            }
        }

        XCTAssertNil(
            strings["Transf. de %@ • %@"],
            "clé morte de l'ancienne forme à DEUX noms (personne • groupe) — elle ne doit pas survivre au comportement qu'elle servait"
        )
        XCTAssertNil(
            strings["Transf. de %@"],
            "clé littérale résiduelle : ses valeurs sont désormais portées par l'identifiant bubble.meta.forwarded.from"
        )
    }
}
