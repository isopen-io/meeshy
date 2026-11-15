import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Value types

struct ConversationDashboardActivityPoint {
    let date: Date
    let label: String
    let count: Int
}

struct ConversationDashboardParticipantStat {
    let id: String
    let name: String
    let messageCount: Int
    let wordCount: Int
}

struct ConversationDashboardContentTypeStat {
    let type: String
    let icon: String
    let color: Color
    let count: Int
}

// MARK: - ConversationDashboardRules

/// Les dérivations pures du tableau de bord : activité par période, lignes par
/// participant, répartition par type de contenu. Elles ne lisent que leurs entrées.
enum ConversationDashboardRules {

    private static func formattedDateLabel(_ date: Date, period chartPeriod: ConversationDashboardView.ChartPeriod) -> String {
        if chartPeriod == .week {
            return date.formatted(.dateTime.weekday(.abbreviated))
        } else {
            return date.formatted(.dateTime.day().month(.twoDigits))
        }
    }

    static func activityPoints(
        serverDaily: [DailyActivityEntry],
        messages: [Message],
        period chartPeriod: ConversationDashboardView.ChartPeriod
    ) -> [ConversationDashboardActivityPoint] {
        if !serverDaily.isEmpty {
            let calendar = Calendar.current
            let now = Date()
            let cutoff: Date
            switch chartPeriod {
            case .week:
                cutoff = calendar.date(byAdding: .day, value: -7, to: now) ?? now
            case .month:
                cutoff = calendar.date(byAdding: .day, value: -30, to: now) ?? now
            case .all:
                cutoff = .distantPast
            }

            return serverDaily.compactMap { entry in
                // Server provides dates in "yyyy-MM-dd" format.
                guard let date = try? Date(entry.date, strategy: .iso8601.year().month().day()),
                      date >= cutoff else { return nil }
                return ConversationDashboardActivityPoint(date: date, label: formattedDateLabel(date, period: chartPeriod), count: entry.count)
            }
            .sorted { $0.date < $1.date }
        }
        return clientComputedActivityPoints(messages: messages, period: chartPeriod)
    }

    private static func clientComputedActivityPoints(
        messages: [Message],
        period chartPeriod: ConversationDashboardView.ChartPeriod
    ) -> [ConversationDashboardActivityPoint] {
        let calendar = Calendar.current
        let now = Date()

        let cutoff: Date
        let grouping: Calendar.Component
        switch chartPeriod {
        case .week:
            cutoff = calendar.date(byAdding: .day, value: -7, to: now) ?? now
            grouping = .day
        case .month:
            cutoff = calendar.date(byAdding: .day, value: -30, to: now) ?? now
            grouping = .day
        case .all:
            cutoff = .distantPast
            grouping = .weekOfYear
        }

        let filtered = messages.filter { $0.createdAt >= cutoff }
        var grouped: [Date: Int] = [:]

        for msg in filtered {
            let key = calendar.dateInterval(of: grouping, for: msg.createdAt)?.start ?? msg.createdAt
            grouped[key, default: 0] += 1
        }

        return grouped
            .sorted { $0.key < $1.key }
            .map { ConversationDashboardActivityPoint(date: $0.key, label: formattedDateLabel($0.key, period: chartPeriod), count: $0.value) }
    }

    static func participantStats(
        server serverParticipants: [ParticipantStatEntry],
        client: [ConversationDashboardClientStats.ParticipantStat]
    ) -> [ConversationDashboardParticipantStat] {
        if !serverParticipants.isEmpty {
            return serverParticipants
                .map { ConversationDashboardParticipantStat(id: $0.userId, name: $0.name ?? $0.userId, messageCount: $0.messageCount, wordCount: $0.wordCount) }
                .sorted { $0.messageCount > $1.messageCount }
        }
        return client.map {
            ConversationDashboardParticipantStat(id: $0.id, name: $0.name, messageCount: $0.messageCount, wordCount: $0.wordCount)
        }
    }

    static func contentTypeStats(messages: [Message], accent: Color) -> [ConversationDashboardContentTypeStat] {
        var textOnly = 0
        var images = 0
        var audio = 0
        var videos = 0
        var files = 0

        for msg in messages {
            if msg.attachments.isEmpty {
                if !msg.content.isEmpty { textOnly += 1 }
            }
            for att in msg.attachments {
                switch att.type {
                case .image: images += 1
                case .audio: audio += 1
                case .video: videos += 1
                case .file: files += 1
                case .location: break
                }
            }
        }

        return [
            ConversationDashboardContentTypeStat(type: String(localized: "dashboard.content.text", defaultValue: "Texte", bundle: .main), icon: "text.bubble.fill", color: accent, count: textOnly),
            ConversationDashboardContentTypeStat(type: String(localized: "dashboard.stat.photos", defaultValue: "Photos", bundle: .main), icon: "photo.fill", color: MeeshyColors.success, count: images),
            ConversationDashboardContentTypeStat(type: String(localized: "dashboard.stat.audio", defaultValue: "Audio", bundle: .main), icon: "waveform", color: MeeshyColors.indigo400, count: audio),
            ConversationDashboardContentTypeStat(type: String(localized: "dashboard.stat.videos", defaultValue: "Vidéos", bundle: .main), icon: "video.fill", color: MeeshyColors.error, count: videos),
            ConversationDashboardContentTypeStat(type: String(localized: "dashboard.content.files", defaultValue: "Fichiers", bundle: .main), icon: "doc.fill", color: MeeshyColors.warning, count: files),
        ].filter { $0.count > 0 }
    }
}
