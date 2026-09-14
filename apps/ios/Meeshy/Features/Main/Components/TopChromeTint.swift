import SwiftUI
import MeeshyUI

// ÉBAUCHE DE COMPILATION (#6579) — remplacée dès que le témoin est rouge.
// Elle n'existe que pour que `TopChromeBandGuardTests` CHARGE : un échec de
// compilation n'est pas un témoin rouge, c'est une suite qui ne tourne pas.
struct TopChromeTint: Equatable, Sendable {
    let top: Color
    let bottom: Color

    var bandColor: Color { top }
    var foreground: Color { .white }

    static let call = TopChromeTint(top: .clear, bottom: .clear)
    static let audio = TopChromeTint(top: .clear, bottom: .clear)

    static func resolve(callIsActive: Bool, audio: ActiveAudioContext?) -> TopChromeTint? { .call }
}
