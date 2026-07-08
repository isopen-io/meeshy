import SwiftUI

/// Émis à `true` par un widget média (waveform audio, seek bar vidéo) pendant
/// que l'utilisateur manipule son curseur de lecture.
///
/// Signal opaque : le SDK ne décide rien — l'hôte (ex. le conteneur de swipe
/// d'une bulle de conversation côté app) lit la préférence et choisit quoi en
/// faire, typiquement désengager ses propres gestes horizontaux le temps du
/// scrub. `reduce` en OR : plusieurs widgets média dans la même hiérarchie,
/// un seul en scrub suffit.
public struct MediaScrubbingPreferenceKey: PreferenceKey {
    public static let defaultValue: Bool = false
    public static func reduce(value: inout Bool, nextValue: () -> Bool) {
        value = value || nextValue()
    }
}
