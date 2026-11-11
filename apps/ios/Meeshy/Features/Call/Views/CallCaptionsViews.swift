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

    static var region: String {
        String(localized: "call.captions.region", defaultValue: "Sous-titres de l'appel", bundle: .main)
    }

    static var translating: String {
        String(localized: "call.captions.translating", defaultValue: "Traduction en cours", bundle: .main)
    }

    static var hideOriginalHint: String {
        String(localized: "call.captions.hideOriginal.hint", defaultValue: "Masquer le texte original", bundle: .main)
    }

    static func footer(_ note: CallCaptionsFooter) -> String? {
        switch note {
        case .none:
            return nil
        case .translating(let language):
            return String(format: String(localized: "call.captions.footer.translating", defaultValue: "%@ · traduction en cours", bundle: .main), language)
        case .touchForOriginal(let pair):
            return touchForOriginal(pair: pair)
        case .translatedLanguages(let count):
            return String.localizedStringWithFormat(String(localized: "call.captions.footer.translatedLanguages", defaultValue: "Traduit · %lld langues", bundle: .main), count)
        }
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

    static func touchForOriginal(pair: String) -> String {
        String(format: String(localized: "call.captions.footer.touchForOriginal", defaultValue: "%@ · toucher = original", bundle: .main), pair)
    }
}

/// Une phrase : « Moi · texte » d'une traite, le nom à la couleur de son auteur (la
/// même que le liseré de sa vignette, #16614), le texte à la sienne quand il est
/// traduit, l'étiquette « EN » / « EN → FR » et les trois points d'attente. Toucher
/// une phrase traduite déplie « Original · … » dessous, en encre secondaire ; la
/// retoucher le replie.
struct CallCaptionRow: View {
    let line: CallCaptionLine
    var showsTime: Bool = false
    var showsWaiting: Bool = false
    let onToggleOriginal: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var speakerColor: Color { Color(hex: line.speakerColorHex) }
    private var ink: Color { line.textColorHex.map { Color(hex: $0) } ?? .white }
    private var isWaiting: Bool { showsWaiting && line.isAwaitingTranslation }

    var body: some View {
        if line.isEvent {
            eventLine
        } else {
            speechLine
        }
    }

    /// #16665 — « Karim · a capturé l'écran · 12:40 » : le pseudo à sa
    /// couleur, la phrase et l'heure en encre secondaire, jamais colorées.
    private var eventLine: some View {
        CallCaptureSentence.text(
            name: line.speakerName,
            nameColor: speakerColor,
            tail: [line.text, line.timeLabel ?? ""].filter { !$0.isEmpty }.joined(separator: " · "),
            tailColor: MeeshyColors.mediaChromeTertiary
        )
        .multilineTextAlignment(.leading)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(line.announcement ?? line.text)
    }

