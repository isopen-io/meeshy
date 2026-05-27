import SwiftUI
import MeeshyUI

extension MeeshyColors {

    enum SyncPillPalette: Int, CaseIterable {
        case rose, lavande, menthe, peche, ciel, mimosa, lilas, sauge

        func background(scheme: ColorScheme) -> Color {
            switch (self, scheme) {
            case (.rose, .light):    return Color(red: 0.99, green: 0.91, blue: 0.93)
            case (.rose, .dark):     return Color(red: 0.30, green: 0.15, blue: 0.20)
            case (.lavande, .light): return Color(red: 0.92, green: 0.91, blue: 0.99)
            case (.lavande, .dark):  return Color(red: 0.18, green: 0.16, blue: 0.32)
            case (.menthe, .light):  return Color(red: 0.88, green: 0.97, blue: 0.93)
            case (.menthe, .dark):   return Color(red: 0.12, green: 0.28, blue: 0.22)
            case (.peche, .light):   return Color(red: 0.99, green: 0.92, blue: 0.86)
            case (.peche, .dark):    return Color(red: 0.34, green: 0.22, blue: 0.14)
            case (.ciel, .light):    return Color(red: 0.88, green: 0.95, blue: 0.99)
            case (.ciel, .dark):     return Color(red: 0.14, green: 0.24, blue: 0.32)
            case (.mimosa, .light):  return Color(red: 0.99, green: 0.97, blue: 0.86)
            case (.mimosa, .dark):   return Color(red: 0.32, green: 0.28, blue: 0.12)
            case (.lilas, .light):   return Color(red: 0.96, green: 0.91, blue: 0.99)
            case (.lilas, .dark):    return Color(red: 0.26, green: 0.16, blue: 0.32)
            case (.sauge, .light):   return Color(red: 0.91, green: 0.95, blue: 0.90)
            case (.sauge, .dark):    return Color(red: 0.18, green: 0.26, blue: 0.16)
            @unknown default:        return .gray
            }
        }

        static func cycled(index: Int) -> SyncPillPalette {
            allCases[(abs(index) % allCases.count)]
        }
    }

    static func syncPillOfflineBackground(_ scheme: ColorScheme) -> Color {
        scheme == .dark
            ? Color(red: 0.17, green: 0.19, blue: 0.23)
            : Color(red: 0.89, green: 0.91, blue: 0.92)
    }

    static func syncPillFailedBackground(_ scheme: ColorScheme) -> Color {
        scheme == .dark
            ? Color(red: 0.25, green: 0.11, blue: 0.11)
            : Color(red: 0.99, green: 0.89, blue: 0.89)
    }
}
