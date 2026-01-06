//
//  PasswordStrengthIndicator.swift
//  Meeshy
//
//  Visual password strength indicator
//  Minimum iOS 16+
//

import SwiftUI

/// Visual indicator showing password strength
struct PasswordStrengthIndicator: View {
    // MARK: - Properties

    let password: String

    // MARK: - Body

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Strength Bar
            HStack(spacing: 4) {
                ForEach(0..<4, id: \.self) { index in
                    Rectangle()
                        .fill(barColor(for: index))
                        .frame(height: 4)
                        .cornerRadius(2)
                }
            }

            // Strength Label
            Text(strengthText)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(strengthColor)

            // Requirements Checklist
            VStack(alignment: .leading, spacing: 6) {
                RequirementRow(
                    text: "At least 8 characters",
                    isMet: password.count >= 8
                )
                RequirementRow(
                    text: "Contains uppercase letter",
                    isMet: password.contains(where: { $0.isUppercase })
                )
                RequirementRow(
                    text: "Contains lowercase letter",
                    isMet: password.contains(where: { $0.isLowercase })
                )
                RequirementRow(
                    text: "Contains number",
                    isMet: password.contains(where: { $0.isNumber })
                )
            }
            .padding(.top, 4)
        }
        .animation(.easeInOut(duration: 0.2), value: strength)
    }

    // MARK: - Computed Properties

    private var strength: PasswordStrength {
        PasswordStrength.calculate(for: password)
    }

    private var strengthText: String {
        strength.displayName
    }

    private var strengthColor: Color {
        strength.color
    }

    private func barColor(for index: Int) -> Color {
        let activeLevel = strength.level
        if index < activeLevel {
            return strength.color
        } else {
            return Color(UIColor.systemGray5)
        }
    }
}

// MARK: - Requirement Row

private struct RequirementRow: View {
    let text: String
    let isMet: Bool

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: isMet ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 14))
                .foregroundColor(isMet ? Color(red: 52/255, green: 199/255, blue: 89/255) : .secondary)

            Text(text)
                .font(.system(size: 13))
                .foregroundColor(isMet ? .primary : .secondary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(text), \(isMet ? "met" : "not met")")
    }
}

// MARK: - Password Strength

enum PasswordStrength {
    case weak
    case fair
    case good
    case strong

    static func calculate(for password: String) -> PasswordStrength {
        guard !password.isEmpty else { return .weak }

        var score = 0

        // Length check
        if password.count >= 8 { score += 1 }
        if password.count >= 12 { score += 1 }

        // Character variety
        if password.contains(where: { $0.isUppercase }) { score += 1 }
        if password.contains(where: { $0.isLowercase }) { score += 1 }
        if password.contains(where: { $0.isNumber }) { score += 1 }
        if password.contains(where: { "!@#$%^&*()_+-=[]{}|;:,.<>?".contains($0) }) { score += 1 }

        switch score {
        case 0...2:
            return .weak
        case 3...4:
            return .fair
        case 5...6:
            return .good
        default:
            return .strong
        }
    }

    var level: Int {
        switch self {
        case .weak: return 1
        case .fair: return 2
        case .good: return 3
        case .strong: return 4
        }
    }

    var displayName: String {
        switch self {
        case .weak: return "Weak"
        case .fair: return "Fair"
        case .good: return "Good"
        case .strong: return "Strong"
        }
    }

    var color: Color {
        switch self {
        case .weak:
            return Color(red: 1, green: 59/255, blue: 48/255) // #FF3B30
        case .fair:
            return Color(red: 1, green: 149/255, blue: 0) // #FF9500
        case .good:
            return Color(red: 1, green: 204/255, blue: 0) // #FFCC00
        case .strong:
            return Color(red: 52/255, green: 199/255, blue: 89/255) // #34C759
        }
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 24) {
        PasswordStrengthIndicator(password: "")
        PasswordStrengthIndicator(password: "weak")
        PasswordStrengthIndicator(password: "Better123")
        PasswordStrengthIndicator(password: "StrongP@ssw0rd!")
    }
    .padding()
}
