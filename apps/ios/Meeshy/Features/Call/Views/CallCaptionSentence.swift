import SwiftUI
import MeeshyUI

/// La phrase d'une ligne de sous-titres, d'un seul tenant : « Moi · texte », puis
/// l'étiquette de langue (« EN », « EN → FR ») et, tant qu'une traduction est
/// attendue, trois points. Un seul `Text`, donc elle revient à la ligne comme une
/// phrase et se lit d'une traite (planche, vues P3 à P5).
enum CallCaptionSentence {
    static func text(
        line: CallCaptionLine,
        nameColor: Color,
        textColor: Color,
        showsWaiting: Bool,
        waitingPhase: Int?
    ) -> Text {
        var sentence = CallCaptureSentence.lead(name: line.speakerName, nameColor: nameColor)
        var body = AttributedString(line.text)
        body.foregroundColor = textColor
        body.font = Font.callout.weight(line.isFinal ? .regular : .light)
        sentence += body
        if let tag = line.languageTag {
            sentence += AttributedString(" ")
            var label = AttributedString("\u{00A0}\(tag)\u{00A0}")
            label.font = Font.caption2.weight(.semibold).monospaced()
            label.foregroundColor = MeeshyColors.mediaChromeTertiary
            label.backgroundColor = Color.white.opacity(MeeshyOpacity.light)
            sentence += label
        }
        if showsWaiting {
            sentence += waitingDots(phase: waitingPhase)
        }
        return Text(sentence)
    }

    private static func waitingDots(phase: Int?) -> AttributedString {
        (0..<3).reduce(into: AttributedString(" ")) { dots, index in
            var dot = AttributedString(index == 0 ? "•" : "\u{2009}•")
            dot.font = Font.caption2
            dot.foregroundColor = Color.white.opacity(phase.map { $0 == index ? 0.9 : 0.35 } ?? 0.6)
            dots += dot
        }
    }
}
