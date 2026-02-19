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

    private var label: String {
        switch strength {
        case 0: return "Trop faible"
        case 1: return "Faible"
        case 2: return "Moyen"
        case 3: return "Bon"
        case 4: return "Fort"
        case 5: return "Excellent"
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
