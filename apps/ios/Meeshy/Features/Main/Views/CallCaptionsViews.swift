import SwiftUI
import MeeshyUI

// #8396 — les sous-titres de l'appel : une ligne, le bandeau de verre posé
// juste au-dessus de la pilule, et le journal de tout l'appel. Des vues
// feuilles : elles reçoivent des `CallCaptionLine` déjà résolues (Prisme,
// couleur, étiquette) et ne lisent aucun singleton.

enum CallCaptionsCopy {
    static var journal: String {
        String(localized: "call.captions.journal", defaultValue: "Journal", bundle: .main)
    }

    static var journalHint: String {
        String(localized: "call.captions.journal.hint", defaultValue: "Ouvre toutes les phrases de l'appel", bundle: .main)
    }

    static var journalTitle: String {
        String(localized: "call.captions.journal.title", defaultValue: "Journal de l'appel", bundle: .main)
    }

    static var waiting: String {
        String(localized: "call.captions.waiting", defaultValue: "Les sous-titres s'afficheront ici dès que quelqu'un parlera.", bundle: .main)
    }

    static var translated: String {
        String(localized: "call.captions.translated", defaultValue: "Traduit", bundle: .main)
    }

    static var original: String {
        String(localized: "audio.fullscreen.language.original", defaultValue: "Original", bundle: .main)
    }

    static var showOriginalHint: String {
        String(localized: "call.control.translation.showOriginal", defaultValue: "Afficher le texte original", bundle: .main)
    }

    static var showTranslatedHint: String {
        String(localized: "call.control.translation.showTranslated", defaultValue: "Afficher la traduction", bundle: .main)
    }

    static var title: String {
        String(localized: "call.control.transcript.caption", defaultValue: "Sous-titres", bundle: .main)
    }

    static var backToLive: String {
        String(localized: "call.captions.journal.live", defaultValue: "Revenir au direct", bundle: .main)
    }

    static var backToLiveHint: String {
        String(localized: "call.captions.journal.live.hint", defaultValue: "Fait défiler le journal jusqu'à la dernière phrase", bundle: .main)
    }

    static var newLines: String {
        String(localized: "call.captions.journal.newLines", defaultValue: "Nouvelles phrases", bundle: .main)
    }
}

/// Une phrase : le nom du locuteur dans SA couleur (la même que le liseré de
/// sa vignette), l'étiquette « EN → FR » quand la ligne est traduite, le
/// texte. Toucher une phrase traduite montre son original, et inversement.
struct CallCaptionRow: View {
    let line: CallCaptionLine
    var showsTime: Bool = false
    let onToggleOriginal: () -> Void

    var body: some View {
        Button {
            guard line.canRevealOriginal else { return }
            onToggleOriginal()
        } label: {
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                HStack(spacing: MeeshySpacing.xsPlus) {
                    Text(speakerHeading)
                        .font(.caption.weight(.semibold))
                        .foregroundColor(Color(hex: line.speakerColorHex))
                        .lineLimit(1)
                    if let tag = line.languageTag {
                        Text(tag)
                            .font(.caption2.weight(.semibold).monospaced())
                            .foregroundColor(.white.opacity(0.7))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(Capsule().fill(Color.white.opacity(0.12)))
                    }
                }
                Text(line.text)
                    .font(.callout.weight(line.isFinal ? .regular : .light))
                    .foregroundColor(.white)
                    .opacity(line.isFinal ? 1 : 0.7)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(line.speakerName) : \(line.text)")
        .optionalAccessibilityHint(accessibilityHint)
        // VoiceOver ne s'arrête que sur les phrases FINALES : une révision
        // partielle est remplacée avant d'avoir fini d'être lue.
        .accessibilityHidden(!line.isFinal)
    }

    private var speakerHeading: String {
        guard showsTime else { return line.speakerName }
        return "\(line.speakerName) (\(line.capturedAt.formatted(date: .omitted, time: .shortened)))"
    }

    private var accessibilityHint: String? {
        guard line.canRevealOriginal else { return nil }
        return line.isShowingOriginal ? CallCaptionsCopy.showTranslatedHint : CallCaptionsCopy.showOriginalHint
    }
}

/// Le bandeau : les deux dernières phrases, et le Journal. En duo il est son
/// propre verre, juste au-dessus de la pilule ; en groupe il se pose en haut
/// du cadre de verre de la pilule, qui le porte déjà (`hasOwnGlass: false`).
struct CallCaptionsBand: View {
    let lines: [CallCaptionLine]
    let hasOwnGlass: Bool
    let onToggleOriginal: (UUID) -> Void
    let onOpenJournal: (() -> Void)?