    private var speechLine: some View {
        Button {
            guard line.canRevealOriginal else { return }
            onToggleOriginal()
        } label: {
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                if showsTime {
                    stackedPhrase
                } else {
                    inlinePhrase
                }
                if let original = line.originalBelow {
                    Text(verbatim: "\(CallCaptionsCopy.original) · \(original)")
                        .font(.footnote)
                        .foregroundStyle(MeeshyColors.mediaChromeSecondary)
                        .multilineTextAlignment(.leading)
                        .padding(.leading, MeeshySpacing.md)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .transition(unfoldTransition)
                }
            }
            .opacity(line.isFinal ? 1 : 0.7)
            .animation(fade, value: line)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spokenLabel)
        .optionalAccessibilityHint(accessibilityHint)
        // VoiceOver ne s'arrête que sur les phrases FINALES : une révision
        // partielle est remplacée avant d'avoir fini d'être lue.
        .accessibilityHidden(!line.isFinal)
    }

    @ViewBuilder
    private var inlinePhrase: some View {
        if isWaiting && !reduceMotion {
            TimelineView(.periodic(from: .now, by: 0.45)) { context in
                sentence(phase: Int(context.date.timeIntervalSinceReferenceDate / 0.45) % 3)
            }
        } else {
            sentence(phase: nil)
        }
    }

    private func sentence(phase: Int?) -> some View {
        CallCaptionSentence.text(line: line, nameColor: speakerColor, textColor: ink, showsWaiting: isWaiting, waitingPhase: phase)
            .contentTransition(.opacity)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Le journal garde son en-tête : le nom et l'heure, l'étiquette, puis la phrase.
    private var stackedPhrase: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Text(speakerHeading)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(speakerColor)
                    .lineLimit(1)
                if let tag = line.languageTag {
                    Text(tag)
                        .font(.caption2.weight(.semibold).monospaced())
                        .foregroundStyle(MeeshyColors.mediaChromeTertiary)
                        .padding(.horizontal, MeeshySpacing.xs)
                        .padding(.vertical, 1)
                        .background(Capsule().fill(Color.white.opacity(MeeshyOpacity.light)))
                }
            }
            Text(line.text)
                .font(.callout.weight(line.isFinal ? .regular : .light))
                .foregroundStyle(ink)
                .contentTransition(.opacity)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var fade: Animation {
        .easeInOut(duration: reduceMotion ? 0.12 : 0.22)
    }

    private var unfoldTransition: AnyTransition {
        reduceMotion ? .opacity : .opacity.combined(with: .move(edge: .top))
    }

    private var speakerHeading: String {
        guard showsTime else { return line.speakerName }
        return "\(line.speakerName) (\(line.capturedAt.formatted(date: .omitted, time: .shortened)))"
    }

    private var spokenLabel: String {
        var label = "\(line.speakerName) : \(line.text)"
        if let original = line.originalBelow {
            label += ". \(CallCaptionsCopy.original) : \(original)"
        }
        return isWaiting ? "\(label), \(CallCaptionsCopy.translating)" : label
    }

    private var accessibilityHint: String? {
        guard line.canRevealOriginal else { return nil }
        if line.originalBelow != nil { return CallCaptionsCopy.hideOriginalHint }
        return line.isShowingOriginal ? CallCaptionsCopy.showTranslatedHint : CallCaptionsCopy.showOriginalHint
    }
}

/// Une phrase qui arrive ne redessine que sa ligne : les autres se comparent par ce
/// qu'elles MONTRENT (la ligne résolue, l'heure), et leur couleur d'auteur ne se
/// recalcule pas pendant le défilement. L'action ne compte pas : elle ne fait que
/// relayer l'identifiant de la ligne.
extension CallCaptionRow: Equatable {
    static func == (lhs: CallCaptionRow, rhs: CallCaptionRow) -> Bool {
        lhs.line == rhs.line && lhs.showsTime == rhs.showsTime && lhs.showsWaiting == rhs.showsWaiting
    }
}

/// Les sous-titres : les deux dernières phrases, puis un pied (ce que les lignes disent de
/// leur traduction) et le bouton Journal. Ils vivent DANS la pilule, au-dessus de sa
/// rangée de base, dans le même verre (`hasOwnGlass: false`, #17343) ; ils ne
/// prennent un verre à eux que rangés (la pilule est cachée) ou sous un mode
/// (Effets, Montage), où il n'y a pas de pilule. La zone est une région vive
/// « Sous-titres de l'appel ».
struct CallCaptionsBand: View {
    let lines: [CallCaptionLine]
    let hasOwnGlass: Bool
    let onToggleOriginal: (UUID) -> Void
    let onOpenJournal: (() -> Void)?

    @State private var now = Date()

    private var settledLines: [CallCaptionLine] {
        lines.map { $0.settled(at: now) }
    }

    private var nextDeadline: Date? {
        lines.compactMap(\.awaitingUntil).filter { $0 > now }.min()
    }

