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
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
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
                .padding(.leading, 14)
                .padding(.trailing, 4)
                .padding(.vertical, 6)
                .callChromeGlass(in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        } else {
            content
        }
    }

    private var content: some View {
        HStack(alignment: .top, spacing: 4) {
            VStack(alignment: .leading, spacing: 8) {
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
            .padding(.vertical, 6)
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

/// Tout l'appel, Traduit ou Original — le réglage est celui du bouton
/// Sous-titres (`showOriginalText`), un toucher par phrase l'inverse.
struct CallCaptionsJournalSheet: View {
    let lines: [CallCaptionLine]
    @Binding var showsOriginal: Bool
    let onToggleOriginal: (UUID) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    if lines.isEmpty {
                        Text(CallCaptionsCopy.waiting)
                            .font(.callout)
                            .foregroundColor(.white.opacity(0.7))
                    }
                    ForEach(lines) { line in
                        CallCaptionRow(line: line, showsTime: true) { onToggleOriginal(line.id) }
                    }
                }
                .padding(16)
            }
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
