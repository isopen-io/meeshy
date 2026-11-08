import SwiftUI

/// « Rien reçu ? Regardez aussi dans vos spams ou courriers indésirables. »
/// — la ligne que chaque écran pose sous l'annonce d'un e-mail parti (#16937).
///
/// UNE ligne visible, pas un (i) à déplier ni une bannière : la personne qui
/// attend un e-mail qui n'arrive pas ne sait pas qu'il faut chercher une
/// explication. Même phrase que le web (`emailSent.checkSpam`), au catalogue
/// de MeeshyUI pour que l'app et le SDK la disent avec la même clé.
///
/// Un atome sans état ni singleton : le test du grain le range dans le SDK.
/// Rien pour le SMS — un texto n'a pas de dossier spam.
public struct EmailSpamFolderHint: View {
    public static var text: String {
        String(
            localized: "emailSent.checkSpam",
            defaultValue: "Rien reçu ? Regardez aussi dans vos spams ou courriers indésirables.",
            bundle: .module
        )
    }

    private let alignment: TextAlignment

    public init(alignment: TextAlignment = .center) {
        self.alignment = alignment
    }

    public var body: some View {
        Text(Self.text)
            .font(.caption)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(alignment)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("emailSent.checkSpam")
    }
}
