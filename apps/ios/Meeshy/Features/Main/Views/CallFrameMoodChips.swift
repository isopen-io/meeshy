import SwiftUI
import MeeshyUI

/// Les mots des cadres (#8742) : les ambiances se traduisent, les motifs sont des noms
/// propres (`CallFrameDesign.name`) et ne se traduisent pas.
enum CallFrameCopy {
    static var classics: String {
        String(localized: "call.frames.classics", defaultValue: "Classiques", bundle: .main)
    }

    static func moodName(_ mood: CallFrameMood) -> String {
        switch mood {
        case .signature: return String(localized: "call.frames.mood.signature", defaultValue: "Signature", bundle: .main)
        case .distingue: return String(localized: "call.frames.mood.distingue", defaultValue: "Distingué", bundle: .main)
        case .elegant: return String(localized: "call.frames.mood.elegant", defaultValue: "Élégant", bundle: .main)
        case .jovial: return String(localized: "call.frames.mood.jovial", defaultValue: "Jovial", bundle: .main)
        case .deconnecte: return String(localized: "call.frames.mood.deconnecte", defaultValue: "Déconnecté", bundle: .main)
        case .corporate: return String(localized: "call.frames.mood.corporate", defaultValue: "Corporate", bundle: .main)
        case .fantastique: return String(localized: "call.frames.mood.fantastique", defaultValue: "Fantastique", bundle: .main)
        case .futuriste: return String(localized: "call.frames.mood.futuriste", defaultValue: "Futuriste", bundle: .main)
        case .glauque: return String(localized: "call.frames.mood.glauque", defaultValue: "Glauque", bundle: .main)
        case .horsNorme: return String(localized: "call.frames.mood.hors-norme", defaultValue: "Hors norme", bundle: .main)
        case .morbide: return String(localized: "call.frames.mood.morbide", defaultValue: "Morbide", bundle: .main)
        case .feerique: return String(localized: "call.frames.mood.feerique", defaultValue: "Féerique", bundle: .main)
        }
    }

    static func chipName(_ chip: CallMontageMoodChip) -> String {
        switch chip {
        case .classics: return classics
        case .mood(let mood): return moodName(mood)
        }
    }

    /// Le nom d'un élément du carrousel : le style classique traduit, ou le nom propre du motif.
    static func choiceName(_ choice: CallMontageChoice) -> String {
        switch choice {
        case .classic(let style): return CallCaptureCopy.styleName(style)
        case .frame(let id): return CallMontageFrameRule.design(id: id)?.name ?? ""
        }
    }

    /// Le glyphe qui tient la place d'une vignette tant qu'elle n'est pas rendue — jamais un spinner.
    static func choiceSymbol(_ choice: CallMontageChoice) -> String {
        switch choice {
        case .classic(let style):
            return CallCaptureCopy.styleSymbol(style)
        case .frame(let id):
            return CallMontageFrameRule.design(id: id).map { moodSymbol($0.mood) } ?? "square.dashed"
        }
    }

    static func moodSymbol(_ mood: CallFrameMood) -> String {
        switch mood {
        case .signature: return "signature"
        case .distingue: return "crown"
        case .elegant: return "sparkles"
        case .jovial: return "face.smiling"
        case .deconnecte: return "leaf"
        case .corporate: return "briefcase"
        case .fantastique: return "wand.and.stars"
        case .futuriste: return "cpu"
        case .glauque: return "cloud.fog"
        case .horsNorme: return "burst"
        case .morbide: return "moon"
        case .feerique: return "sparkle"
        }
    }
}

/// **LES PUCES D'AMBIANCE DU MONTAGE** (#8742, spec § 3) — au-dessus du carrousel :
/// « Classiques », puis les ambiances qui servent `n`. Toucher une puce change le carrousel
/// dans la même image ; chaque puce est une capsule de verre (iOS 26, repli matériau avant),
/// enfoncée au premier toucher par `CallPressButtonStyle`, cible de 44 pt au moins.
struct CallFrameMoodChips: View {
    let chips: [CallMontageMoodChip]
    let selected: CallMontageMoodChip
    var isEnabled = true
    let onSelect: (CallMontageMoodChip) -> Void

    static let spacing: CGFloat = 8

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                AdaptiveGlassContainer(spacing: Self.spacing) {
                    HStack(spacing: Self.spacing) {
                        ForEach(chips, id: \.self) { chip in
                            CallFrameMoodChip(title: CallFrameCopy.chipName(chip), isSelected: chip == selected) {
                                guard chip != selected else { return }
                                HapticFeedback.light()
                                onSelect(chip)
                            }
                            .id(chip)
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
            .disabled(!isEnabled)
            .opacity(isEnabled ? 1 : 0.5)
            .onAppear {
                proxy.scrollTo(selected, anchor: .center)
            }
            .adaptiveOnChange(of: selected) { _, chip in
                withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.25)) {
                    proxy.scrollTo(chip, anchor: .center)
                }
            }
        }
    }
}

private struct CallFrameMoodChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            CallFrameMoodChipLabel(title: title, isSelected: isSelected)
        }
        .buttonStyle(CallPressButtonStyle())
        .accessibilityLabel(title)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : [.isButton])
    }
}

private struct CallFrameMoodChipLabel: View {
    let title: String
    let isSelected: Bool

    static let capsuleHeight: CGFloat = 36
    static let minimumTarget: CGFloat = 44

    @Environment(\.callButtonIsPressed) private var isPressed

    var body: some View {
        Text(title)
            .font(.footnote.weight(.semibold))
            .foregroundColor(isSelected ? MeeshyColors.indigo950 : .white)
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, 14)
            .frame(minWidth: Self.minimumTarget, minHeight: Self.capsuleHeight)
            .background(Capsule().fill(isSelected ? Color.white : Color.clear))
            .background(Capsule().fill(CallButtonFill.pressedHighlight(isPressed: isPressed)))
            .callChipGlass(isActive: isSelected, tint: .white)
            .padding(.vertical, (Self.minimumTarget - Self.capsuleHeight) / 2)
            .contentShape(Rectangle())
    }
}
