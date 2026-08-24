import XCTest
@testable import Meeshy

/// **Le type du placeholder au catalogue doit correspondre à l'argument
/// interpolé au site d'appel.**
///
/// `String(localized: "clé", defaultValue: "Voir les \(n) commentaires")` ne
/// passe PAS le texte tel quel : `String.LocalizationValue` convertit chaque
/// interpolation en spécificateur de format — `%@` pour une `String`, `%lld`
/// pour un `Int` — puis applique les arguments à la valeur trouvée AU
/// CATALOGUE. La chaîne écrite dans le code ne sert que de repli.
///
/// Conséquence : si le catalogue annonce `%@` là où le code interpole un `Int`,
/// la substitution échoue et l'utilisateur lit « Voir les %@ commentaires ».
/// Rien ne le signale — ni le compilateur, ni le cliquet
/// `FrenchDefaultValueRatchetTests`, qui ne vérifie que la PRÉSENCE de la clé.
///
/// D'où ces tests, écrits en même temps que les 26 dernières entrées à
/// interpolation (2026-07-29). Ils sont volontairement indépendants de la
/// locale : quelle que soit la langue de l'appareil, l'argument doit apparaître
/// et aucun spécificateur ne doit survivre.
final class InterpolatedLocalizationSubstitutionTests: XCTestCase {

    /// Un `%` résiduel est la signature d'un type de placeholder qui ne
    /// correspond pas. On tolère un `%` suivi d'un espace ou d'une fin de
    /// chaîne (un vrai pourcentage typographique), pas `%@` ni `%lld`.
    private func assertFullySubstituted(
        _ produced: String, contains expected: [String],
        _ key: String, file: StaticString = #filePath, line: UInt = #line
    ) {
        for value in expected {
            XCTAssertTrue(
                produced.contains(value),
                "« \(key) » n'a pas injecté « \(value) » — produit : « \(produced) »",
                file: file, line: line
            )
        }
        for specifier in ["%@", "%lld", "%1$", "%2$"] {
            XCTAssertFalse(
                produced.contains(specifier),
                "« \(key) » laisse « \(specifier) » brut : le type de placeholder au " +
                "catalogue ne correspond pas à l'argument interpolé au site d'appel. " +
                "Produit : « \(produced) »",
                file: file, line: line
            )
        }
    }

    // MARK: - Arguments entiers (%lld)

    func test_viewComments_substitutesTheCommentCount() {
        let count = 47
        assertFullySubstituted(
            String(localized: "feed.post.view_comments",
                   defaultValue: "Voir les \(count) commentaires", bundle: .main),
            contains: ["47"], "feed.post.view_comments"
        )
    }

    /// `feed.post.comment.replies_count` (plate, « %lld réponses ») a été retiré
    /// en 240i : il gravait « 1 réponses » à l'écran. Le compteur de réponses
    /// passe maintenant par la clé PLURIELLE `feed.post.stat.replies`, servie par
    /// `PostStatAccessibility.repliesLabel`. La substitution reste vérifiée ici,
    /// l'accord CLDR par `PostStatAccessibilityTests`.
    @MainActor
    func test_repliesCount_substitutesTheReplyCount() {
        assertFullySubstituted(
            PostStatAccessibility.repliesLabel(12),
            contains: ["12"], "feed.post.stat.replies"
        )
    }

    func test_addSelected_substitutesTheSelectionCount() {
        let selected = 3
        assertFullySubstituted(
            String(localized: "composer.recent.addSelected",
                   defaultValue: "Ajouter (\(selected))", bundle: .main),
            contains: ["3"], "composer.recent.addSelected"
        )
    }

    func test_resolveFailedMultiple_substitutesTheMediaCount() {
        let count = 5
        assertFullySubstituted(
            String(localized: "recentMedia.resolveFailed.multiple",
                   defaultValue: "\(count) médias n'ont pas pu être préparés — passez par la photothèque complète",
                   bundle: .main),
            contains: ["5"], "recentMedia.resolveFailed.multiple"
        )
    }

    // MARK: - Deux arguments (positionnels)

    /// Deux entiers : une inversion d'ordre ou un `%@` de trop rendrait la
    /// progression illisible (« Envoi 5/2 » au lieu de « Envoi 2/5 »).
    func test_uploadProgress_substitutesBothCounts() {
        let uploaded = 2, total = 5
        assertFullySubstituted(
            String(localized: "voice.profile.wizard.uploadProgress",
                   defaultValue: "Envoi \(uploaded)/\(total) échantillons", bundle: .main),
            contains: ["2", "5"], "voice.profile.wizard.uploadProgress"
        )
    }

    func test_invitePermissionsSummary_substitutesBothStrings() {
        let expiration = "ExpirationSentinelle", list = "ListeSentinelle"
        assertFullySubstituted(
            String(localized: "invite.a11y.summary.permissions",
                   defaultValue: "\(expiration). Contenus autorisés : \(list)", bundle: .main),
            contains: [expiration, list], "invite.a11y.summary.permissions"
        )
    }

    func test_storyFailedAccessibility_substitutesTimeAndError() {
        let relativeTime = "TempsSentinelle", lastError = "ErreurSentinelle"
        assertFullySubstituted(
            String(localized: "story.mine.failed.a11y",
                   defaultValue: "Story non publiée, il y a \(relativeTime). \(lastError)"),
            contains: [relativeTime, lastError], "story.mine.failed.a11y"
        )
    }

    // MARK: - Argument texte (%@)

    func test_openConversation_substitutesTheConversationName() {
        let name = "NomSentinelle"
        assertFullySubstituted(
            String(localized: "widget.preview.a11y.openConversation",
                   defaultValue: "Ouvrir la conversation avec \(name)", bundle: .main),
            contains: [name], "widget.preview.a11y.openConversation"
        )
    }

    func test_publishRejected_substitutesTheServerReason() {
        let reason = "RaisonSentinelle"
        assertFullySubstituted(
            String(localized: "story.publish.queue.unrecoverable",
                   defaultValue: "La publication a été rejetée par le serveur : \(reason)",
                   bundle: .main),
            contains: [reason], "story.publish.queue.unrecoverable"
        )
    }
}
