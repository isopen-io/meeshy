import Foundation

/// **« Mes proches »** (planche `Hors-App`, vue 3, #19524) : le contrat du groupe d'app entre l'app, qui publie, le
/// widget, qui peint, et le raccourci Talkie, qui propose les mêmes personnes.
///
/// Compilé dans les DEUX cibles (`project.yml`) : une seule définition tient les deux bouts du fil. Une personne n'y
/// entre que Proche ou au-dessus ; sa présence est celle que la passerelle m'a servie, jamais fabriquée.
nonisolated struct WidgetClosePerson: Codable, Equatable, Identifiable, Sendable {
    /// L'identifiant de la PERSONNE (jamais d'une conversation).
    let id: String
    let name: String
    /// Le pseudo de sa vitrine ; `nil` : l'appui ouvre l'app sans fiche.
    let username: String?
    let accentHex: String
    /// Jeton `PresenceState.rawValue` servi ; absent ⇒ aucune pastille.
    let presence: String?
    /// Le cercle, pour l'ordre et pour VoiceOver (`CLOSE`, `BLOOD`).
    let level: String
}

nonisolated enum ClosePeopleWidgetKeys {
    static let kind = "ClosePeople"
    static let defaultsKey = "close_people"
    /// Le petit widget en montre quatre (2 × 2) ; l'app en publie jusqu'à huit pour le raccourci Talkie.
    static let smallCount = 4
    static let publishedCap = 8

    static func decode(_ data: Data?) -> [WidgetClosePerson] {
        guard let data else { return [] }
        return (try? JSONDecoder().decode([WidgetClosePerson].self, from: data)) ?? []
    }
}
