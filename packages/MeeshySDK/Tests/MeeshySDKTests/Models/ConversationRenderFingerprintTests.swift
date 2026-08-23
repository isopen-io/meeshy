import XCTest
@testable import MeeshySDK

/// `MeeshyConversation.renderFingerprint` est le **portillon de mémoïsation** de
/// la ligne de liste : `ThemedConversationRow.==` et `ConversationRowItem.==` ne
/// comparent la conversation QUE par ce hash, derrière `.equatable()`. Un champ
/// affiché mais non replié dedans n'est pas une optimisation approximative —
/// c'est un rendu qui ne se rafraîchit JAMAIS, puisque SwiftUI n'appelle même
/// pas `body`.
///
/// Ces témoins verrouillent la contravariance exacte du portillon : le hash doit
/// bouger dès que ce que la ligne AFFICHE bouge, et rester stable sinon.
///
/// **Toutes les variantes dérivent d'UNE SEULE instance de base, par mutation du
/// seul champ testé.** Ce n'est pas du confort d'écriture, c'est ce qui rend les
/// témoins `_changes` discriminants : `MeeshyConversation.init` défaute
/// `lastMessageAt` à `Date()`, qui EST replié dans le hash — deux instances
/// construites séparément diffèrent donc toujours, et un `XCTAssertNotEqual`
/// entre elles passerait sans rien prouver. Première rédaction de ce fichier :
/// six témoins verts, dont trois pour cette seule raison. C'est le témoin de
/// stabilité ci-dessous qui l'a révélé — sa raison d'être exacte.
final class ConversationRenderFingerprintTests: XCTestCase {

    // MARK: - Factory

    /// Date FIXE : `init` défaute `lastMessageAt` à `Date()`, replié dans le
    /// hash. Sans épinglage, aucune comparaison entre deux instances ne dit rien.
    private static let pinnedDate = Date(timeIntervalSince1970: 1_700_000_000)

    private func makeConversation(
        type: MeeshyConversation.ConversationType = .direct,
        memberCount: Int = 2,
        memberCountCapped: Bool = false,
        lastMessagePreview: String? = "Hello",
        lastMessageOriginalLanguage: String? = "en",
        lastMessageTranslations: [String: String]? = nil,
        lastMessageLocation: SharedPlace? = nil
    ) -> MeeshyConversation {
        var c = MeeshyConversation(
            id: "conv1",
            identifier: "conv1",
            type: type,
            memberCount: memberCount,
            memberCountCapped: memberCountCapped,
            lastMessageAt: Self.pinnedDate,
            lastMessagePreview: lastMessagePreview
        )
        c.lastMessageOriginalLanguage = lastMessageOriginalLanguage
        c.lastMessageTranslations = lastMessageTranslations
        c.lastMessageLocation = lastMessageLocation
        return c
    }

    // MARK: - Stabilité (le portillon doit rester un portillon)

    /// Non-discriminant seul, et c'est sa seule fonction : verrouiller que le
    /// hash ne devient pas « toujours différent ». Un fingerprint instable
    /// annulerait le gain de `.equatable()` sans qu'aucun autre témoin ne
    /// rougisse — pire, il rendrait tous les témoins `_changes` vacuoirement
    /// verts. C'est exactement ce qu'il a attrapé à la première rédaction.
    func test_renderFingerprint_identicalConversations_areEqual() {
        let a = makeConversation(lastMessageTranslations: ["fr": "Bonjour"])
        let b = makeConversation(lastMessageTranslations: ["fr": "Bonjour"])
        XCTAssertEqual(a.renderFingerprint, b.renderFingerprint)
    }

    // MARK: - Prisme : la VALEUR traduite, pas seulement la clé

    /// Le défaut réel. Le gateway ne ré-émet `conversation:updated` qu'aux
    /// lecteurs dont la carte d'aperçu porte la langue qui vient d'atterrir
    /// (`PreviewUpdateScope.onlyIfPreviewCarriesLanguage`) : quand une
    /// RETRADUCTION remplace le texte français d'un message déjà traduit, le
    /// payload garde le même `lastMessageId`, le même `lastMessagePreview`
    /// (l'original ne bouge pas), le même `lastMessageAt` et le même JEU DE
    /// CLÉS. Seule la valeur change — et c'est précisément elle que la ligne
    /// affiche, via `resolvedLastMessagePreview`.
    ///
    /// Hasher les seules clés gelait donc la ligne sur la traduction d'avant,
    /// définitivement : le seul champ qui bougeait était le seul non replié.
    func test_renderFingerprint_translationTextChangesForSameLanguage_changes() {
        let before = makeConversation(lastMessageTranslations: ["fr": "Bonjour"])
        let after = makeConversation(lastMessageTranslations: ["fr": "Salut"])

        XCTAssertEqual(
            before.resolvedLastMessagePreview(preferredLanguages: ["fr"]), "Bonjour"
        )
        XCTAssertEqual(
            after.resolvedLastMessagePreview(preferredLanguages: ["fr"]), "Salut"
        )
        XCTAssertNotEqual(
            before.renderFingerprint, after.renderFingerprint,
            "la ligne affiche la VALEUR traduite — une retraduction doit rouvrir le portillon"
        )
    }

