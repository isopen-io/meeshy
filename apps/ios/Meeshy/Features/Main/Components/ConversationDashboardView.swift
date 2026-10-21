import SwiftUI
import Combine
import os
import Charts
import MeeshySDK
import MeeshyUI

// MARK: - ConversationDashboardView

struct ConversationDashboardView: View {
    let conversationId: String
    let messages: [Message]
    let accentColor: String

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    @State private var chartPeriod: ChartPeriod = .week
    @State private var agentAnalysis: ConversationAnalysis?
    @State private var serverStats: ConversationMessageStatsResponse?
    @State private var sectionsAppeared = false
    @State private var ringsAnimated = false
    @State private var clientStats: ConversationDashboardClientStats?

    private var accent: Color { Color(hex: accentColor) }

    enum ChartPeriod: CaseIterable {
        case week
        case month
        case all

        var shortLabel: String {
            switch self {
            case .week: return String(localized: "dashboard.period.week.short", defaultValue: "7j", bundle: .main)
            case .month: return String(localized: "dashboard.period.month.short", defaultValue: "30j", bundle: .main)
            case .all: return String(localized: "dashboard.period.all.short", defaultValue: "Tout", bundle: .main)
            }
        }

        var accessibilityLabel: String {
            switch self {
            case .week: return String(localized: "dashboard.period.week", defaultValue: "7 derniers jours", bundle: .main)
            case .month: return String(localized: "dashboard.period.month", defaultValue: "30 derniers jours", bundle: .main)
            case .all: return String(localized: "dashboard.period.all", defaultValue: "Depuis le début", bundle: .main)
            }
        }
    }

    // MARK: - Body

