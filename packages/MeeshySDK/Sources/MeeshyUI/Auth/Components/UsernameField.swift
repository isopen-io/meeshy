import SwiftUI
import MeeshySDK

public struct UsernameField: View {
    @Binding var username: String
    @State private var availability: AvailabilityState = .idle
    @State private var suggestions: [String] = []
    @State private var checkTask: Task<Void, Never>?

    public init(username: Binding<String>) {
        self._username = username
    }

    private enum AvailabilityState {
        case idle, checking, available, taken, invalid
    }

    private var validationError: String? {
        guard !username.isEmpty else { return nil }
        if username.count < 2 { return "2 caracteres minimum" }
        if username.count > 16 { return "16 caracteres maximum" }
        let regex = try? NSRegularExpression(pattern: "^[a-zA-Z0-9_-]+$")
        let range = NSRange(username.startIndex..., in: username)
        if regex?.firstMatch(in: username, range: range) == nil {
            return "Lettres, chiffres, - et _ uniquement"
        }
        return nil
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                Image(systemName: "at")
                    .foregroundStyle(Color(hex: "4ECDC4"))
                    .frame(width: 20)

                TextField("Nom d'utilisateur", text: $username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                statusIcon
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color(hex: "2D2D40").opacity(0.6))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(borderColor.opacity(0.5), lineWidth: 1)
            )

            if let error = validationError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red.opacity(0.8))
                    .padding(.leading, 4)
            } else if availability == .taken {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Ce nom est deja pris")
                        .font(.caption)
                        .foregroundStyle(.red.opacity(0.8))

                    if !suggestions.isEmpty {
                        HStack(spacing: 6) {
                            ForEach(suggestions, id: \.self) { suggestion in
                                Button(suggestion) {
                                    username = suggestion
                                }
                                .font(.caption)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color(hex: "4ECDC4").opacity(0.15))
                                .clipShape(Capsule())
                                .foregroundStyle(Color(hex: "4ECDC4"))
                            }
                        }
                    }
                }
                .padding(.leading, 4)
            }
        }
        .onChange(of: username) { newValue in
            checkTask?.cancel()
            availability = .idle
            suggestions = []

            guard validationError == nil, newValue.count >= 2 else { return }

            checkTask = Task {
                try? await Task.sleep(nanoseconds: 500_000_000) // 500ms debounce
                guard !Task.isCancelled else { return }
                await checkAvailability(newValue)
            }
        }
    }

    @ViewBuilder
    private var statusIcon: some View {
        switch availability {
        case .idle:
            EmptyView()
        case .checking:
            ProgressView()
                .scaleEffect(0.8)
        case .available:
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
        case .taken:
            Image(systemName: "xmark.circle.fill")
                .foregroundStyle(.red)
        case .invalid:
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundStyle(.orange)
        }
    }

    private var borderColor: Color {
        switch availability {
        case .available: return .green
        case .taken: return .red
        default: return Color.white.opacity(0.16)
        }
    }

    private func checkAvailability(_ name: String) async {
        await MainActor.run { availability = .checking }

        do {
            let response: APIResponse<AvailabilityResponse> = try await APIClient.shared.request(
                endpoint: "/auth/check-availability",
                queryItems: [URLQueryItem(name: "username", value: name)]
            )

            await MainActor.run {
                if response.data.available {
                    availability = .available
                } else {
                    availability = .taken
                    suggestions = response.data.suggestions ?? []
                }
            }
        } catch {
            await MainActor.run { availability = .idle }
        }
    }
}
