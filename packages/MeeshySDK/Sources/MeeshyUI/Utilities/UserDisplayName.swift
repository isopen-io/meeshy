import Foundation
import MeeshySDK

// MARK: - Display Name Resolution

private func resolveDisplayName(displayName: String?, firstName: String? = nil, lastName: String? = nil, username: String?, fallback: String) -> String {
    if let dn = displayName?.trimmingCharacters(in: .whitespaces), !dn.isEmpty { return dn }
    let first = firstName?.trimmingCharacters(in: .whitespaces) ?? ""
    let last = lastName?.trimmingCharacters(in: .whitespaces) ?? ""
    let full = "\(first) \(last)".trimmingCharacters(in: .whitespaces)
    if !full.isEmpty { return full }
    if let un = username?.trimmingCharacters(in: .whitespaces), !un.isEmpty { return un }
    return fallback
}

public func getUserDisplayName(_ user: MeeshyUser?, fallback: String = "Utilisateur inconnu") -> String {
    guard let user else { return fallback }
    return resolveDisplayName(displayName: user.displayName, firstName: user.firstName, lastName: user.lastName, username: user.username, fallback: fallback)
}

public func getUserDisplayName(_ sender: APIMessageSender?, fallback: String = "Utilisateur inconnu") -> String {
    guard let sender else { return fallback }
    return resolveDisplayName(displayName: sender.displayName, username: sender.username, fallback: fallback)
}

public func getUserDisplayName(_ user: APIConversationUser?, fallback: String = "Utilisateur inconnu") -> String {
    guard let user else { return fallback }
    return resolveDisplayName(displayName: user.displayName, username: user.username, fallback: fallback)
}

public func getUserDisplayName(_ author: APIAuthor?, fallback: String = "Utilisateur inconnu") -> String {
    guard let author else { return fallback }
    return resolveDisplayName(displayName: author.displayName, username: author.username, fallback: fallback)
}
