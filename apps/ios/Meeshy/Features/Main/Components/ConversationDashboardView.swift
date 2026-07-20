import SwiftUI
import Combine
import os
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

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    @State private var chartPeriod: ChartPeriod = .week
    @State private var agentAnalysis: ConversationAnalysis?
    @State private var isLoadingAnalysis = true
    @State private var serverStats: ConversationMessageStatsResponse?
    @State private var isLoadingStats = true
    @State private var sectionsAppeared = false
    @State private var ringsAnimated = false

    private var accent: Color { Color(hex: accentColor) }

    enum ChartPeriod: String, CaseIterable {
        case week = "7j"
        case month = "30j"
        case all = "Tout"
    }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 22) {
            if let analysis = agentAnalysis {
                heroHealthCard(analysis)
                    .staggerIn(sectionsAppeared, index: 0)
            }
            statsRingsSection
                .staggerIn(sectionsAppeared, index: 1)
            if !activityData.isEmpty {
                activityChartSection
                    .staggerIn(sectionsAppeared, index: 2)
            }
            if let analysis = agentAnalysis, !analysis.participantProfiles.isEmpty {
                agentParticipantProfilesSection(analysis.participantProfiles)
                    .staggerIn(sectionsAppeared, index: 3)
            }
            if !participantStats.isEmpty {
                participantBreakdownSection
                    .staggerIn(sectionsAppeared, index: 4)
            }
            if sentimentAnalysis.total > 0 {
                sentimentSection
                    .staggerIn(sectionsAppeared, index: 5)
            }
            if !contentTypeStats.isEmpty {
                contentTypesSection
                    .staggerIn(sectionsAppeared, index: 6)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 32)
        .task { await loadAgentAnalysis() }
        .onAppear {
            withAnimation(.easeOut(duration: 0.6)) {
                sectionsAppeared = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                withAnimation(.spring(response: 0.8, dampingFraction: 0.7)) {
                    ringsAnimated = true
                }
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
                    VStack(spacing: 4) {
                        ArcGauge(
                            score: health,
                            accent: accent,
                            scoreColor: healthScoreColor(health)
                        )
                        .frame(height: 100)

                        Text(String(localized: "dashboard.health", defaultValue: "Sante", bundle: .main))
                            .font(MeeshyFont.relative(11, weight: .heavy, design: .rounded))
                            .foregroundColor(theme.textMuted)
                            .tracking(1.0)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
                    // VoiceOver : la jauge d'arc + son libellé « Santé » forment un seul
                    // score. Sans regroupement, VoiceOver lisait « 78 » nu (dans l'arc) puis
                    // « Santé » séparément. Un élément unique « Santé : 78 » (clé déjà
                    // localisée, valeur brute — 0 clé i18n neuve, cohérent avec StatRing).
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(String(localized: "dashboard.health", defaultValue: "Sante", bundle: .main))
                    .accessibilityValue("\(health)")

                    if summary.engagementLevel != nil || summary.conflictLevel != nil {
                        HStack(spacing: 10) {
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
                    HStack(alignment: .top, spacing: 4) {
                        Text("\u{201C}")
                            // Dynamic Type exception: decorative opening-quote glyph, absolute offset(y:) tuned to its point size
                            .font(.system(size: 48, weight: .bold, design: .serif))
                            .foregroundColor(accent.opacity(0.3))
                            .offset(y: -12)
                        Text(summary.text)
                            .font(MeeshyFont.relative(14, weight: .regular, design: .serif))
                            .italic()
                            .foregroundColor(theme.textSecondary)
                            .lineLimit(6)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                if summary.healthScore != nil, !summary.text.isEmpty {
                    Text(summary.text)
                        .font(MeeshyFont.relative(13, weight: .regular, design: .serif))
                        .italic()
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(4)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if !summary.currentTopics.isEmpty {
                    FlowLayout(spacing: 6) {
                        ForEach(summary.currentTopics, id: \.self) { topic in
                            Text(topic)
                                .font(MeeshyFont.relative(11, weight: .semibold))
                                .foregroundColor(accent)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
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
                                .font(MeeshyFont.relative(10, weight: .medium))
                                .foregroundColor(theme.textSecondary)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(
                                    Capsule()
                                        .fill(accent.opacity(isDark ? 0.08 : 0.05))
                                )
                        }
                    }
                }

                if !summary.overallTone.isEmpty {
                    HStack(spacing: 6) {
                        Image(systemName: "theatermasks.fill")
                            .font(MeeshyFont.relative(10, weight: .semibold))
                            .foregroundColor(accent)
                        Text(String(format: String(localized: "dashboard.tone", defaultValue: "Ton : %@", bundle: .main), summary.overallTone))
                            .font(MeeshyFont.relative(12, weight: .semibold))
                            .foregroundColor(theme.textPrimary)
                    }
                }

                if let dynamique = summary.dynamique, !dynamique.isEmpty {
                    Text(dynamique)
                        .font(MeeshyFont.relative(12, weight: .regular, design: .serif))
                        .italic()
                        .foregroundColor(theme.textMuted)
                }
            }
        }
    }

    private func metricPill(icon: String, text: String, color: Color) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(10, weight: .semibold))
                .foregroundColor(color)
            Text(text)
                .font(MeeshyFont.relative(11, weight: .semibold))
                .foregroundColor(theme.textPrimary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
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

            HStack(spacing: 16) {
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

            HStack(spacing: 16) {
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
                    label: String(localized: "dashboard.stat.videos", defaultValue: "Videos", bundle: .main),
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
                HStack(spacing: 16) {
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

    private var activityChartSection: some View {
        sectionCard {
            HStack {
                sectionHeader(icon: "chart.line.uptrend.xyaxis", title: String(localized: "dashboard.section.activity", defaultValue: "Activite", bundle: .main))
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
                            .foregroundStyle(theme.textMuted.opacity(0.12))
                    }
                }
                .frame(height: 160)
                .animation(.easeInOut(duration: 0.3), value: chartPeriod)
            }
        }
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
                        .font(MeeshyFont.relative(11, weight: isSelected ? .bold : .medium))
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
            Capsule().fill(isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
        )
    }

    private var emptyChartPlaceholder: some View {
        VStack(spacing: 8) {
            Image(systemName: "chart.line.uptrend.xyaxis")
                .font(MeeshyFont.relative(24, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.3))
            Text(String(localized: "dashboard.activity.empty", defaultValue: "Pas assez de donnees", bundle: .main))
                .font(MeeshyFont.relative(12, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(height: 120)
        .frame(maxWidth: .infinity)
    }

    // MARK: - Agent Participant Profiles

    private func agentParticipantProfilesSection(_ profiles: [ParticipantProfile]) -> some View {
        sectionCard {
            sectionHeader(icon: "brain.fill", title: String(localized: "dashboard.section.participant-profiles", defaultValue: "Profils participants", bundle: .main))

            ForEach(profiles) { profile in
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        Circle()
                            .fill(Color(hex: DynamicColorGenerator.colorForName(profile.displayName ?? profile.username ?? profile.userId)))
                            .frame(width: 10, height: 10)

                        Text(profile.displayName ?? profile.username ?? "?")
                            .font(MeeshyFont.relative(14, weight: .bold))
                            .foregroundColor(theme.textPrimary)

                        Spacer()

                        if profile.confidence > 0 {
                            Text("\(Int(profile.confidence * 100))%")
                                .font(MeeshyFont.relative(10, weight: .bold, design: .rounded))
                                .foregroundColor(theme.textMuted)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(
                                    Capsule().fill(accent.opacity(0.1))
                                )
                        }
                    }

                    if !profile.personaSummary.isEmpty {
                        Text(profile.personaSummary)
                            .font(MeeshyFont.relative(12, weight: .regular, design: .serif))
                            .italic()
                            .foregroundColor(theme.textSecondary)
                            .lineLimit(3)
                    }

                    HStack(spacing: 8) {
                        if !profile.tone.isEmpty {
                            profileTag(icon: "waveform.path", text: profile.tone)
                        }
                        if !profile.vocabularyLevel.isEmpty {
                            profileTag(icon: "textformat.size", text: profile.vocabularyLevel)
                        }
                    }

                    if let traits = profile.traits {
                        traitBarsView(traits)
                    }

                    if !profile.catchphrases.isEmpty {
                        HStack(alignment: .top, spacing: 6) {
                            Image(systemName: "quote.opening")
                                .font(MeeshyFont.relative(9))
                                .foregroundColor(accent.opacity(0.5))
                                .offset(y: 2)
                            Text(profile.catchphrases.prefix(3).joined(separator: " \u{00B7} "))
                                .font(MeeshyFont.relative(11, weight: .medium, design: .serif))
                                .italic()
                                .foregroundColor(theme.textMuted)
                                .lineLimit(2)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(
                            RoundedRectangle(cornerRadius: 8)
                                .fill(accent.opacity(isDark ? 0.04 : 0.02))
                        )
                    }

                    if !profile.topicsOfExpertise.isEmpty || !profile.commonEmojis.isEmpty {
                        HStack(spacing: 8) {
                            ForEach(profile.topicsOfExpertise.prefix(3), id: \.self) { topic in
                                Text(topic)
                                    .font(MeeshyFont.relative(10, weight: .medium))
                                    .foregroundColor(theme.textMuted)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(
                                        Capsule().fill(theme.textMuted.opacity(0.08))
                                    )
                            }
                            if !profile.commonEmojis.isEmpty {
                                Text(profile.commonEmojis.prefix(6).joined(separator: ""))
                                    .font(MeeshyFont.relative(13))
                            }
                        }
                    }
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(isDark ? Color.white.opacity(0.02) : Color.black.opacity(0.01))
                )
                .overlay(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color(hex: DynamicColorGenerator.colorForName(profile.displayName ?? profile.username ?? profile.userId)))
                        .frame(width: 4)
                        .padding(.vertical, 6)
                }
            }
        }
    }

    private func profileTag(icon: String, text: String) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(9, weight: .semibold))
            Text(text)
                .font(MeeshyFont.relative(11, weight: .medium))
        }
        .foregroundColor(theme.textSecondary)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule().fill(accent.opacity(isDark ? 0.08 : 0.05))
        )
    }

    // MARK: - Trait Bars

    private func traitBarsView(_ traits: ParticipantTraits) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let comm = traits.communication {
                let scores = extractTraitScores(from: comm)
                if !scores.isEmpty {
                    traitBarCategory(String(localized: "dashboard.trait.communication", defaultValue: "Communication", bundle: .main), traits: scores)
                }
            }
            if let pers = traits.personality {
                let scores = extractTraitScores(from: pers)
                if !scores.isEmpty {
                    traitBarCategory(String(localized: "dashboard.trait.personality", defaultValue: "Personnalite", bundle: .main), traits: scores)
                }
            }
            if let inter = traits.interpersonal {
                let scores = extractTraitScores(from: inter)
                if !scores.isEmpty {
                    traitBarCategory(String(localized: "dashboard.trait.interpersonal", defaultValue: "Interpersonnel", bundle: .main), traits: scores)
                }
            }
            if let emot = traits.emotional {
                let scores = extractTraitScores(from: emot)
                if !scores.isEmpty {
                    traitBarCategory(String(localized: "dashboard.trait.emotional", defaultValue: "Emotionnel", bundle: .main), traits: scores)
                }
            }
        }
    }

    private func traitBarCategory(_ category: String, traits: [TraitScore]) -> some View {
        let sorted = traits.sorted { $0.score > $1.score }
        return VStack(alignment: .leading, spacing: 4) {
            Text(category.uppercased())
                .font(MeeshyFont.relative(9, weight: .bold))
                .foregroundColor(theme.textMuted)
                .tracking(0.8)

            ForEach(sorted.prefix(4), id: \.label) { trait in
                HStack(spacing: 8) {
                    Text(trait.label)
                        .font(MeeshyFont.relative(10, weight: .medium))
                        .foregroundColor(theme.textSecondary)
                        .frame(width: 80, alignment: .leading)
                        .lineLimit(1)

                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 2)
                                .fill(accent.opacity(0.08))
                                .frame(height: 4)

                            RoundedRectangle(cornerRadius: 2)
                                .fill(accent.opacity(0.7))
                                .frame(
                                    width: geo.size.width * CGFloat(trait.score) / 100.0,
                                    height: 4
                                )
                        }
                    }
                    .frame(height: 4)

                    Text("\(trait.score)")
                        .font(MeeshyFont.relative(10, weight: .bold, design: .rounded))
                        .foregroundColor(traitScoreColor(trait.score))
                        .frame(width: 24, alignment: .trailing)
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

    // MARK: - Participant Breakdown

    private var participantBreakdownSection: some View {
        sectionCard {
            sectionHeader(icon: "person.2.fill", title: String(localized: "dashboard.section.participant-activity", defaultValue: "Activite par participant", bundle: .main))

            let stats = participantStats.prefix(10)
            let maxCount = stats.first?.messageCount ?? 1

            ForEach(Array(stats.enumerated()), id: \.element.name) { index, stat in
                HStack(spacing: 10) {
                    if index < 3 {
                        Text("#\(index + 1)")
                            .font(MeeshyFont.relative(11, weight: .black, design: .rounded))
                            .foregroundColor(accent)
                            .frame(width: 24)
                    } else {
                        Circle()
                            .fill(Color(hex: DynamicColorGenerator.colorForName(stat.name)))
                            .frame(width: 8, height: 8)
                            .frame(width: 24)
                    }

                    VStack(alignment: .leading, spacing: 1) {
                        Text(stat.name)
                            .font(MeeshyFont.relative(13, weight: .semibold))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)
                        Text(String(format: String(localized: "dashboard.words-count", defaultValue: "%@ mots", bundle: .main), formatNumber(stat.wordCount)))
                            .font(MeeshyFont.relative(10, weight: .medium))
                            .foregroundColor(theme.textMuted)
                    }
                    .frame(width: 80, alignment: .leading)

                    GeometryReader { geo in
                        let width = geo.size.width * CGFloat(stat.messageCount) / CGFloat(max(maxCount, 1))
                        Capsule()
                            .fill(
                                LinearGradient(
                                    colors: [accent, accent.opacity(0.5)],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: max(width, 6), height: 18)
                    }
                    .frame(height: 18)

                    Text("\(stat.messageCount)")
                        .font(MeeshyFont.relative(12, weight: .bold, design: .rounded))
                        .foregroundColor(theme.textSecondary)
                        .frame(width: 40, alignment: .trailing)
                }
                .padding(.vertical, 3)
            }
        }
    }

    // MARK: - Sentiment Section

    @ViewBuilder
    private var sentimentSection: some View {
        let analysis = sentimentAnalysis
        if analysis.total > 0 {
            sectionCard {
                sectionHeader(icon: "face.smiling", title: String(localized: "dashboard.section.sentiment", defaultValue: "Sentiment", bundle: .main))

                HStack(spacing: 0) {
                    sentimentSegment(
                        emoji: "\u{1F604}",
                        label: String(localized: "dashboard.sentiment.positive", defaultValue: "Positif", bundle: .main),
                        count: analysis.positive,
                        total: analysis.total,
                        color: MeeshyColors.success
                    )
                    sentimentSegment(
                        emoji: "\u{1F610}",
                        label: String(localized: "dashboard.sentiment.neutral", defaultValue: "Neutre", bundle: .main),
                        count: analysis.neutral,
                        total: analysis.total,
                        color: MeeshyColors.warning
                    )
                    sentimentSegment(
                        emoji: "\u{1F614}",
                        label: String(localized: "dashboard.sentiment.negative", defaultValue: "Negatif", bundle: .main),
                        count: analysis.negative,
                        total: analysis.total,
                        color: MeeshyColors.error
                    )
                }

                sentimentBar(analysis: analysis)
            }
        }
    }

    private func sentimentSegment(emoji: String, label: String, count: Int, total: Int, color: Color) -> some View {
        let pct = total > 0 ? Int(Double(count) / Double(total) * 100) : 0
        return VStack(spacing: 4) {
            Text(emoji)
                .font(MeeshyFont.relative(22))
            Text("\(pct)%")
                .font(MeeshyFont.relative(15, weight: .bold, design: .rounded))
                .foregroundColor(color)
            Text(label)
                .font(MeeshyFont.relative(10, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
    }

    private func sentimentBar(analysis: SentimentResult) -> some View {
        let total = max(analysis.total, 1)
        let posFrac = CGFloat(analysis.positive) / CGFloat(total)
        let neuFrac = CGFloat(analysis.neutral) / CGFloat(total)
        let negFrac = CGFloat(analysis.negative) / CGFloat(total)

        let dominantColor: Color = {
            if posFrac >= neuFrac && posFrac >= negFrac { return MeeshyColors.success }
            if neuFrac >= posFrac && neuFrac >= negFrac { return MeeshyColors.warning }
            return MeeshyColors.error
        }()

        return GeometryReader { geo in
            HStack(spacing: 2) {
                if posFrac > 0 {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(MeeshyColors.success)
                        .frame(width: max(geo.size.width * posFrac - 1, 2))
                }
                if neuFrac > 0 {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(MeeshyColors.warning)
                        .frame(width: max(geo.size.width * neuFrac - 1, 2))
                }
                if negFrac > 0 {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(MeeshyColors.error)
                        .frame(width: max(geo.size.width * negFrac - 1, 2))
                }
            }
        }
        .frame(height: 12)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .shadow(color: dominantColor.opacity(0.3), radius: 4, y: 2)
    }

    // MARK: - Content Types

    @ViewBuilder
    private var contentTypesSection: some View {
        let types = contentTypeStats
        if !types.isEmpty {
            let maxCount = types.map(\.count).max() ?? 1
            sectionCard {
                sectionHeader(icon: "square.grid.2x2.fill", title: String(localized: "dashboard.section.content-types", defaultValue: "Types de contenu", bundle: .main))

                ForEach(types, id: \.type) { stat in
                    HStack(spacing: 10) {
                        Image(systemName: stat.icon)
                            .font(MeeshyFont.relative(12, weight: .semibold))
                            .foregroundColor(stat.color)
                            .frame(width: 20)

                        Text(stat.type)
                            .font(MeeshyFont.relative(12, weight: .medium))
                            .foregroundColor(theme.textPrimary)
                            .frame(width: 60, alignment: .leading)

                        GeometryReader { geo in
                            Capsule()
                                .fill(
                                    LinearGradient(
                                        colors: [stat.color.opacity(0.7), stat.color.opacity(0.3)],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                                .frame(
                                    width: max(geo.size.width * CGFloat(stat.count) / CGFloat(max(maxCount, 1)), 4),
                                    height: 10
                                )
                        }
                        .frame(height: 10)

                        Text("\(stat.count)")
                            .font(MeeshyFont.relative(12, weight: .bold, design: .rounded))
                            .foregroundColor(theme.textSecondary)
                            .frame(width: 40, alignment: .trailing)
                    }
                    .padding(.vertical, 3)
                }
            }
        }
    }

    // MARK: - Section Container & Header

    private func sectionCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            content()
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(isDark ? Color.white.opacity(0.035) : Color.white.opacity(0.9))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(
                    LinearGradient(
                        colors: [accent.opacity(0.2), accent.opacity(0.05)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        )
    }

    private func sectionHeader(icon: String, title: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(12, weight: .semibold))
                .foregroundColor(accent)
            Text(title.uppercased())
                .font(MeeshyFont.relative(12, weight: .heavy, design: .rounded))
                .foregroundColor(theme.textMuted)
                .tracking(1.5)
        }
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

    private func traitScoreColor(_ score: Int) -> Color {
        if score >= 70 { return MeeshyColors.success }
        if score >= 40 { return accent }
        return theme.textMuted
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
        } catch {
            Logger.network.error("[ConversationDashboard] Analysis load failed: \(error.localizedDescription)")
        }
    }

    private func loadStats() async {
        defer { isLoadingStats = false }
        do {
            serverStats = try await ConversationAnalysisService.shared.fetchStats(
                conversationId: conversationId
            )
        } catch {
            Logger.network.error("[ConversationDashboard] Stats load failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Computed Stats

    private var totalWords: Int {
        messages.reduce(0) { total, msg in
            total + msg.content.split(whereSeparator: \.isWhitespace).count
        }
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
    private var effectiveImageCount: Int { serverStats?.contentTypes.image ?? imageCount }
    private var effectiveAudioCount: Int { serverStats?.contentTypes.audio ?? audioCount }
    private var effectiveVideoCount: Int { serverStats?.contentTypes.video ?? videoCount }
    private var effectiveLinkCount: Int { serverStats?.contentTypes.location ?? 0 }
    private var effectiveDocCount: Int { serverStats?.contentTypes.file ?? 0 }

    // MARK: - Activity Data

    private struct ActivityPoint {
        let date: Date
        let label: String
        let count: Int
    }

    private func formattedDateLabel(_ date: Date) -> String {
        if chartPeriod == .week {
            return date.formatted(.dateTime.weekday(.abbreviated))
        } else {
            return date.formatted(.dateTime.day().month(.twoDigits))
        }
    }

    private var activityData: [ActivityPoint] {
        if let serverDaily = serverStats?.dailyActivity, !serverDaily.isEmpty {
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
                return ActivityPoint(date: date, label: formattedDateLabel(date), count: entry.count)
            }
            .sorted { $0.date < $1.date }
        }
        return clientComputedActivityData
    }

    private var clientComputedActivityData: [ActivityPoint] {
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
            .map { ActivityPoint(date: $0.key, label: formattedDateLabel($0.key), count: $0.value) }
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
        let color: Color
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
            ContentTypeStat(type: String(localized: "dashboard.content.text", defaultValue: "Texte", bundle: .main), icon: "text.bubble.fill", color: accent, count: textOnly),
            ContentTypeStat(type: String(localized: "dashboard.stat.photos", defaultValue: "Photos", bundle: .main), icon: "photo.fill", color: MeeshyColors.success, count: images),
            ContentTypeStat(type: String(localized: "dashboard.stat.audio", defaultValue: "Audio", bundle: .main), icon: "waveform", color: MeeshyColors.indigo400, count: audio),
            ContentTypeStat(type: String(localized: "dashboard.stat.videos", defaultValue: "Videos", bundle: .main), icon: "video.fill", color: MeeshyColors.error, count: videos),
            ContentTypeStat(type: String(localized: "dashboard.content.files", defaultValue: "Fichiers", bundle: .main), icon: "doc.fill", color: MeeshyColors.warning, count: files),
        ].filter { $0.count > 0 }
    }

    // MARK: - Helpers

    private func formatNumber(_ n: Int) -> String {
        if n >= 1_000_000 { return String(format: "%.1fM", Double(n) / 1_000_000) }
        if n >= 10_000 { return String(format: "%.1fk", Double(n) / 1_000) }
        if n >= 1_000 {
            return n.formatted()
        }
        return "\(n)"
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

    private var displayValue: String {
        if value >= 1_000_000 { return String(format: "%.1fM", Double(value) / 1_000_000) }
        if value >= 10_000 { return String(format: "%.1fk", Double(value) / 1_000) }
        if value >= 1_000 { return String(format: "%.1fk", Double(value) / 1_000) }
        return "\(value)"
    }

    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                Circle()
                    .stroke(accent.opacity(0.1), lineWidth: 5)

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
        .accessibilityValue("\(value)")
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
                    .stroke(accent.opacity(0.1), style: StrokeStyle(lineWidth: 10, lineCap: .round))
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

private struct ArcShape: Shape {
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