    var body: some View {
        let activity = activityData
        let participants = participantStats
        let types = contentTypeStats
        VStack(spacing: MeeshySpacing.xl) {
            if let analysis = agentAnalysis {
                heroHealthCard(analysis)
                    .staggerIn(sectionsAppeared, index: 0)
            }
            statsRingsSection
                .staggerIn(sectionsAppeared, index: 1)
            if !activity.isEmpty {
                activityChartSection(activity)
                    .staggerIn(sectionsAppeared, index: 2)
            }
            if let analysis = agentAnalysis, !analysis.participantProfiles.isEmpty {
                ConversationDashboardProfilesSection(profiles: analysis.participantProfiles, accent: accent)
                    .staggerIn(sectionsAppeared, index: 3)
            }
            if !participants.isEmpty {
                ConversationDashboardBreakdownSection(participants: participants, accent: accent)
                    .staggerIn(sectionsAppeared, index: 4)
            }
            if let sentiment = clientStats?.sentiment, sentiment.total > 0 {
                ConversationDashboardSentimentSection(analysis: sentiment, accent: accent)
                    .staggerIn(sectionsAppeared, index: 5)
            }
            if !types.isEmpty {
                ConversationDashboardContentTypesSection(types: types, accent: accent)
                    .staggerIn(sectionsAppeared, index: 6)
            }
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.top, MeeshySpacing.md)
        .padding(.bottom, MeeshySpacing.xxxl)
        .task { await loadAgentAnalysis() }
        .task(id: messages.count) {
            let snapshot = messages
            let stats = await Task.detached(priority: .utility) {
                ConversationDashboardClientStats(messages: snapshot)
            }.value
            guard !Task.isCancelled else { return }
            clientStats = stats
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.6)) {
                sectionsAppeared = true
            }
        }
        .onAppear(after: .milliseconds(300)) {
            withAnimation(.spring(response: 0.8, dampingFraction: 0.7)) {
                ringsAnimated = true
            }
        }
    }

    // MARK: - Hero Health Card

    @ViewBuilder
    private func heroHealthCard(_ analysis: ConversationAnalysis) -> some View {
        if let summary = analysis.summary {
            sectionCard {
                sectionHeader(icon: "brain.head.profile.fill", title: String(localized: "dashboard.section.ai-analysis", defaultValue: "Analyse IA", bundle: .main))

                if let health = summary.healthScore {
                    VStack(spacing: MeeshySpacing.xs) {
                        ArcGauge(
                            score: health,
                            accent: accent,
                            scoreColor: healthScoreColor(health)
                        )
                        .frame(height: 100)

                        Text(String(localized: "dashboard.health", defaultValue: "Santé", bundle: .main))
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .heavy, design: .rounded))
                            .foregroundColor(theme.textMuted)
                            .tracking(1.0)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, MeeshySpacing.xs)
                    // VoiceOver : la jauge d'arc + son libellé « Santé » forment un seul
                    // score. Sans regroupement, VoiceOver lisait « 78 » nu (dans l'arc) puis
                    // « Santé » séparément. Un élément unique « Santé : 78 » (clé déjà
                    // localisée, valeur brute — 0 clé i18n neuve, cohérent avec StatRing).
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(String(localized: "dashboard.health", defaultValue: "Santé", bundle: .main))
                    .accessibilityValue(LocalizedNumber.exact(health))

                    if summary.engagementLevel != nil || summary.conflictLevel != nil {
                        HStack(spacing: MeeshySpacing.smPlus) {
                            if let engagement = summary.engagementLevel, !engagement.isEmpty {
                                metricPill(
                                    icon: "bolt.fill",
                                    text: engagement,
                                    color: accent
                                )
                            }
                            if let conflict = summary.conflictLevel, !conflict.isEmpty {
                                metricPill(
                                    icon: "exclamationmark.triangle.fill",
                                    text: conflict,
                                    color: conflictLevelColor(conflict)
                                )
                            }
                        }
                    }
                } else if !summary.text.isEmpty {
                    HStack(alignment: .top, spacing: MeeshySpacing.xs) {
                        Text("\u{201C}")
                            // Dynamic Type exception: decorative opening-quote glyph, absolute offset(y:) tuned to its point size
                            .font(.system(size: 48, weight: .bold, design: .serif))
                            .foregroundColor(accent.opacity(MeeshyOpacity.medium))
                            .offset(y: -12)
                        Text(summary.text)
                            .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .regular, design: .serif))
                            .italic()
                            .foregroundColor(theme.textSecondary)
                            .lineLimit(6)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                if summary.healthScore != nil, !summary.text.isEmpty {
                    Text(summary.text)
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .regular, design: .serif))
                        .italic()
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(4)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if !summary.currentTopics.isEmpty {
                    FlowLayout(spacing: 6) {
                        ForEach(summary.currentTopics, id: \.self) { topic in
                            Text(topic)
                                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                                .foregroundColor(accent)
                                .padding(.horizontal, MeeshySpacing.smPlus)
                                .padding(.vertical, MeeshySpacing.xs)
                                .background(
                                    Capsule().fill(accent.opacity(isDark ? 0.12 : 0.08))
                                )
                        }
                    }
                }

                if !summary.dominantEmotions.isEmpty {
                    FlowLayout(spacing: 5) {
                        ForEach(summary.dominantEmotions, id: \.self) { emotion in
                            Text(emotion)
                                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                                .foregroundColor(theme.textSecondary)
                                .padding(.horizontal, MeeshySpacing.sm)
                                .padding(.vertical, MeeshySpacing.xxs)
                                .background(
                                    Capsule()
                                        .fill(accent.opacity(isDark ? 0.08 : 0.05))
                                )
                        }
                    }
                }

                if !summary.overallTone.isEmpty {
                    HStack(spacing: MeeshySpacing.xsPlus) {
                        Image(systemName: "theatermasks.fill")
                            .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .semibold))
                            .foregroundColor(accent)
                        Text(String(format: String(localized: "dashboard.tone", defaultValue: "Ton : %@", bundle: .main), summary.overallTone))
                            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                            .foregroundColor(theme.textPrimary)
                    }
                }

                if let dynamique = summary.dynamique, !dynamique.isEmpty {
                    Text(dynamique)
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .regular, design: .serif))
                        .italic()
                        .foregroundColor(theme.textMuted)
                }
            }
        }
    }

    private func metricPill(icon: String, text: String, color: Color) -> some View {
        HStack(spacing: MeeshySpacing.xs) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .semibold))
                .foregroundColor(color)
            Text(text)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .foregroundColor(theme.textPrimary)
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.xsPlus)
        .background(
            Capsule().fill(color.opacity(isDark ? 0.12 : 0.08))
        )
    }

    // MARK: - Stats Rings Section

    private var statsRingsSection: some View {
        sectionCard {
            sectionHeader(icon: "chart.bar.fill", title: String(localized: "dashboard.section.statistics", defaultValue: "Statistiques", bundle: .main))

            let maxMsg = max(effectiveTotalMessages, 1)
            let maxWords = max(effectiveTotalWords, 1)
            let mediaMax = max(max(effectiveImageCount, max(effectiveAudioCount, max(effectiveVideoCount, max(effectiveLinkCount, effectiveDocCount)))), 1)

            HStack(spacing: MeeshySpacing.lg) {
                StatRing(
                    value: effectiveTotalMessages,
                    maxValue: maxMsg,
                    label: String(localized: "dashboard.stat.messages", defaultValue: "Messages", bundle: .main),
                    accent: accent,
                    textColor: theme.textPrimary,
                    mutedColor: theme.textMuted,
                    animated: ringsAnimated
                )
                StatRing(
                    value: effectiveTotalWords,
                    maxValue: maxWords,
                    label: String(localized: "dashboard.stat.words", defaultValue: "Mots", bundle: .main),
                    accent: accent,
                    textColor: theme.textPrimary,
                    mutedColor: theme.textMuted,
                    animated: ringsAnimated
                )
                StatRing(
                    value: effectiveImageCount,
                    maxValue: mediaMax,
                    label: String(localized: "dashboard.stat.photos", defaultValue: "Photos", bundle: .main),
                    accent: accent,
                    textColor: theme.textPrimary,
                    mutedColor: theme.textMuted,
                    animated: ringsAnimated
                )
            }

            HStack(spacing: MeeshySpacing.lg) {
                StatRing(
                    value: effectiveAudioCount,
                    maxValue: mediaMax,
                    label: String(localized: "dashboard.stat.audio", defaultValue: "Audio", bundle: .main),
                    accent: accent,
                    textColor: theme.textPrimary,
                    mutedColor: theme.textMuted,
                    animated: ringsAnimated
                )
                StatRing(
                    value: effectiveVideoCount,
                    maxValue: mediaMax,
                    label: String(localized: "dashboard.stat.videos", defaultValue: "Vidéos", bundle: .main),
                    accent: accent,
                    textColor: theme.textPrimary,
                    mutedColor: theme.textMuted,
                    animated: ringsAnimated
                )
                StatRing(
                    value: effectiveLinkCount,
                    maxValue: mediaMax,
                    label: String(localized: "dashboard.stat.links", defaultValue: "Liens", bundle: .main),
                    accent: accent,
                    textColor: theme.textPrimary,
                    mutedColor: theme.textMuted,
                    animated: ringsAnimated
                )
            }

            if effectiveDocCount > 0 {
                HStack(spacing: MeeshySpacing.lg) {
                    StatRing(
                        value: effectiveDocCount,
                        maxValue: mediaMax,
                        label: String(localized: "dashboard.stat.documents", defaultValue: "Documents", bundle: .main),
                        accent: accent,
                        textColor: theme.textPrimary,
                        mutedColor: theme.textMuted,
                        animated: ringsAnimated
                    )
                    Spacer()
                    Spacer()
                }
            }
        }
    }

    // MARK: - Activity Chart

    private func activityChartSection(_ data: [ConversationDashboardActivityPoint]) -> some View {
        sectionCard {
            HStack {
                sectionHeader(icon: "chart.line.uptrend.xyaxis", title: String(localized: "dashboard.section.activity", defaultValue: "Activité", bundle: .main))
                Spacer()
                periodPicker
            }

            Chart {
                ForEach(data, id: \.date) { point in
                    LineMark(
                        x: .value("Date", point.label),
                        y: .value("Messages", point.count)
                    )
                    .foregroundStyle(accent)
                    .interpolationMethod(.catmullRom)
                    .lineStyle(StrokeStyle(lineWidth: MeeshyBorder.strong))

                    AreaMark(
                        x: .value("Date", point.label),
                        y: .value("Messages", point.count)
                    )
                    .foregroundStyle(
                        LinearGradient(
                            colors: [accent.opacity(0.4), accent.opacity(0.0)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .interpolationMethod(.catmullRom)
                }

                if let last = data.last {
                    PointMark(
                        x: .value("Date", last.label),
                        y: .value("Messages", last.count)
                    )
                    .foregroundStyle(accent)
                    .symbolSize(40)
                }
            }
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 5)) { _ in
                    AxisValueLabel()
                        // Dynamic Type exception: Swift Charts axis label kept compact inside the fixed-height chart
                        .font(.system(size: 9, weight: .medium))
                        .foregroundStyle(theme.textMuted)
                }
            }
            .chartYAxis {
                AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { _ in
                    AxisValueLabel()
                        // Dynamic Type exception: Swift Charts axis label kept compact inside the fixed-height chart
                        .font(.system(size: 9, weight: .medium))
                        .foregroundStyle(theme.textMuted)
                    AxisGridLine()
                        .foregroundStyle(theme.textMuted.opacity(MeeshyOpacity.light))
                }
            }
            .frame(height: 160)
            .animation(.easeInOut(duration: 0.3), value: chartPeriod)
        }
    }

    private var periodPicker: some View {
        HStack(spacing: MeeshySpacing.xxs) {
            ForEach(ChartPeriod.allCases, id: \.self) { period in
                let isSelected = chartPeriod == period
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        chartPeriod = period
                    }
                    HapticFeedback.light()
                } label: {
                    Text(period.shortLabel)
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: isSelected ? .bold : .medium))
                        .foregroundColor(isSelected ? .white : theme.textMuted)
                        .padding(.horizontal, MeeshySpacing.smPlus)
                        .padding(.vertical, MeeshySpacing.xs)
                        .background(
                            Capsule().fill(isSelected ? accent : Color.clear)
                        )
                }
                .accessibilityLabel(period.accessibilityLabel)
                // Selection is otherwise signalled by fill + weight only — the
                // `.isSelected` trait lets VoiceOver announce the active period
                // (mirror of CallsTab.chip / GlobalSearchView.tabButton doctrine).
                .accessibilityAddTraits(isSelected ? [.isSelected] : [])
            }
        }
        .padding(MeeshySpacing.xxs)
        .background(
            Capsule().fill(MeeshyColors.surfaceFill(isDark: isDark))
        )
    }

    // MARK: - Section Container & Header

    private func sectionCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        ConversationDashboardSectionCard(accent: accent, content: content)
    }

    private func sectionHeader(icon: String, title: String) -> some View {
        ConversationDashboardSectionHeader(icon: icon, title: title, accent: accent)
    }

    // MARK: - Color Helpers

    private func healthScoreColor(_ score: Int) -> Color {
        if score > 70 { return MeeshyColors.success }
        if score > 40 { return MeeshyColors.warning }
        return MeeshyColors.error
    }

    private func conflictLevelColor(_ level: String) -> Color {
        let lower = level.lowercased()
        if lower.contains("high") || lower.contains("eleve") || lower.contains("fort") {
            return MeeshyColors.error
        }
        if lower.contains("medium") || lower.contains("moyen") || lower.contains("modere") {
            return MeeshyColors.warning
        }
        return MeeshyColors.success
    }

    // MARK: - Load Agent Analysis

    private func loadAgentAnalysis() async {
        async let analysisTask: () = loadAnalysis()
        async let statsTask: () = loadStats()
        _ = await (analysisTask, statsTask)
    }

    private func loadAnalysis() async {
        do {
            agentAnalysis = try await ConversationAnalysisService.shared.fetchAnalysis(
                conversationId: conversationId
            )
        } catch {
            Logger.network.error("[ConversationDashboard] Analysis load failed: \(error.localizedDescription)")
        }
    }

    private func loadStats() async {
        do {
            serverStats = try await ConversationAnalysisService.shared.fetchStats(
                conversationId: conversationId
            )
        } catch {
            Logger.network.error("[ConversationDashboard] Stats load failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Effective Stats (server-first, client fallback)

    private var effectiveTotalMessages: Int { serverStats?.totalMessages ?? messages.count }
    private var effectiveTotalWords: Int { serverStats?.totalWords ?? (clientStats?.totalWords ?? 0) }
    private var effectiveImageCount: Int { serverStats?.contentTypes.image ?? (clientStats?.imageCount ?? 0) }
    private var effectiveAudioCount: Int { serverStats?.contentTypes.audio ?? (clientStats?.audioCount ?? 0) }
    private var effectiveVideoCount: Int { serverStats?.contentTypes.video ?? (clientStats?.videoCount ?? 0) }
    private var effectiveLinkCount: Int { serverStats?.contentTypes.location ?? 0 }
    private var effectiveDocCount: Int { serverStats?.contentTypes.file ?? 0 }

    // MARK: - Derived Data

    private var activityData: [ConversationDashboardActivityPoint] {
        ConversationDashboardRules.activityPoints(
            serverDaily: serverStats?.dailyActivity ?? [],
            messages: messages,
            period: chartPeriod
        )
    }

    private var participantStats: [ConversationDashboardParticipantStat] {
        ConversationDashboardRules.participantStats(
            server: serverStats?.participantStats ?? [],
            client: clientStats?.participantStats ?? []
        )
    }

    private var contentTypeStats: [ConversationDashboardContentTypeStat] {
        ConversationDashboardRules.contentTypeStats(messages: messages, accent: accent)
    }


}

// MARK: - StatRing

private struct StatRing: View {
    let value: Int
    let maxValue: Int
    let label: String
    let accent: Color
    let textColor: Color
    let mutedColor: Color
    let animated: Bool

    private var progress: CGFloat {
        guard maxValue > 0 else { return 0 }
        return min(CGFloat(value) / CGFloat(maxValue), 1.0)
    }

    /// Contrairement à `formatNumber`, l'anneau abrège dès le millier — il rend
    /// son nombre AU CENTRE d'un cercle de 5 pt de trait, où « 1 234 » déborde.
    /// Son seuil de 10 000 n'était PAS un choix : la branche suivante lui était
    /// identique au caractère près (`>= 1_000` → même division, même format), donc
    /// morte. Elle a pu survivre à trois relectures précisément parce qu'elle ne
    /// changeait rien.
    private var displayValue: String {
        CompactCountLabel.text(value)
    }

    var body: some View {
        VStack(spacing: MeeshySpacing.xsPlus) {
            ZStack {
                Circle()
                    .stroke(accent.opacity(MeeshyOpacity.subtle), lineWidth: 5)

                Circle()
                    .trim(from: 0, to: animated ? progress : 0)
                    .stroke(accent, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.spring(response: 0.8, dampingFraction: 0.7), value: animated)

                Text(displayValue)
                    // Dynamic Type exception: value centered in a fixed 60pt ring (minimumScaleFactor shrinks-to-fit)
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundColor(textColor)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
            }
            .frame(width: 60, height: 60)

            Text(label.uppercased())
                // Dynamic Type exception: compact ring caption under the fixed-geometry ring
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .foregroundColor(mutedColor)
                .tracking(0.5)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        // VoiceOver : la bague est une donnée, pas deux libellés séparés. Sans ce
        // regroupement, VoiceOver lit « 1,2k » (valeur abrégée) puis « MESSAGES »
        // (capitales épelées) en deux arrêts. On expose un seul élément « Messages : 1234 »
        // — la valeur brute non abrégée, le libellé déjà localisé (pas de capitales).
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue(LocalizedNumber.exact(value))
    }
}

// MARK: - ArcGauge

private struct ArcGauge: View {
    let score: Int
    let accent: Color
    let scoreColor: Color

    private var progress: CGFloat {
        min(CGFloat(score) / 100.0, 1.0)
    }

    var body: some View {
        GeometryReader { geo in
            let size = min(geo.size.width, geo.size.height * 2)
            let center = CGPoint(x: geo.size.width / 2, y: geo.size.height)
            let radius = size / 2 - 12

            ZStack {
                ArcShape(startAngle: .degrees(180), endAngle: .degrees(360))
                    .stroke(accent.opacity(MeeshyOpacity.subtle), style: StrokeStyle(lineWidth: 10, lineCap: .round))
                    .frame(width: radius * 2, height: radius)
                    .position(x: center.x, y: center.y)

                ArcShape(
                    startAngle: .degrees(180),
                    endAngle: .degrees(180 + 180 * Double(progress))
                )
                .stroke(scoreColor, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                .frame(width: radius * 2, height: radius)
                .position(x: center.x, y: center.y)

                VStack(spacing: 0) {
                    Text("\(score)")
                        // Dynamic Type exception: score centered in the fixed-geometry arc gauge (position is radius-relative)
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .foregroundColor(scoreColor)
                }
                .position(x: center.x, y: center.y - radius * 0.35)
            }
        }
    }
}

nonisolated private struct ArcShape: Shape {
    let startAngle: Angle
    let endAngle: Angle

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let center = CGPoint(x: rect.midX, y: rect.maxY)
        let radius = min(rect.width / 2, rect.height)
        path.addArc(
            center: center,
            radius: radius,
            startAngle: startAngle,
            endAngle: endAngle,
            clockwise: false
        )
        return path
    }
}

// MARK: - Stagger Animation Modifier

private extension View {
    func staggerIn(_ appeared: Bool, index: Int) -> some View {
        self
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 12)
            .animation(.easeOut(duration: 0.5).delay(Double(index) * 0.08), value: appeared)
    }
}