    /// Le cas déjà couvert avant ce lot (première traduction qui atterrit) :
    /// verrouillé pour qu'il ne régresse pas en repliant les valeurs.
    func test_renderFingerprint_firstTranslationArrives_changes() {
        let before = makeConversation(lastMessageTranslations: nil)
        let after = makeConversation(lastMessageTranslations: ["fr": "Bonjour"])
        XCTAssertNotEqual(before.renderFingerprint, after.renderFingerprint)
    }

    /// Une langue AJOUTÉE change le jeu de clés — déjà détecté, verrouillé.
    func test_renderFingerprint_additionalLanguageAdded_changes() {
        let before = makeConversation(lastMessageTranslations: ["fr": "Bonjour"])
        let after = makeConversation(lastMessageTranslations: ["fr": "Bonjour", "es": "Hola"])
        XCTAssertNotEqual(before.renderFingerprint, after.renderFingerprint)
    }

    /// Deux cartes de mêmes clés et mêmes valeurs, construites dans un ordre
    /// d'insertion différent, sont le MÊME rendu : le hash doit être stable.
    /// `Dictionary` n'a pas d'ordre — sans tri explicite, le fingerprint
    /// deviendrait non déterministe et le portillon s'ouvrirait au hasard.
    func test_renderFingerprint_sameMapDifferentInsertionOrder_isStable() {
        var first: [String: String] = [:]
        first["fr"] = "Bonjour"
        first["es"] = "Hola"
        var second: [String: String] = [:]
        second["es"] = "Hola"
        second["fr"] = "Bonjour"

        XCTAssertEqual(
            makeConversation(lastMessageTranslations: first).renderFingerprint,
            makeConversation(lastMessageTranslations: second).renderFingerprint
        )
    }

    /// Deux cartes dont la concaténation naïve `clé+valeur` se confondrait.
    /// `["a": "bc"]` et `["ab": "c"]` rendent la même chaîne si on colle sans
    /// séparateur ; `Hasher.combine` par composant les distingue.
    func test_renderFingerprint_ambiguousKeyValueSplit_distinguished() {
        XCTAssertNotEqual(
            makeConversation(lastMessageTranslations: ["a": "bc"]).renderFingerprint,
            makeConversation(lastMessageTranslations: ["ab": "c"]).renderFingerprint
        )
    }

    // MARK: - Position hissée

    /// Un message position-seule a un `lastMessagePreview` VIDE par
    /// construction (le serveur ne fabrique aucun texte de repli) : la ligne
    /// compose son libellé depuis `lastMessageLocation`, visuellement
    /// (`ThemedConversationRow`, branche `.standard`) comme dans son label
    /// VoiceOver. Le champ était affiché sans être replié dans le hash.
    func test_renderFingerprint_locationNameChanges_changes() {
        let before = makeConversation(
            lastMessagePreview: "",
            lastMessageLocation: SharedPlace(latitude: 48.8, longitude: 2.3, name: "Louvre")
        )
        let after = makeConversation(
            lastMessagePreview: "",
            lastMessageLocation: SharedPlace(latitude: 48.8, longitude: 2.3, name: "Orsay")
        )
        XCTAssertNotEqual(before.renderFingerprint, after.renderFingerprint)
    }

    /// Une position qui APPARAÎT alors que son nom reste absent : le libellé
    /// passe de rien à « Position ». Hasher le seul `name` (nil des deux côtés)
    /// raterait la transition.
    func test_renderFingerprint_unnamedLocationAppears_changes() {
        let before = makeConversation(lastMessagePreview: "", lastMessageLocation: nil)
        let after = makeConversation(
            lastMessagePreview: "",
            lastMessageLocation: SharedPlace(latitude: 48.8, longitude: 2.3, name: nil)
        )
        XCTAssertNotEqual(before.renderFingerprint, after.renderFingerprint)
    }

    // MARK: - Effectif — champs AFFICHÉS par la rangée depuis le lot 2 (2026-08-22)
    //
    // `memberCount`/`memberCountCapped` étaient déjà affichés par
    // `ThemedConversationRow.typeBadge` (« 12 », « 199+ ») SANS être repliés
    // ici : le portillon gelait donc l'effectif sur sa première valeur, sans
    // qu'aucun test ne rougisse — exactement le défaut de classe déjà corrigé
    // pour la traduction (B1) et pour la position hissée. Le lot 2 de la
    // Lentille rend l'effectif une SECONDE fois (ligne d'effectif en bas à
    // droite du cadre, `LentilleConversationRow.memberCountLine`), ce qui rend
    // le trou visible sur deux peaux au lieu d'une.
    //
    // Le compte de non-lus, lui, était DÉJÀ replié (`h.combine(userState
    // .unreadCount)`) — la pastille chiffrée du lot 2 n'a donc rien à ajouter
    // de ce côté, et le témoin ci-dessous le RE-PROUVE plutôt que de le
    // supposer.

