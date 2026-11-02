import UIKit
import MeeshySDK

/// **Les 1 000 caractères d'un texte se tiennent À LA FRAPPE** (#13590).
///
/// Un collage trop long entre coupé à la place qui reste — par caractère
/// affiché, jamais au milieu d'un emoji ou d'un drapeau —, et la borne se DIT :
/// le canvas ne voit pas le composeur, il poste donc `limitReached`, que l'hôte
/// traduit en haptique et en message.
public enum StoryInlineTextLengthGate {

    /// Posté à chaque frappe qui bute sur `StoryComposerLimits.maxTextCharacters`.
    public static let limitReached = Notification.Name("StoryInlineTextLengthGate.limitReached")

    /// `text` coupé à la borne ; une coupe se DIT (éditeur plein écran, lié par valeur).
    static func clamped(_ text: String) -> String {
        let fitted = StoryComposerLimits.clampedText(text)
        if fitted != text { NotificationCenter.default.post(name: limitReached, object: nil) }
        return fitted
    }

    /// `accepted` : le champ applique `replacement` lui-même. Sinon `wroteHead`
    /// dit si la tête qui tient vient d'être écrite à sa place.
    static func admit(_ replacement: String, in range: NSRange,
                      of textView: UITextView) -> (accepted: Bool, wroteHead: Bool) {
        let current = textView.text ?? ""
        guard let swiftRange = Range(range, in: current) else { return (true, false) }
        let fitted = StoryComposerLimits.fittedReplacement(current: current, replacing: swiftRange, with: replacement)
        guard fitted != replacement else { return (true, false) }
        NotificationCenter.default.post(name: limitReached, object: textView)
        guard !fitted.isEmpty else { return (false, false) }
        textView.textStorage.replaceCharacters(in: range, with: fitted)
        textView.selectedRange = NSRange(location: range.location + (fitted as NSString).length, length: 0)
        return (false, true)
    }
}
