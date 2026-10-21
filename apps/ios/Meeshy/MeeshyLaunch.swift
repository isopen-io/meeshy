import SwiftUI

/// **Le point d'entrée du processus : la langue de l'interface s'écrit AVANT
/// que l'application ne démarre** (#10804).
///
/// iOS fige la localisation du bundle dès le démarrage de `UIApplicationMain`,
/// mais `Locale.current` et les vues système (sélecteur de photos) relisent
/// `AppleLanguages` à la volée. Écrit dans `MeeshyApp.init()`, l'override
/// arrivait entre les deux : interface anglaise, dates et « Annuler » français
/// dans la même session. Écrit ici, les trois lisent la même langue.
@main
@MainActor
enum MeeshyLaunch {
    static func main() {
        // #10854 — AVANT toute session ou socket : sous XCTest, rien ne part.
        TestHarnessNetworkSeal.installIfUnderTestHarness()
        UILanguageOverride.applyIfNeeded()
        MeeshyApp.main()
    }
}