    var body: some View {
        if hasOwnGlass {
            content
                .padding(.leading, MeeshySpacing.mdPlus)
                .padding(.trailing, MeeshySpacing.xs)
                .padding(.vertical, MeeshySpacing.xsPlus)
                .callChromeGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous))
        } else {
            content
        }
    }

    private var content: some View {
        HStack(alignment: .top, spacing: MeeshySpacing.xs) {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                if lines.isEmpty {
                    Text(CallCaptionsCopy.waiting)
                        .font(.footnote)
                        .foregroundColor(.white.opacity(0.7))
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    ForEach(lines) { line in
                        CallCaptionRow(line: line) { onToggleOriginal(line.id) }
                    }
                }
            }
            .padding(.vertical, MeeshySpacing.xsPlus)
            if let onOpenJournal {
                Button(action: onOpenJournal) {
                    Image(systemName: "list.bullet.rectangle")
                        .font(MeeshyFont.relative(17, weight: .semibold))
                        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                        .foregroundColor(.white.opacity(0.9))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel(CallCaptionsCopy.journal)
                .accessibilityHint(CallCaptionsCopy.journalHint)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(CallCaptionsCopy.title)
    }
}

struct CallJournalList: View {
    let segments: [TranscriptionSegment]
    let line: (TranscriptionSegment) -> CallCaptionLine
    let onToggleOriginal: (UUID) -> Void
    var contentPadding: CGFloat = 16

    @State private var follow = CallJournalFollow.live
    @State private var tracker = CallJournalScrollTracker()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let space = "call-journal"
    private static let liveEdge = "call-journal-live-edge"

    var body: some View {
        GeometryReader { viewport in
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: MeeshySpacing.md) {
                        if segments.isEmpty {
                            Text(CallCaptionsCopy.waiting)
                                .font(.callout)
                                .foregroundColor(.white.opacity(0.7))
                        }
                        ForEach(segments) { segment in
                            CallCaptionRow(line: line(segment), showsTime: true) { onToggleOriginal(segment.id) }
                        }
                        Color.clear
                            .frame(height: 1)
                            .id(Self.liveEdge)
                            .accessibilityHidden(true)
                    }
                    .padding(contentPadding)
                    .background(
                        GeometryReader { content in
                            Color.clear.preference(
                                key: CallJournalScrollKey.self,
                                value: CallJournalScrollMetrics(
                                    offset: -content.frame(in: .named(Self.space)).minY,
                                    contentHeight: content.size.height,
                                    viewportHeight: viewport.size.height
                                )
                            )
                        }
                    )
                }
                .coordinateSpace(name: Self.space)
                .onPreferenceChange(CallJournalScrollKey.self) { track($0) }
                .callJournalScrollGeometry { track($0) }
                .onAppear { proxy.scrollTo(Self.liveEdge, anchor: .bottom) }
                .adaptiveOnChange(of: tailSignature) { _, _ in
                    guard follow.isFollowing else {
                        follow = follow.lineArrived()
                        return
                    }
                    withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) {
                        proxy.scrollTo(Self.liveEdge, anchor: .bottom)
                    }
                }
                .overlay(alignment: .bottom) {
                    if follow.showsReturnToLive {
                        returnToLive {
                            follow = .live
                            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.25)) {
                                proxy.scrollTo(Self.liveEdge, anchor: .bottom)
                            }
                        }
                        .padding(.bottom, MeeshySpacing.md)
                        .transition(.opacity)
                    }
                }
            }
        }
    }

    private func track(_ metrics: CallJournalScrollMetrics) {
        let next = follow.scrolled(from: tracker.last, to: metrics)
        tracker.last = metrics
        guard next != follow else { return }
        follow = next
    }

    private var tailSignature: String {
        guard let last = segments.last else { return "" }
        return "\(segments.count)|\(last.id.uuidString)|\(last.text.count)|\(last.translatedText?.count ?? 0)"
    }

    private func returnToLive(action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: "arrow.down")
                    .font(.footnote.weight(.bold))
                    .accessibilityHidden(true)
                Text(CallCaptionsCopy.backToLive)
                    .font(.footnote.weight(.semibold))
                if follow.hasUnseen {
                    Circle()
                        .fill(MeeshyColors.indigo400)
                        .frame(width: 8, height: 8)
                        .accessibilityHidden(true)
                }
            }
            .foregroundColor(.white)
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .frame(minHeight: 44)
            .background(Capsule().fill(Color.black.opacity(0.7)))
            .overlay(Capsule().stroke(Color.white.opacity(0.25), lineWidth: MeeshyBorder.hairline))
            .contentShape(Capsule())
        }
        .buttonStyle(CallPressButtonStyle())
        .accessibilityHint(CallCaptionsCopy.backToLiveHint)
        .accessibilityValue(follow.hasUnseen ? CallCaptionsCopy.newLines : "")
    }
}

