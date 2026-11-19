import AppIntents
import MeeshySDK
import MeeshyUI
import Foundation

/// Où mène le raccourci Talkie (#19732) : la fiche du proche, ouverte sur la face Actions qui porte la carte Talkie —
/// un seul geste entre le raccourci et « Maintenir pour parler ».
enum TalkieShortcutRoute {
    static func url(username: String) -> URL? {
        guard let vitrine = VitrineOpenRouter.vitrineURL(username: username),
              var components = URLComponents(url: vitrine, resolvingAgainstBaseURL: false) else { return nil }
        components.queryItems = [URLQueryItem(name: DeepLinkParser.faceQueryKey, value: RelationFace.actions.rawValue)]
        return components.url
    }
}

/// **« Maintenir : Talkie avec Léo »** (planche `Hors-App`, vue 4, #19524) : le raccourci que le Bouton Action, Siri et
/// Raccourcis proposent. Il ouvre la fiche du proche sur la face Actions, où la carte Talkie se maintient pour parler.
///
/// Les personnes proposées sont celles du widget « Mes proches » — le même cliché du groupe d'app
/// (`ClosePeopleWidgetKeys`), Proche et au-dessus. Une personne qui n'y est plus ne se résout plus : un raccourci
/// enregistré pour elle demande alors de choisir, il n'ouvre jamais une vitrine au hasard. La vitrine elle-même ne montre
/// le Talkie qu'au cercle qui l'ouvre.
@available(iOS 18.0, *)
struct TalkieWithCloseOneIntent: AppIntent {
    static let title = LocalizedStringResource("intent.talkie.title", defaultValue: "Talkie with a close one")
    static let description = IntentDescription(LocalizedStringResource(
        "intent.talkie.description", defaultValue: "Hold to talk to a close one, release to send"
    ))
    static let openAppWhenRun: Bool = true

    @Parameter(title: LocalizedStringResource("intent.talkie.person", defaultValue: "Close one"),
               requestValueDialog: IntentDialog(LocalizedStringResource("intent.talkie.ask", defaultValue: "Who do you want to talk to?")))
    var person: ClosePersonEntity?

    static var parameterSummary: some ParameterSummary {
        Summary("Talkie with \(\.$person)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & OpensIntent {
        let chosen: ClosePersonEntity
        if let person {
            chosen = person
        } else {
            chosen = try await $person.requestValue()
        }
        guard let url = chosen.username.flatMap(TalkieShortcutRoute.url(username:)) else {
            throw $person.needsValueError()
        }
        return .result(opensIntent: OpenURLIntent(url))
    }
}

/// Un proche, tel que le cliché « Mes proches » le publie.
struct ClosePersonEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(
        name: LocalizedStringResource("intent.talkie.person", defaultValue: "Close one")
    )
    static let defaultQuery = ClosePersonQuery()

    let id: String
    let name: String
    let username: String?

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }

    init(_ person: WidgetClosePerson) {
        id = person.id
        name = person.name
        username = person.username
    }
}

struct ClosePersonQuery: EntityQuery {
    /// Le cliché du groupe d'app, seule source des personnes proposées.
    static func published(suiteName: String = UserPreferencesManager.appGroupSuiteName) -> [ClosePersonEntity] {
        let data = UserDefaults(suiteName: suiteName)?.data(forKey: ClosePeopleWidgetKeys.defaultsKey)
        return ClosePeopleWidgetKeys.decode(data)
            .filter { $0.username?.isEmpty == false }
            .map { ClosePersonEntity($0) }
    }

    func entities(for identifiers: [String]) async throws -> [ClosePersonEntity] {
        Self.published().filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [ClosePersonEntity] {
        Self.published()
    }
}
