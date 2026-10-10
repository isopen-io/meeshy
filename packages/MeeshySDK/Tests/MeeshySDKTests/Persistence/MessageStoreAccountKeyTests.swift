import Foundation
import Testing
@testable import MeeshySDK

/// #8656 / #8657 — la base locale des messages est un fichier PAR COMPTE, et le
/// compte se dit « utilisateur + environnement » : un même identifiant existe
/// en production ET en staging.
struct MessageStoreAccountKeyTests {

    private let production = "https://gate.meeshy.me"
    private let staging = "https://gate.staging.meeshy.me"

    @Test func twoUsersOfTheSameEnvironmentGetTwoFiles() throws {
        let alice = try #require(MessageStoreAccountKey(userId: "a1", serverOrigin: production))
        let bob = try #require(MessageStoreAccountKey(userId: "b2", serverOrigin: production))

        #expect(alice.databaseFileName != bob.databaseFileName)
    }

    @Test func theSameUserInTwoEnvironmentsGetsTwoFiles() throws {
        let prod = try #require(MessageStoreAccountKey(userId: "a1", serverOrigin: production))
        let stag = try #require(MessageStoreAccountKey(userId: "a1", serverOrigin: staging))

        #expect(prod != stag)
        #expect(prod.databaseFileName != stag.databaseFileName)
    }

    @Test func theSameAccountAlwaysGetsTheSameFile() throws {
        let first = try #require(MessageStoreAccountKey(userId: "a1", serverOrigin: production))
        let second = try #require(MessageStoreAccountKey(userId: "a1", serverOrigin: "HTTPS://Gate.Meeshy.me/"))

        #expect(first == second)
        #expect(first.databaseFileName == second.databaseFileName)
    }

    @Test func noUserMeansNoAccountStore() {
        #expect(MessageStoreAccountKey(userId: nil, serverOrigin: production) == nil)
        #expect(MessageStoreAccountKey(userId: "", serverOrigin: production) == nil)
        #expect(MessageStoreAccountKey(userId: "   ", serverOrigin: production) == nil)
    }

    @Test func theFileNameIsRecognisedAsAnAccountStoreAndNeverAsTheLegacyOne() throws {
        let key = try #require(MessageStoreAccountKey(userId: "a1", serverOrigin: production))

        #expect(MessageStoreAccountKey.isAccountStoreFileName(key.databaseFileName))
        #expect(!MessageStoreAccountKey.isAccountStoreFileName(MessageStoreAccountKey.legacyDatabaseFileName))
        #expect(!MessageStoreAccountKey.isAccountStoreFileName(key.databaseFileName + "-wal"))
        #expect(key.databaseFileName != MessageStoreAccountKey.legacyDatabaseFileName)
    }

    @Test func theFileNameDoesNotExposeTheUserId() throws {
        let key = try #require(MessageStoreAccountKey(userId: "65f0c0ffee0000000000abcd", serverOrigin: production))

        #expect(!key.databaseFileName.contains("65f0c0ffee0000000000abcd"))
    }

    // MARK: - Côté extension : le compte ACTIF lu dans l'App Group

    @Test func theExtensionResolvesTheActiveAccountFromTheAppGroup() throws {
        let defaults = try #require(UserDefaults(suiteName: "test.messageStoreKey.\(UUID().uuidString)"))
        defaults.set("a1", forKey: MessageStoreAccountKey.activeUserIdDefaultsKey)

        let resolved = MessageStoreAccountKey.activeAccount(appGroupDefaults: defaults, serverOrigin: staging)

        #expect(resolved == MessageStoreAccountKey(userId: "a1", serverOrigin: staging))
    }

    @Test func theExtensionResolvesNothingWhenNobodyIsSignedIn() throws {
        let defaults = try #require(UserDefaults(suiteName: "test.messageStoreKey.\(UUID().uuidString)"))

        #expect(MessageStoreAccountKey.activeAccount(appGroupDefaults: defaults, serverOrigin: production) == nil)
        #expect(MessageStoreAccountKey.activeAccount(appGroupDefaults: nil, serverOrigin: production) == nil)
    }
}

/// #8657 — l'environnement d'un compte se lit dans la SÉLECTION persistée, pas
/// dans `apiBaseURL` : le conteneur de dépendances ouvre la base avant que
/// `restoreEnvironment()` n'ait tourné.
struct MeeshyConfigPersistedOriginTests {

    @Test func thePersistedOriginFollowsTheSelectedEnvironment() {
        let config = MeeshyConfig.shared
        let saved = config.selectedEnvironment
        defer { config.selectedEnvironment = saved }

        config.selectedEnvironment = .staging
        #expect(config.persistedServerOrigin == MeeshyConfig.ServerEnvironment.staging.origin)

        config.selectedEnvironment = .production
        #expect(config.persistedServerOrigin == MeeshyConfig.ServerEnvironment.production.origin)
    }
}
