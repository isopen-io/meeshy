import Foundation
import SwiftUI
import Combine
import MeeshySDK

public nonisolated enum JoinFlowPhase: Equatable, Sendable {
    case loading
    case preview
    case form
    case success
    case error(String)
}

public nonisolated enum JoinFlowEntry: Sendable {
    case landing
    case anonymousForm
}

@MainActor
public protocol JoinFlowModeling: ObservableObject {
    var linkInfo: ShareLinkInfo? { get }
    var joinResult: AnonymousJoinResponse? { get }
    var phase: JoinFlowPhase { get set }
    var errorMessage: String? { get }
    var entry: JoinFlowEntry { get }
    var firstName: String { get set }
    var lastName: String { get set }
    var username: String { get set }
    var email: String { get set }
    var birthday: Date { get set }
    var language: String { get set }
    var isSubmitting: Bool { get }
    var isFormValid: Bool { get }

    func loadLinkInfo() async
    func proceedToForm()
    func submitJoin() async
}

public nonisolated struct JoinFlowLanguageOption: Sendable, Hashable {
    public let code: String
    public let endonym: String
}

public nonisolated enum JoinFlowLanguages {
    public static let offered: [JoinFlowLanguageOption] = [
        JoinFlowLanguageOption(code: "fr", endonym: "Français"),
        JoinFlowLanguageOption(code: "en", endonym: "English"),
        JoinFlowLanguageOption(code: "es", endonym: "Español"),
        JoinFlowLanguageOption(code: "de", endonym: "Deutsch"),
        JoinFlowLanguageOption(code: "it", endonym: "Italiano"),
        JoinFlowLanguageOption(code: "pt", endonym: "Português"),
        JoinFlowLanguageOption(code: "nl", endonym: "Nederlands"),
        JoinFlowLanguageOption(code: "pl", endonym: "Polski"),
        JoinFlowLanguageOption(code: "tr", endonym: "Türkçe"),
        JoinFlowLanguageOption(code: "ru", endonym: "Русский"),
        JoinFlowLanguageOption(code: "ar", endonym: "العربية"),
        JoinFlowLanguageOption(code: "zh", endonym: "中文"),
        JoinFlowLanguageOption(code: "ja", endonym: "日本語"),
        JoinFlowLanguageOption(code: "ko", endonym: "한국어")
    ]

    public static func defaultLanguage(for deviceLanguages: [String]) -> String {
        let codes = Set(offered.map(\.code))
        let deviceOffered = deviceLanguages
            .compactMap { MeeshyUser.normalizeLanguageCode($0) }
            .first(where: { codes.contains($0) })
        return deviceOffered ?? "fr"
    }
}

public nonisolated enum JoinFlowWire {
    public static func birthdayField(_ birthday: Date, required: Bool) -> String? {
        required ? WireDate.string(from: birthday) : nil
    }
}
