#if DEBUG
import SwiftUI

/// Le forçage du verre dessiné (#17334) : sur iOS 26+, le catalogue et les
/// instantanés doivent pouvoir montrer le verre dessiné, que `liquid` remplace
/// toujours ailleurs. Tout ce fichier est absent du build release.
public enum MeeshyGlassDebug {
    public static let launchArgument = "-MeeshyForceDrawnGlass"

    static let launchForcesDrawn = ProcessInfo.processInfo.arguments.contains(launchArgument)
}

private struct MeeshyGlassForcesDrawnKey: EnvironmentKey {
    static let defaultValue = false
}

private struct MeeshyGlassForcesOpaqueKey: EnvironmentKey {
    static let defaultValue = false
}

public extension EnvironmentValues {
    var meeshyGlassForcesDrawn: Bool {
        get { self[MeeshyGlassForcesDrawnKey.self] }
        set { self[MeeshyGlassForcesDrawnKey.self] = newValue }
    }

    /// « Réduire la transparence », posé par le catalogue : l'environnement du
    /// système ne s'écrit pas.
    var meeshyGlassForcesOpaque: Bool {
        get { self[MeeshyGlassForcesOpaqueKey.self] }
        set { self[MeeshyGlassForcesOpaqueKey.self] = newValue }
    }
}
#endif
