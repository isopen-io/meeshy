import SwiftUI

/// Le shader de la combustion d'un éphémère (#17938), et ce que l'hôte doit en
/// savoir : `Resources/Shaders/EphemeralBurnShaders.metal`, fonction
/// `meeshyEphemeralBurn`, appliquée par `EphemeralBurnEffect` en `.layerEffect`.
///
/// Même discipline que `GameShaders` : iOS 17+ Metal, iOS 16 un repli sans
/// shader ; hors de son temps (`progress` ≤ 0 ou ≥ 1) l'effet n'est pas posé ;
/// le shader est PUR, le temps et le vent viennent de l'hôte.
public enum EphemeralBurnShaders {

    public static let functionName = "meeshyEphemeralBurn"

    /// Les shaders Metal sont disponibles (iOS 17+) ; sinon le repli joue.
    public static var usesMetal: Bool {
        if #available(iOS 17.0, macOS 14.0, *) { return true }
        return false
    }

    private static var precompiled = false

    /// Compile le shader AVANT la première combustion : sans cela, c'est elle
    /// qui paie la compilation, pendant l'animation. À appeler quand un fil
    /// porte un éphémère. Une fois par processus ; sans effet avant iOS 18
    /// (le compilateur de SwiftUI n'est pas exposé) ; jamais bloquant.
    public static func precompile() async {
        guard #available(iOS 18.0, macOS 15.0, *) else { return }
        guard !precompiled else { return }
        precompiled = true
        let library = EphemeralBurnShaders.library
        let unit = CGSize(width: 1, height: 1)
        try? await library.meeshyEphemeralBurn(
            .float2(unit), .float(0.5), .float(1), .float(0.35), .float(0.5), .float2(CGSize.zero)
        ).compile(as: .layerEffect)
    }

    /// Le préchauffage depuis un site SYNCHRONE (l'hôte qui apprend qu'un fil
    /// porte un éphémère) : ne lance la tâche que si rien n'a encore compilé.
    public static func warm() {
        guard #available(iOS 18.0, macOS 15.0, *), !precompiled else { return }
        Task { await precompile() }
    }

    /// La bibliothèque du module, lue UNE fois hors des fermetures `@Sendable`
    /// de `visualEffect` : `Bundle.module` est isolé au `MainActor` ici.
    @available(iOS 17.0, macOS 14.0, *)
    static var library: ShaderLibrary { ShaderLibrary.bundle(.module) }

    /// La bibliothèque compilée — `nil` si la ressource Metal n'a pas été
    /// compilée dans le module (le témoin `EphemeralBurnShadersTests` le dit
    /// avant que la combustion ne reste muette).
    static var metallibURL: URL? {
        Bundle.module.url(forResource: "default", withExtension: "metallib")
    }

    /// Le temps pendant lequel `progress` anime vraiment l'effet.
    static func isActive(_ progress: Double) -> Bool { progress > 0 && progress < 1 }

    /// Jusqu'où le shader va chercher un pixel : la chaleur (6), la dérive des
    /// cendres (12) et les trois pas des flammes (28, couchés par le vent).
    static let maxSampleOffset = CGSize(width: 32, height: 36)
}

/// **Le calque est AGRANDI avant l'effet, et la mise en page ne le sait pas.**
/// Des marges transparentes sont posées sur la bulle avant le shader — pour
/// que flammes et étincelles sortent du cadre — puis les mêmes marges,
/// négatives, les retirent après : les voisins ne bougent pas d'un point.
public enum EphemeralBurnOverhang {
    public static let horizontal: CGFloat = 24
    public static let top: CGFloat = 48
}
