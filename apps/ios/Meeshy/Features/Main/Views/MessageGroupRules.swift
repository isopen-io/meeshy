import MeeshySDK

/// Règle pure du groupe de rangées (Script/Focal, #3919) : à partir de la
/// chronologie du store, remonte tant que le message précédent CONTINUE le
/// groupe (`MessageDayGrouping`, même règle que `isFirstInGroup`/`isLastInGroup`).
enum MessageGroupRules {
    /// Identifiants (ordre : du dernier vers le plus ancien) du groupe qui se
    /// TERMINE à `lastIndex` dans `messages`.
    static func idsInGroup(endingAt lastLocalId: String, lastIndex: Int, messages: [MessageRecord]) -> [String] {
        var ids = [lastLocalId]
        var index = lastIndex
        while index > 0 {
            let current = messages[index]
            let previous = messages[index - 1]
            let isHead = MessageDayGrouping.isGroupHead(
                previous: .init(
                    senderId: previous.senderId,
                    isSystem: previous.messageSource == MeeshyMessage.MessageSource.system.rawValue,
                    createdAt: previous.createdAt
                ),
                current: .init(
                    senderId: current.senderId,
                    isSystem: current.messageSource == MeeshyMessage.MessageSource.system.rawValue,
                    createdAt: current.createdAt
                )
            )
            if isHead { break }
            ids.append(previous.localId)
            index -= 1
        }
        return ids
    }
}
