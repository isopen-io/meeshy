// apps/ios/Meeshy/Features/Main/Views/MessageListViewController+RowGrouping.swift

import Foundation
import MeeshySDK

// Le regroupement des rangées du fil : une même loi (`MessageDayGrouping`) pour la queue des bulles et la tête des rangées plates (#10758).

enum MessageRowGrouping {

    static func candidate(of record: MessageRecord) -> MessageDayGrouping.GroupCandidate {
        .init(
            senderId: record.senderId,
            isSystem: record.messageSource == MeeshyMessage.MessageSource.system.rawValue,
            createdAt: record.createdAt
        )
    }

    static func candidate(of message: MeeshyMessage) -> MessageDayGrouping.GroupCandidate {
        .init(
            senderId: message.senderId,
            isSystem: message.messageSource == .system,
            createdAt: message.createdAt
        )
    }

    static func isLastInGroup(
        _ current: MessageDayGrouping.GroupCandidate,
        at index: Int?,
        in records: [MessageRecord]
    ) -> Bool {
        guard let index, index + 1 < records.count else { return true }
        return MessageDayGrouping.isGroupTail(current: current, next: candidate(of: records[index + 1]))
    }

    static func isFirstInGroup(
        _ current: MessageDayGrouping.GroupCandidate,
        at index: Int?,
        in records: [MessageRecord]
    ) -> Bool {
        guard let index, index > 0 else { return true }
        return MessageDayGrouping.isGroupHead(previous: candidate(of: records[index - 1]), current: current)
    }
}
