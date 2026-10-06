import Foundation

// MARK: - La mission personnelle du jour (#9539)
//
// MIROIR de `gamePersonalMissionSchema` (`packages/shared/types/game.ts`) : une mission de plus, servie à CÔTÉ des
// trois du jour (`missions.personal`), avec sa plage horaire et son état. Jamais dans `items` : un ancien client lit
// exactement ce qu'il lisait. Tolérante — une mission personnelle illisible tombe seule, sans emporter le bloc.

public extension GameBlock {

    struct PersonalMission: Codable, Sendable, Equatable, Identifiable {

        public enum State: String, Codable, Sendable, Hashable {
            case upcoming
            case active
            case completed
            case missed
        }

        /// Les champs d'une mission (objectif, avancement, récompense) : la personnelle les porte tels quels.
        public let mission: Mission
        /// ISO 8601 : le début et la fin de la plage.
        public let startsAt: String
        public let endsAt: String
        public let state: State

        public var id: String { mission.id }
        public var startsAtDate: Date? { GameMissionClock.parse(startsAt) }
        public var endsAtDate: Date? { GameMissionClock.parse(endsAt) }

        public init(mission: Mission, startsAt: String, endsAt: String, state: State) {
            self.mission = mission
            self.startsAt = startsAt
            self.endsAt = endsAt
            self.state = state
        }

        private enum WindowKeys: String, CodingKey {
            case startsAt, endsAt, state
        }

        public init(from decoder: Decoder) throws {
            mission = try Mission(from: decoder)
            let container = try decoder.container(keyedBy: WindowKeys.self)
            startsAt = try container.decode(String.self, forKey: .startsAt)
            endsAt = try container.decode(String.self, forKey: .endsAt)
            state = try container.decode(State.self, forKey: .state)
        }

        public func encode(to encoder: Encoder) throws {
            try mission.encode(to: encoder)
            var container = encoder.container(keyedBy: WindowKeys.self)
            try container.encode(startsAt, forKey: .startsAt)
            try container.encode(endsAt, forKey: .endsAt)
            try container.encode(state, forKey: .state)
        }

        /// La phase du minuteur à `now`. Une plage illisible ne se devine pas : `nil`.
        public func phase(now: Date) -> GameMissionClock.Phase? {
            guard let start = startsAtDate, let end = endsAtDate else { return nil }
            return GameMissionClock.phase(start: start, end: end, completed: mission.isCompleted, now: now)
        }
    }
}
