import SwiftUI
import MeeshySDK

public struct LanguageOption: Identifiable {
    public let id: String
    public let name: String
    public let flag: String

    public init(id: String, name: String, flag: String) {
        self.id = id; self.name = name; self.flag = flag
    }
}

public struct LanguageSelector: View {
    let title: String
    @Binding var selectedId: String
    let languages: [LanguageOption]

    @State private var isExpanded = false

    public init(title: String, selectedId: Binding<String>, languages: [LanguageOption]? = nil) {
        self.title = title
        self._selectedId = selectedId
        self.languages = languages ?? Self.defaultLanguages
    }

    // Derived from the single translation base (LanguageData) — the onboarding
    // content-language picker offers every supported language (searchable),
    // matching the profile pickers. No hardcoded list, no spelling drift.
    public static let defaultLanguages: [LanguageOption] = LanguageData.allLanguages.map {
        LanguageOption(id: $0.code, name: $0.nativeName, flag: $0.flag)
    }

    private var selected: LanguageOption? {
        languages.first { $0.id == selectedId }
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)

            Button {
                withAnimation(.spring(response: 0.3)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack {
                    if let sel = selected {
                        Text("\(sel.flag) \(sel.name)")
                    } else {
                        Text(String(localized: "auth.languageSelector.placeholder", defaultValue: "Choisir...", bundle: .module))
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Image(systemName: "chevron.down")
                        .rotationEffect(.degrees(isExpanded ? 180 : 0))
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 14)
                        .fill(Color(hex: "2D2D40").opacity(0.6))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .strokeBorder(Color.white.opacity(0.08), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)

            if isExpanded {
                ScrollView {
                    LazyVStack(spacing: 2) {
                        ForEach(languages) { lang in
                            Button {
                                selectedId = lang.id
                                withAnimation(.spring(response: 0.3)) {
                                    isExpanded = false
                                }
                            } label: {
                                HStack {
                                    Text("\(lang.flag) \(lang.name)")
                                        .foregroundStyle(.white)
                                    Spacer()
                                    if lang.id == selectedId {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(Color(hex: "4ECDC4"))
                                    }
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 10)
                                .background(
                                    lang.id == selectedId ?
                                        Color(hex: "4ECDC4").opacity(0.15) :
                                        Color.clear
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .frame(maxHeight: 250)
                .background(
                    RoundedRectangle(cornerRadius: 14)
                        .fill(Color(hex: "2D2D40").opacity(0.8))
                )
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }
}
