import SwiftUI

// MARK: - Toast Type

public enum ToastType {
    case success
    case error
    case info

    public var color: Color {
        switch self {
        case .success: return MeeshyColors.green
        case .error: return MeeshyColors.coral
        case .info: return MeeshyColors.cyan
        }
    }

    public var defaultIcon: String {
        switch self {
        case .success: return "checkmark.circle.fill"
        case .error: return "xmark.circle.fill"
        case .info: return "info.circle.fill"
        }
    }
}

// MARK: - Toast Data

public struct Toast: Equatable {
    public let id: UUID
    public let message: String
    public let type: ToastType
    public let icon: String

    public init(message: String, type: ToastType, icon: String? = nil) {
        self.id = UUID()
        self.message = message
        self.type = type
        self.icon = icon ?? type.defaultIcon
    }

    public static func == (lhs: Toast, rhs: Toast) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Toast View

public struct ToastView: View {
    let toast: Toast

    public init(toast: Toast) {
        self.toast = toast
    }

    public var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: toast.icon)
                .font(.system(size: MeeshyFont.headlineSize, weight: .semibold))
                .foregroundColor(.white)

            Text(toast.message)
                .font(.system(size: MeeshyFont.subheadSize, weight: .medium))
                .foregroundColor(.white)
                .lineLimit(2)
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.vertical, MeeshySpacing.md)
        .background(
            Capsule()
                .fill(toast.type.color.opacity(0.9))
                .shadow(
                    color: toast.type.color.opacity(0.3),
                    radius: MeeshyShadow.medium.radius,
                    y: MeeshyShadow.medium.y
                )
        )
    }
}
