import SwiftUI

public struct PasswordStrengthIndicator: View {
    let password: String

    public init(password: String) {
        self.password = password
    }

    private var strength: Int {
        var score = 0
        if password.count >= 8 { score += 1 }
        if password.count >= 12 { score += 1 }
        if password.rangeOfCharacter(from: .uppercaseLetters) != nil { score += 1 }
        if password.rangeOfCharacter(from: .lowercaseLetters) != nil { score += 1 }
        if password.rangeOfCharacter(from: .decimalDigits) != nil { score += 1 }
        if password.rangeOfCharacter(from: CharacterSet(charactersIn: "!@#$%^&*()_+-=[]{}|;:,.<>?")) != nil { score += 1 }
        return min(score, 5)
    }

    /// **La JUMELLE trouvée en fermant #4431**, et sa portée est plus large que
    /// l'originale : ces six mots sont lus par quiconque CRÉE un compte, sur
    /// six des sept langues servies, depuis toujours.
    ///
    /// C'est la forme exacte du défaut du composer — des littéraux français
    /// rendus comme valeur, jamais comme `defaultValue`, donc invisibles au
    /// cliquet de localisation qui ne balaie que les `defaultValue:`. Ce qui
    /// diffère est le hasard : le rail *trailing* a rendu les six premiers
    /// VISIBLES en permanence ; ceux-ci n'ont jamais eu besoin de l'être pour
    /// être faux.
    private var label: String {
        switch strength {
        case 0: return String(localized: "auth.password.strength.veryWeak",
                              defaultValue: "Trop faible", bundle: .module)
        case 1: return String(localized: "auth.password.strength.weak",
                              defaultValue: "Faible", bundle: .module)
        case 2: return String(localized: "auth.password.strength.medium",
                              defaultValue: "Moyen", bundle: .module)
        case 3: return String(localized: "auth.password.strength.good",
                              defaultValue: "Bon", bundle: .module)
        case 4: return String(localized: "auth.password.strength.strong",
                              defaultValue: "Fort", bundle: .module)
        case 5: return String(localized: "auth.password.strength.excellent",
                              defaultValue: "Excellent", bundle: .module)
        default: return ""
        }
    }

    private var color: Color {
        switch strength {
        case 0: return .red
        case 1: return .red
        case 2: return .orange
        case 3: return .yellow
        case 4: return .green
        case 5: return .green
        default: return .gray
        }
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                ForEach(0..<5, id: \.self) { index in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(index < strength ? color : Color.white.opacity(0.1))
                        .frame(height: 4)
                }
            }

            if !password.isEmpty {
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(color)
            }
        }
    }
}
