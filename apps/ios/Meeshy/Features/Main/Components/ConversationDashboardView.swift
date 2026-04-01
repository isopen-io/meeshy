import SwiftUI
import Charts
import NaturalLanguage
import MeeshySDK
import MeeshyUI

// MARK: - ConversationDashboardView

struct ConversationDashboardView: View {
    let conversationId: String
    let messages: [Message]
    let accentColor: String
    let participants: [PaginatedParticipant]

    @ObservedObject private var theme = ThemeManager.shared

    @State private var chartPeriod: ChartPeriod = .week
    @State private var agentAnalysis: ConversationAnalysis?
    @State private var isLoadingAnalysis = true
    @State private var serverStats: ConversationMessageStatsResponse?
    @State private var isLoadingStats = true

    private var accent: Color { Color(hex: accentColor) }

    enum ChartPeriod: String, CaseIterable {
        case week = "7j"
        case month = "30j"
        case all = "Tout"
    }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 20) {
            if let analysis = agentAnalysis {
                agentSummarySection(analysis)
            }
            statsGrid
            activityChartSection
            if let analysis = agentAnalysis, !analysis.participantProfiles.isEmpty {
                agentParticipantProfilesSection(analysis.participantProfiles)
            }
            if !participantStats.isEmpty {
                participantBreakdownSection
            }
            sentimentSection
            contentTypesSection
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 32)
        .task { await loadAgentAnalysis() }
    }

    // MARK: - Agent Summary Section

    @ViewBuilder
    private func agentSummarySection(_ analysis: ConversationAnalysis) -> some View {
        if let summary = analysis.summary {
            VStack(alignment: .leading, spacing: 12) {
                sectionHeader(icon: "brain.head.profile.fill", title: "Analyse IA")

                if !summary.text.isEmpty {
                    Text(summary.text)
                        .font(.system(size: 13, weight: .regular))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(6)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if !summary.overallTone.isEmpty {
                    HStack(spacing: 6) {
                        Image(systemName: "theatermasks.fill")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(accent)
                        Text("Ton : \(summary.overallTone)")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(theme.textPrimary)
                    }
                }

                if !summary.currentTopics.isEmpty {
                    FlowLayout(spacing: 6) {
                        ForEach(summary.currentTopics, id: \.self) { topic in
                            Text(topic)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(accent)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(
                                    Capsule().fill(accent.opacity(theme.mode.isDark ? 0.15 : 0.1))
                                )
                        }
                    }
                }

                if summary.healthScore != nil || summary.engagementLevel != nil || summary.conflictLevel != nil {
                    Divider().opacity(0.2)

                    HStack(spacing: 14) {
                        if let health = summary.healthScore {
                            HStack(spacing: 4) {
                                Image(systemName: "heart.fill")
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundColor(healthScoreColor(health))
                                Text("\(health)/100")
                                    .font(.system(size: 12, weight: .bold, design: .rounded))
                                    .foregroundColor(healthScoreColor(health))
                            }
                        }

                        if let engagement = summary.engagementLevel, !engagement.isEmpty {
                            HStack(spacing: 3) {
                                Image(systemName: "bolt.fill")
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundColor(accent)
                                Text(engagement)
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundColor(theme.textSecondary)
                            }
                        }

                        if let conflict = summary.conflictLevel, !conflict.isEmpty {
                            HStack(spacing: 3) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundColor(conflictLevelColor(conflict))
                                Text(conflict)
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundColor(theme.textSecondary)
                            }
                        }
                    }
                }

                if let dynamique = summary.dynamique, !dynamique.isEmpty {
                    Text(dynamique)
                        .font(.system(size: 12, weight: .regular))
                        .italic()
                        .foregroundColor(theme.textSecondary)
                }

                if !summary.dominantEmotions.isEmpty {
                    FlowLayout(spacing: 6) {
                        ForEach(summary.dominantEmotions, id: \.self) { emotion in
                            Text(emotion)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(theme.textPrimary)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(
                                    Capsule().fill(accent.opacity(theme.mode.isDark ? 0.1 : 0.07))
                                )
                        }
                    }
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(accent.opacity(theme.mode.isDark ? 0.06 : 0.03))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(accent.opacity(0.15), lineWidth: 1)
            )
        }
    }

    // MARK: - Agent Participant Profiles

    private func agentParticipantProfilesSection(_ profiles: [ParticipantProfile]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(icon: "brain.fill", title: "Profils participants")

            ForEach(profiles) { profile in
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        Circle()
                            .fill(Color(hex: DynamicColorGenerator.colorForName(profile.displayName ?? profile.username ?? profile.userId)))
                            .frame(width: 10, height: 10)

                        Text(profile.displayName ?? profile.username ?? "?")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(theme.textPrimary)

                        Spacer()

                        if profile.confidence > 0 {
                            Text("\(Int(profile.confidence * 100))%")
                                .font(.system(size: 10, weight: .bold, design: .rounded))
                                .foregroundColor(theme.textMuted)
                        }
                    }

                    if !profile.personaSummary.isEmpty {
                        Text(profile.personaSummary)
                            .font(.system(size: 12))
                            .foregroundColor(theme.textSecondary)
                            .lineLimit(3)
                    }

                    HStack(spacing: 12) {
                        if !profile.tone.isEmpty {
                            profileTag(icon: "waveform.path", text: profile.tone)
                        }
                        if !profile.vocabularyLevel.isEmpty {
                            profileTag(icon: "textformat.size", text: profile.vocabularyLevel)
                        }
                    }

                    if !profile.topicsOfExpertise.isEmpty {
                        HStack(spacing: 4) {
                            ForEach(profile.topicsOfExpertise.prefix(4), id: \.self) { topic in
                                Text(topic)
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(theme.textMuted)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(
                                        Capsule().fill(theme.textMuted.opacity(0.1))
                                    )
                            }
                        }
                    }

                    if !profile.catchphrases.isEmpty {
                        HStack(spacing: 4) {
                            Image(systemName: "quote.opening")
                                .font(.system(size: 8))
                                .foregroundColor(theme.textMuted)
                            Text(profile.catchphrases.prefix(3).joined(separator: " · "))
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(theme.textMuted)
                                .italic()
                                .lineLimit(1)
                        }
                    }

                    if !profile.commonEmojis.isEmpty {
                        Text(profile.commonEmojis.prefix(8).joined(separator: " "))
                            .font(.system(size: 14))
                    }

                    if let traits = profile.traits {
                        traitsSummaryView(traits)
                    }
                }
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(theme.mode.isDark ? Color.white.opacity(0.03) : Color.black.opacity(0.015))
                )
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.mode.isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.02))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(accent.opacity(0.08), lineWidth: 1)
        )
    }

    private func profileTag(icon: String, text: String) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon)
                .font(.system(size: 9, weight: .semibold))
            Text(text)
                .font(.system(size: 11, weight: .medium))
        }
        .foregroundColor(theme.textSecondary)
    }

    // MARK: - Traits Summary

    private func traitsSummaryView(_ traits: ParticipantTraits) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if let comm = traits.communication {
                let scores = extractTraitScores(from: comm)
                if !scores.isEmpty {
                    traitCategoryRow("Communication", traits: scores)
                }
            }
            if let pers = traits.personality {
                let scores = extractTraitScores(from: pers)
                if !scores.isEmpty {
                    traitCategoryRow("Personnalite", traits: scores)
                }
            }
            if let inter = traits.interpersonal {
                let scores = extractTraitScores(from: inter)
                if !scores.isEmpty {
                    traitCategoryRow("Interpersonnel", traits: scores)
                }
            }
            if let emot = traits.emotional {
                let scores = extractTraitScores(from: emot)
                if !scores.isEmpty {
                    traitCategoryRow("Emotionnel", traits: scores)
                }
            }
        }
    }

    private func traitCategoryRow(_ category: String, traits: [TraitScore]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(category.uppercased())
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(theme.textMuted)
                .tracking(0.8)

            FlowLayout(spacing: 4) {
                ForEach(traits.prefix(5), id: \.label) { trait in
                    HStack(spacing: 3) {
                        Text(trait.label)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(theme.textSecondary)
                        Text("\(trait.score)")
                            .font(.system(size: 10, weight: .bold, design: .rounded))
                            .foregroundColor(traitScoreColor(trait.score))
                    }
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(
                        Capsule().fill(accent.opacity(theme.mode.isDark ? 0.1 : 0.06))
                    )
                }
            }
        }
    }

    private func extractTraitScores<T: Codable>(from traits: T) -> [TraitScore] {
        let mirror = Mirror(reflecting: traits)
        return mirror.children.compactMap { child -> TraitScore? in
            guard let score = child.value as? TraitScore? else { return nil }
            return score
        }
    }

    // MARK: - Color Helpers

    private func healthScoreColor(_ score: Int) -> Color {
        if score > 70 { return Color(hex: "34D399") }
        if score > 40 { return Color(hex: "FBBF24") }
        return Color(hex: "F87171")
    }

    private func conflictLevelColor(_ level: String) -> Color {
        let lower = level.lowercased()
        if lower.contains("high") || lower.contains("eleve") || lower.contains("fort") {
            return Color(hex: "F87171")
        }
        if lower.contains("medium") || lower.contains("moyen") || lower.contains("modere") {
            return Color(hex: "FBBF24")
        }
        return Color(hex: "34D399")
    }

    private func traitScoreColor(_ score: Int) -> Color {
        if score >= 70 { return Color(hex: "34D399") }
        if score >= 40 { return accent }
        return theme.textMuted
    }

    // MARK: - Stats Grid

    private var statsGrid: some View {
        let columns = [
            GridItem(.flexible(), spacing: 10),
            GridItem(.flexible(), spacing: 10)
        ]

        return LazyVGrid(columns: columns, spacing: 10) {
            miniStatCard(
                icon: "bubble.left.and.bubble.right.fill",
                value: formatNumber(effectiveTotalMessages),
                label: "Messages"
            )
            miniStatCard(
                icon: "textformat.abc",
                value: formatNumber(effectiveTotalWords),
                label: "Mots"
            )
            miniStatCard(
                icon: "character.cursor.ibeam",
                value: formatNumber(effectiveTotalCharacters),
                label: "Caracteres"
            )
            miniStatCard(
                icon: "photo.fill",
                value: formatNumber(effectiveImageCount),
                label: "Photos"
            )
            miniStatCard(
                icon: "waveform",
                value: formatNumber(effectiveAudioCount),
                label: "Audio"
            )
            miniStatCard(
                icon: "video.fill",
                value: formatNumber(effectiveVideoCount),
                label: "Videos"
            )
        }
    }

    private func miniStatCard(icon: String, value: String, label: String) -> some View {
        HStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(accent.opacity(theme.mode.isDark ? 0.15 : 0.1))
                    .frame(width: 34, height: 34)

                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(accent)
            }

            VStack(alignment: .leading, spacing: 1) {
                Text(value)
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                Text(label)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }

            Spacer(minLength: 0)
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(theme.mode.isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.02))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(accent.opacity(0.1), lineWidth: 1)
        )
    }

    // MARK: - Activity Chart

    private var activityChartSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                sectionHeader(icon: "chart.line.uptrend.xyaxis", title: "Activite")
                Spacer()
                periodPicker
            }

            let data = activityData
            if data.isEmpty {
                emptyChartPlaceholder
            } else {
                Chart {
                    ForEach(data, id: \.date) { point in
                        LineMark(
                            x: .value("Date", point.label),
                            y: .value("Messages", point.count)
                        )
                        .foregroundStyle(accent)
                        .interpolationMethod(.catmullRom)
                        .lineStyle(StrokeStyle(lineWidth: 2.5))

                        AreaMark(
                            x: .value("Date", point.label),
                            y: .value("Messages", point.count)
                        )
                        .foregroundStyle(
                            LinearGradient(
                                colors: [accent.opacity(0.3), accent.opacity(0.0)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        .interpolationMethod(.catmullRom)
                    }
                }
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 5)) { _ in
                        AxisValueLabel()
                            .font(.system(size: 9, weight: .medium))
                            .foregroundStyle(theme.textMuted)
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { _ in
                        AxisValueLabel()
                            .font(.system(size: 9, weight: .medium))
                            .foregroundStyle(theme.textMuted)
                        AxisGridLine()
                            .foregroundStyle(theme.textMuted.opacity(0.12))
                    }
                }
                .frame(height: 160)
                .animation(.easeInOut(duration: 0.3), value: chartPeriod)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.mode.isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.02))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(accent.opacity(0.08), lineWidth: 1)
        )
    }

    private var periodPicker: some View {
        HStack(spacing: 2) {
            ForEach(ChartPeriod.allCases, id: \.self) { period in
                let isSelected = chartPeriod == period
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        chartPeriod = period
                    }
                    HapticFeedback.light()
                } label: {
                    Text(period.rawValue)
                        .font(.system(size: 11, weight: isSelected ? .bold : .medium))
                        .foregroundColor(isSelected ? .white : theme.textMuted)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(
                            Capsule().fill(isSelected ? accent : Color.clear)
                        )
                }
            }
        }
        .padding(3)
        .background(
            Capsule().fill(theme.mode.isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
        )
    }

    private var emptyChartPlaceholder: some View {
        VStack(spacing: 8) {
            Image(systemName: "chart.line.uptrend.xyaxis")
                .font(.system(size: 24, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.3))
            Text("Pas assez de donnees")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(height: 120)
        .frame(maxWidth: .infinity)
    }

    // MARK: - Participant Breakdown

    private var participantBreakdownSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(icon: "person.2.fill", title: "Activite par participant")

            let stats = participantStats.prefix(10)
            let maxCount = stats.first?.messageCount ?? 1

            ForEach(Array(stats.enumerated()), id: \.element.name) { index, stat in
                HStack(spacing: 10) {
                    Circle()
                        .fill(Color(hex: DynamicColorGenerator.colorForName(stat.name)))
                        .frame(width: 8, height: 8)

                    Text(stat.name)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)
                        .frame(width: 80, alignment: .leading)

                    GeometryReader { geo in
                        let width = geo.size.width * CGFloat(stat.messageCount) / CGFloat(max(maxCount, 1))
                        RoundedRectangle(cornerRadius: 3)
                            .fill(
                                LinearGradient(
                                    colors: [accent, accent.opacity(0.6)],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: max(width, 4), height: 14)
                    }
                    .frame(height: 14)

                    Text("\(stat.messageCount)")
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .foregroundColor(theme.textSecondary)
                        .frame(width: 40, alignment: .trailing)
                }
                .padding(.vertical, 2)
                .opacity(Double(stats.count - index) / Double(stats.count) * 0.4 + 0.6)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.mode.isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.02))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(accent.opacity(0.08), lineWidth: 1)
        )
    }

    // MARK: - Sentiment Section

    private var sentimentSection: some View {
        let analysis = sentimentAnalysis
        guard analysis.total > 0 else { return AnyView(EmptyView()) }

        return AnyView(
            VStack(alignment: .leading, spacing: 12) {
                sectionHeader(icon: "face.smiling", title: "Sentiment")

                HStack(spacing: 0) {
                    sentimentSegment(
                        emoji: "\u{1F604}",
                        label: "Positif",
                        count: analysis.positive,
                        total: analysis.total,
                        color: Color(hex: "34D399")
                    )
                    sentimentSegment(
                        emoji: "\u{1F610}",
                        label: "Neutre",
                        count: analysis.neutral,
                        total: analysis.total,
                        color: Color(hex: "FBBF24")
                    )
                    sentimentSegment(
                        emoji: "\u{1F614}",
                        label: "Negatif",
                        count: analysis.negative,
                        total: analysis.total,
                        color: Color(hex: "F87171")
                    )
                }

                sentimentBar(analysis: analysis)
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(theme.mode.isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.02))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(accent.opacity(0.08), lineWidth: 1)
            )
        )
    }

    private func sentimentSegment(emoji: String, label: String, count: Int, total: Int, color: Color) -> some View {
        let pct = total > 0 ? Int(Double(count) / Double(total) * 100) : 0
        return VStack(spacing: 4) {
            Text(emoji)
                .font(.system(size: 22))
            Text("\(pct)%")
                .font(.system(size: 15, weight: .bold, design: .rounded))
                .foregroundColor(color)
            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
    }

    private func sentimentBar(analysis: SentimentResult) -> some View {
        let total = max(analysis.total, 1)
        let posFrac = CGFloat(analysis.positive) / CGFloat(total)
        let neuFrac = CGFloat(analysis.neutral) / CGFloat(total)
        let negFrac = CGFloat(analysis.negative) / CGFloat(total)

        return GeometryReader { geo in
            HStack(spacing: 2) {
                if posFrac > 0 {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color(hex: "34D399"))
                        .frame(width: max(geo.size.width * posFrac - 1, 2))
                }
                if neuFrac > 0 {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color(hex: "FBBF24"))
                        .frame(width: max(geo.size.width * neuFrac - 1, 2))
                }
                if negFrac > 0 {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color(hex: "F87171"))
                        .frame(width: max(geo.size.width * negFrac - 1, 2))
                }
            }
        }
        .frame(height: 8)
        .clipShape(RoundedRectangle(cornerRadius: 4))
    }

    // MARK: - Content Types

    private var contentTypesSection: some View {
        let types = contentTypeStats
        guard !types.isEmpty else { return AnyView(EmptyView()) }

        return AnyView(
            VStack(alignment: .leading, spacing: 12) {
                sectionHeader(icon: "square.grid.2x2.fill", title: "Types de contenu")

                ForEach(types, id: \.type) { stat in
                    HStack(spacing: 10) {
                        Image(systemName: stat.icon)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Color(hex: stat.color))
                            .frame(width: 20)

                        Text(stat.type)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(theme.textPrimary)

                        Spacer()

                        Text("\(stat.count)")
                            .font(.system(size: 13, weight: .bold, design: .rounded))
                            .foregroundColor(theme.textSecondary)
                    }
                    .padding(.vertical, 4)
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(theme.mode.isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.02))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(accent.opacity(0.08), lineWidth: 1)
            )
        )
    }

    // MARK: - Section Header

    private func sectionHeader(icon: String, title: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(accent)

            Text(title.uppercased())
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(theme.textMuted)
                .tracking(1.2)
        }
    }

    // MARK: - Load Agent Analysis

    private func loadAgentAnalysis() async {
        async let analysisTask: () = loadAnalysis()
        async let statsTask: () = loadStats()
        _ = await (analysisTask, statsTask)
    }

    private func loadAnalysis() async {
        defer { isLoadingAnalysis = false }
        do {
            agentAnalysis = try await ConversationAnalysisService.shared.fetchAnalysis(
                conversationId: conversationId
            )
        } catch {}
    }

    private func loadStats() async {
        defer { isLoadingStats = false }
        do {
            serverStats = try await ConversationAnalysisService.shared.fetchStats(
                conversationId: conversationId
            )
        } catch {}
    }

    // MARK: - Computed Stats

    private var totalWords: Int {
        messages.reduce(0) { total, msg in
            total + msg.content.split(whereSeparator: \.isWhitespace).count
        }
    }

    private var totalCharacters: Int {
        messages.reduce(0) { $0 + $1.content.count }
    }

    private var imageCount: Int {
        messages.reduce(0) { total, msg in
            total + msg.attachments.filter { $0.type == .image }.count
        }
    }

    private var audioCount: Int {
        messages.reduce(0) { total, msg in
            total + msg.attachments.filter { $0.type == .audio }.count
        }
    }

    private var videoCount: Int {
        messages.reduce(0) { total, msg in
            total + msg.attachments.filter { $0.type == .video }.count
        }
    }

    // MARK: - Effective Stats (server-first, client fallback)

    private var effectiveTotalMessages: Int { serverStats?.totalMessages ?? messages.count }
    private var effectiveTotalWords: Int { serverStats?.totalWords ?? totalWords }
    private var effectiveTotalCharacters: Int { serverStats?.totalCharacters ?? totalCharacters }
    private var effectiveImageCount: Int { serverStats?.contentTypes.image ?? imageCount }
    private var effectiveAudioCount: Int { serverStats?.contentTypes.audio ?? audioCount }
    private var effectiveVideoCount: Int { serverStats?.contentTypes.video ?? videoCount }

    // MARK: - Activity Data

    private struct ActivityPoint {
        let date: Date
        let label: String
        let count: Int
    }

    private var activityData: [ActivityPoint] {
        if let serverDaily = serverStats?.dailyActivity, !serverDaily.isEmpty {
            let dateFormatter = DateFormatter()
            dateFormatter.dateFormat = "yyyy-MM-dd"
            dateFormatter.locale = Locale(identifier: "fr_FR")

            let labelFormatter = DateFormatter()
            labelFormatter.locale = Locale(identifier: "fr_FR")

            let calendar = Calendar.current
            let now = Date()
            let cutoff: Date
            switch chartPeriod {
            case .week:
                cutoff = calendar.date(byAdding: .day, value: -7, to: now) ?? now
                labelFormatter.dateFormat = "EEE"
            case .month:
                cutoff = calendar.date(byAdding: .day, value: -30, to: now) ?? now
                labelFormatter.dateFormat = "dd/MM"
            case .all:
                cutoff = .distantPast
                labelFormatter.dateFormat = "dd/MM"
            }

            return serverDaily.compactMap { entry in
                guard let date = dateFormatter.date(from: entry.date), date >= cutoff else { return nil }
                return ActivityPoint(date: date, label: labelFormatter.string(from: date), count: entry.count)
            }
            .sorted { $0.date < $1.date }
        }
        return clientComputedActivityData
    }

    private var clientComputedActivityData: [ActivityPoint] {
        let calendar = Calendar.current
        let now = Date()
        let dateFormatter = DateFormatter()
        dateFormatter.locale = Locale(identifier: "fr_FR")

        let cutoff: Date
        let grouping: Calendar.Component
        switch chartPeriod {
        case .week:
            cutoff = calendar.date(byAdding: .day, value: -7, to: now) ?? now
            grouping = .day
            dateFormatter.dateFormat = "EEE"
        case .month:
            cutoff = calendar.date(byAdding: .day, value: -30, to: now) ?? now
            grouping = .day
            dateFormatter.dateFormat = "dd/MM"
        case .all:
            cutoff = .distantPast
            grouping = .weekOfYear
            dateFormatter.dateFormat = "dd/MM"
        }

        let filtered = messages.filter { $0.createdAt >= cutoff }
        var grouped: [Date: Int] = [:]

        for msg in filtered {
            let key = calendar.dateInterval(of: grouping, for: msg.createdAt)?.start ?? msg.createdAt
            grouped[key, default: 0] += 1
        }

        return grouped
            .sorted { $0.key < $1.key }
            .map { ActivityPoint(date: $0.key, label: dateFormatter.string(from: $0.key), count: $0.value) }
    }

    // MARK: - Participant Stats

    private struct ParticipantStat {
        let name: String
        let messageCount: Int
        let wordCount: Int
    }

    private var participantStats: [ParticipantStat] {
        if let serverParticipants = serverStats?.participantStats, !serverParticipants.isEmpty {
            return serverParticipants
                .map { ParticipantStat(name: $0.name ?? $0.userId, messageCount: $0.messageCount, wordCount: $0.wordCount) }
                .sorted { $0.messageCount > $1.messageCount }
        }
        return clientComputedParticipantStats
    }

    private var clientComputedParticipantStats: [ParticipantStat] {
        var byName: [String: (messages: Int, words: Int)] = [:]

        for msg in messages {
            let name = msg.senderName ?? "?"
            let words = msg.content.split(whereSeparator: \.isWhitespace).count
            let current = byName[name, default: (0, 0)]
            byName[name] = (current.messages + 1, current.words + words)
        }

        return byName
            .map { ParticipantStat(name: $0.key, messageCount: $0.value.messages, wordCount: $0.value.words) }
            .sorted { $0.messageCount > $1.messageCount }
    }

    // MARK: - Sentiment Analysis

    private struct SentimentResult {
        let positive: Int
        let neutral: Int
        let negative: Int
        var total: Int { positive + neutral + negative }
    }

    private var sentimentAnalysis: SentimentResult {
        let tagger = NLTagger(tagSchemes: [.sentimentScore])
        var pos = 0, neu = 0, neg = 0

        let textMessages = messages.filter { !$0.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        let sampled = textMessages.count > 200
            ? Array(textMessages.shuffled().prefix(200))
            : textMessages

        for msg in sampled {
            tagger.string = msg.content
            let (tag, _) = tagger.tag(at: msg.content.startIndex, unit: .paragraph, scheme: .sentimentScore)
            let score = Double(tag?.rawValue ?? "0") ?? 0

            if score > 0.15 { pos += 1 }
            else if score < -0.15 { neg += 1 }
            else { neu += 1 }
        }

        return SentimentResult(positive: pos, neutral: neu, negative: neg)
    }

    // MARK: - Content Types

    private struct ContentTypeStat {
        let type: String
        let icon: String
        let color: String
        let count: Int
    }

    private var contentTypeStats: [ContentTypeStat] {
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
            ContentTypeStat(type: "Texte", icon: "text.bubble.fill", color: accentColor, count: textOnly),
            ContentTypeStat(type: "Photos", icon: "photo.fill", color: "34D399", count: images),
            ContentTypeStat(type: "Audio", icon: "waveform", color: "818CF8", count: audio),
            ContentTypeStat(type: "Videos", icon: "video.fill", color: "F87171", count: videos),
            ContentTypeStat(type: "Fichiers", icon: "doc.fill", color: "FBBF24", count: files),
        ].filter { $0.count > 0 }
    }

    // MARK: - Helpers

    private func formatNumber(_ n: Int) -> String {
        if n >= 1_000_000 { return String(format: "%.1fM", Double(n) / 1_000_000) }
        if n >= 10_000 { return String(format: "%.1fk", Double(n) / 1_000) }
        if n >= 1_000 {
            let formatter = NumberFormatter()
            formatter.numberStyle = .decimal
            formatter.groupingSeparator = " "
            return formatter.string(from: NSNumber(value: n)) ?? "\(n)"
        }
        return "\(n)"
    }
}