    var body: some View {
        if hasOwnGlass {
            content
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .padding(.vertical, MeeshySpacing.xsPlus)
                .callChromeGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous))
        } else {
            content
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .padding(.top, MeeshySpacing.xsPlus)
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                if lines.isEmpty {
                    Text(CallCaptionsCopy.waiting)
                        .font(.footnote)
                        .foregroundColor(MeeshyColors.mediaChromeTertiary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    ForEach(settledLines) { line in
                        CallCaptionRow(line: line, showsWaiting: true) { onToggleOriginal(line.id) }
                            .equatable()
                    }
                }
            }
            .padding(.vertical, MeeshySpacing.xsPlus)
            footer
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(CallCaptionsCopy.region)
        .accessibilityAddTraits(.updatesFrequently)
        .task(id: nextDeadline) { await settleAtNextDeadline() }
    }

    /// L'attente d'une traduction tombe à son échéance : ni les trois points ni
    /// « traduction en cours » ne restent affichés à vie.
    private func settleAtNextDeadline() async {
        guard let deadline = nextDeadline else { return }
        let remaining = deadline.timeIntervalSinceNow
        do {
            try await Task.sleep(for: .seconds(max(remaining, 0)))
        } catch {
            return
        }
        now = max(Date(), deadline)
    }

    @ViewBuilder
    private var footer: some View {
        let note = CallCaptionsCopy.footer(CallCaptionsFooter.resolve(lines: settledLines))
        if note != nil || onOpenJournal != nil {
            HStack(spacing: MeeshySpacing.sm) {
                if let note {
                    Text(note)
                        .font(.footnote)
                        .foregroundColor(MeeshyColors.mediaChromeSecondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                Spacer(minLength: 0)
                if let onOpenJournal {
                    journalButton(onOpenJournal)
                }
            }
        }
    }

    private func journalButton(_ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(CallCaptionsCopy.journal)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .frame(minHeight: 44)
                .callChipGlass(isActive: false, tint: .white)
                .contentShape(Capsule())
        }
        .buttonStyle(CallPressButtonStyle(glassPressesItself: true))
        .accessibilityHint(CallCaptionsCopy.journalHint)
    }
}

struct CallJournalList: View {
    let items: [CallJournalItem<CallTranscriptionSegment>]
    let line: (CallJournalItem<CallTranscriptionSegment>) -> CallCaptionLine
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
                        if items.isEmpty {
                            Text(CallCaptionsCopy.waiting)
                                .font(.callout)
                                .foregroundColor(MeeshyColors.mediaChromeTertiary)
                        }
                        ForEach(items) { item in
                            let resolved = line(item)
                            CallCaptionRow(line: resolved, showsTime: true) { onToggleOriginal(resolved.id) }
                                .equatable()
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
        switch items.last {
        case .none:
            return ""
        case .capture(let capture):
            return "\(items.count)|\(capture.id)"
        case .speech(let last):
            return "\(items.count)|\(last.id.uuidString)|\(last.text.count)|\(last.translatedText?.count ?? 0)"
        }
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
            .foregroundStyle(.white)
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .frame(minHeight: 44)
            .background(Capsule().fill(Color.black.opacity(MeeshyOpacity.heavy)))
            .overlay(Capsule().stroke(Color.white.opacity(MeeshyOpacity.medium), lineWidth: MeeshyBorder.hairline))
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

/// Tout l'appel, DANS la pilule, à la place des sous-titres (#17343) : un en-tête
/// (le titre, la bascule Traduit / Original, Fermer), puis la liste, qui défile
/// et offre « Revenir au direct ». Le réglage Traduit / Original est celui du bouton
/// Sous-titres (`showOriginalText`), un toucher par phrase l'inverse.
struct CallJournalPanel: View {
    let items: [CallJournalItem<CallTranscriptionSegment>]
    let line: (CallJournalItem<CallTranscriptionSegment>) -> CallCaptionLine
    @Binding var showsOriginal: Bool
    let height: CGFloat
    let onToggleOriginal: (UUID) -> Void
    let onClose: () -> Void

    @AccessibilityFocusState private var titleHasFocus: Bool

    var body: some View {
        VStack(spacing: 0) {
            header
            CallJournalList(items: items, line: line, onToggleOriginal: onToggleOriginal)
                .frame(height: height)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(CallCaptionsCopy.journalTitle)
        .onAppear { titleHasFocus = true }
    }

    private var header: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Text(CallCaptionsCopy.journal)
                .font(.headline)
                .foregroundStyle(.white)
                .lineLimit(1)
                .accessibilityAddTraits(.isHeader)
                .accessibilityFocused($titleHasFocus)
            Spacer(minLength: 0)
            Picker(CallCaptionsCopy.journalTitle, selection: $showsOriginal) {
                Text(CallCaptionsCopy.translated).tag(false)
                Text(CallCaptionsCopy.original).tag(true)
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 200)
            CallPanelHeaderButton(symbol: "xmark", label: CallControlsCopy.closePanel, action: onClose)
        }
        .padding(.leading, MeeshySpacing.mdPlus)
        .padding(.trailing, MeeshySpacing.xsPlus)
        .padding(.top, MeeshySpacing.xxs)
    }
}
