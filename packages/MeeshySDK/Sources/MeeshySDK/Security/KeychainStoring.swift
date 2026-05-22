import Foundation

public protocol KeychainStoring: Sendable {
    func save(_ value: String, forKey key: String, account: String?) throws
    func load(forKey key: String, account: String?) -> String?
    func delete(forKey key: String, account: String?)
    func saveAsync(_ value: String, forKey key: String, account: String?) async throws
    func loadAsync(forKey key: String, account: String?) async -> String?
}