    func test_renderFingerprint_memberCountChanges_changes() {
        let before = makeConversation(type: .group, memberCount: 12)
        let after = makeConversation(type: .group, memberCount: 13)
        XCTAssertNotEqual(
            before.renderFingerprint, after.renderFingerprint,
            "l'effectif est AFFICHÉ (badge de type historique + ligne d'effectif Lentille) — " +
            "un membre qui rejoint doit rouvrir le portillon, sinon la rangée reste à jamais " +
            "sur le nombre du premier rendu"
        )
    }

    /// Le PLAFOND est une autre chaîne rendue (« 199 » contre « 199+ ») à
    /// nombre EXACTEMENT égal : replier le seul `memberCount` raterait la
    /// transition — même mécanique que la position sans nom ci-dessous.
    func test_renderFingerprint_memberCountCappedFlips_changes() {
        let before = makeConversation(type: .group, memberCount: 199, memberCountCapped: false)
        let after = makeConversation(type: .group, memberCount: 199, memberCountCapped: true)
        XCTAssertNotEqual(
            before.renderFingerprint, after.renderFingerprint,
            "« 199 » et « 199+ » sont deux rendus distincts du MÊME nombre — le drapeau de " +
            "plafond doit replier à part"
        )
    }

    /// Le TYPE décide si l'effectif est rendu du tout (`.direct` ⇒ aucun
    /// effectif, contrat lot 2) et quel glyphe porte le badge de type
    /// historique. Il n'était replié nulle part.
    func test_renderFingerprint_conversationTypeChanges_changes() {
        let before = makeConversation(type: .direct, memberCount: 2)
        let after = makeConversation(type: .group, memberCount: 2)
        XCTAssertNotEqual(
            before.renderFingerprint, after.renderFingerprint,
            "le type décide de l'AFFICHAGE de l'effectif (aucun en .direct) et du glyphe du " +
            "badge de type — il doit replier dans le portillon"
        )
    }

    /// Témoin de RE-PREUVE (pas de correctif) : le compte de non-lus, que la
    /// pastille chiffrée du lot 2 rend désormais en toutes lettres, replie
    /// bien — s'il venait à sortir du hash, la pastille se figerait sur son
    /// premier nombre.
    func test_renderFingerprint_unreadCountChanges_changes() {
        var before = makeConversation(type: .group)
        var after = makeConversation(type: .group)
        before.userState.unreadCount = 3
        after.userState.unreadCount = 4
        XCTAssertNotEqual(before.renderFingerprint, after.renderFingerprint)
    }

    // MARK: - Catégorie — l'encoche haut-gauche de la carte de focus (2026-08-22)
    //
    // La carte de focus magnifiée AFFICHE le nom de la catégorie de la
    // conversation, et `LentilleFocusCard.==` ne compare la conversation QUE
    // par ce hash. `userState.sectionId` n'y était replié NULLE PART : le
    // portillon `.equatable()` gelait donc la catégorie affichée sur sa
    // première valeur, définitivement — déplacer la conversation depuis
    // l'encoche elle-même laissait l'ancien nom à l'écran jusqu'à ce qu'un
    // AUTRE champ bouge. Défaut de la MÊME famille exacte que B1 (traduction),
    // que l'effectif et que le pont : un champ affiché mais non replié n'est
    // pas une optimisation approximative, c'est un rendu qui ne se rafraîchit
    // jamais, sans qu'aucun test ne rougisse.

    func test_renderFingerprint_sectionIdChanges_changes() {
        var before = makeConversation()
        var after = makeConversation()
        before.userState.sectionId = "cat-work"
        after.userState.sectionId = "cat-family"
        XCTAssertNotEqual(
            before.renderFingerprint, after.renderFingerprint,
            "la catégorie est AFFICHÉE par l'encoche haut-gauche de la carte de focus — " +
            "la déplacer doit rouvrir le portillon, sinon la capsule garde le nom d'avant"
        )
    }

    /// Sortie de toute catégorie (« Mes conversations », `sectionId` remis à
    /// `nil`) : l'encoche doit DISPARAÎTRE. C'est la transition la plus
    /// visible des deux, et celle qu'un repli de la seule valeur non-nulle
    /// raterait.
    func test_renderFingerprint_sectionIdCleared_changes() {
        var before = makeConversation()
        let after = makeConversation()
        before.userState.sectionId = "cat-work"
        XCTAssertNil(after.userState.sectionId, "témoin de contrôle : seul le sectionId diffère ici")
        XCTAssertNotEqual(
            before.renderFingerprint, after.renderFingerprint,
            "sortir d'une catégorie retire la capsule — le portillon doit s'ouvrir aussi " +
            "quand le sectionId retombe à nil"
        )
    }
}
