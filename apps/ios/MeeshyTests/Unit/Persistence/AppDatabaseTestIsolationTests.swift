import XCTest
import MeeshySDK

/// **UN PROCESSUS DE TEST N'ÉCRIT PAS DANS LE MAGASIN DURABLE DE L'APP** (#6857).
///
/// ## Ce qui était cassé
///
/// 68 écritures, réparties sur 31 fichiers de témoins, appellent
/// `CacheCoordinator.shared.<magasin>.save(…, for: "<clé de production>")` —
/// `conversations/"list"`, `feed/"bookmarks"`, `friends/friendsList`,
/// `comments/"post-…"`. Le singleton écrit sur DISQUE, dans le conteneur de
/// l'app. Jouer la suite sur un simulateur y grave donc des fixtures, qui
/// survivent à la suite et que l'app relit au démarrage suivant.
///
/// Mesuré : `GlobalSearchViewModelTests` pose
/// `MeeshyConversation(id: "conv-hydrate", title: "Alice & Bob")` sous la clé
/// `"list"`. Après la suite, la liste de conversations de l'app n'affichait
/// plus QUE cette fixture — et `ConversationListViewModel.loadMore()`, dont le
/// repli de curseur prend l'identifiant de la plus ancienne conversation
/// LOCALE, envoyait `before=conv-hydrate` à la passerelle. Instrumenté au
/// simulateur : `MESURE6857 listPage limit=100 before=conv-hydrate`.
///
/// ## Pourquoi la garde est à la RACINE et non dans les 68 appels
///
/// Le dépôt avait déjà DIAGNOSTIQUÉ le défaut — `ForwardPickerViewModel`
/// nomme `conv-hydrate` et la dépendance à l'ordre dans son doc-comment — et
/// l'avait corrigé en injectant la dépendance chez UN consommateur. L'écriture
/// est restée, donc la pollution aussi.
///
/// > Corriger les 68 appels rejouerait la discipline qui vient d'échouer : il
/// > faut y penser, et rien ne rougit quand on l'oublie. Une propriété du
/// > SYSTÈME — le magasin est en mémoire dès que le processus est un harnais
/// > de test — n'a rien à oublier, et assainit les 68 d'un coup, plus ceux qui
/// > seront écrits demain.
final class AppDatabaseTestIsolationTests: XCTestCase {

    /// L'environnement d'un processus de test porte les clés du harnais.
    /// Fixtures plutôt que processus réel : la règle s'éprouve sur les deux
    /// verdicts, pas seulement sur celui qu'on habite.
    func test_leHarnaisSeReconnait_àSesVariablesDEnvironnement() {
        XCTAssertTrue(AppDatabase.runsUnderTestHarness(
            environment: ["XCTestConfigurationFilePath": "/tmp/x.xctestconfiguration"]))
        XCTAssertTrue(AppDatabase.runsUnderTestHarness(
            environment: ["XCTestBundlePath": "/tmp/MeeshyTests.xctest"]))
    }

    /// Le cas NÉGATIF, sans lequel un prédicat qui rend toujours `true`
    /// passerait — et rendrait le magasin éphémère jusque dans l'app livrée.
    func test_unProcessusOrdinaire_nEstPasUnHarnais() {
        XCTAssertFalse(AppDatabase.runsUnderTestHarness(environment: [:]))
        XCTAssertFalse(AppDatabase.runsUnderTestHarness(
            environment: ["HOME": "/Users/x", "LANG": "fr_FR.UTF-8"]))
    }

    /// **La loi appliquée à CE processus.** Le témoin ci-dessus prouve que le
    /// prédicat sait répondre ; celui-ci prouve qu'il est BRANCHÉ. Sans lui, un
    /// prédicat juste mais jamais appelé laisserait la pollution intacte —
    /// c'est exactement la forme du défaut d'origine.
    func test_ceProcessusEstReconnu_doncSonMagasinNeTouchePasLeDisque() {
        XCTAssertTrue(
            AppDatabase.runsUnderTestHarness(environment: ProcessInfo.processInfo.environment),
            "le harnais doit se reconnaître ICI, sinon la garde ne protège rien")
        XCTAssertTrue(
            AppDatabase.shared.isEphemeral,
            "sous test, le magasin partagé vit en mémoire — écrire sur le disque du simulateur y grave des fixtures que l'app relit")
    }
}