final class CallJournalScrollTracker {
    var last: CallJournalScrollMetrics?

    nonisolated deinit {}
}

private extension View {
    @ViewBuilder
    func callJournalScrollGeometry(_ onChange: @escaping (CallJournalScrollMetrics) -> Void) -> some View {
        if #available(iOS 18.0, *) {
            onScrollGeometryChange(for: CallJournalScrollMetrics.self) { geometry in
                CallJournalScrollMetrics(
                    offset: geometry.visibleRect.minY,
                    contentHeight: geometry.contentSize.height,
                    viewportHeight: geometry.visibleRect.height
                )
            } action: { _, metrics in
                onChange(metrics)
            }
        } else {
            self
        }
    }
}

private nonisolated struct CallJournalScrollKey: PreferenceKey {
    static let defaultValue = CallJournalScrollMetrics(offset: 0, contentHeight: 0, viewportHeight: 0)

    static func reduce(value: inout CallJournalScrollMetrics, nextValue: () -> CallJournalScrollMetrics) {
        value = nextValue()
    }
}

/// Tout l'appel, Traduit ou Original — le réglage est celui du bouton
/// Sous-titres (`showOriginalText`), un toucher par phrase l'inverse.
struct CallCaptionsJournalSheet: View {
    let segments: [TranscriptionSegment]
    let line: (TranscriptionSegment) -> CallCaptionLine
    @Binding var showsOriginal: Bool
    let onToggleOriginal: (UUID) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            CallJournalList(segments: segments, line: line, onToggleOriginal: onToggleOriginal)
                .navigationTitle(CallCaptionsCopy.journalTitle)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .principal) {
                        Picker(CallCaptionsCopy.journalTitle, selection: $showsOriginal) {
                            Text(CallCaptionsCopy.translated).tag(false)
                            Text(CallCaptionsCopy.original).tag(true)
                        }
                        .pickerStyle(.segmented)
                        .frame(maxWidth: 240)
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(String(localized: "common.close", defaultValue: "Fermer", bundle: .main)) { dismiss() }
                    }
                }
        }
        .presentationDetents([.medium, .large])
        .adaptiveSheetGlassBackground()
        .environment(\.colorScheme, .dark)
    }
}
