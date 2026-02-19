import SwiftUI

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

    public static let defaultLanguages: [LanguageOption] = [
        LanguageOption(id: "fr", name: "Francais", flag: "🇫🇷"),
        LanguageOption(id: "en", name: "English", flag: "🇬🇧"),
        LanguageOption(id: "es", name: "Espanol", flag: "🇪🇸"),
        LanguageOption(id: "de", name: "Deutsch", flag: "🇩🇪"),
        LanguageOption(id: "it", name: "Italiano", flag: "🇮🇹"),
        LanguageOption(id: "pt", name: "Portugues", flag: "🇵🇹"),
        LanguageOption(id: "ar", name: "العربية", flag: "🇸🇦"),
        LanguageOption(id: "zh", name: "中文", flag: "🇨🇳"),
        LanguageOption(id: "ja", name: "日本語", flag: "🇯🇵"),
        LanguageOption(id: "ko", name: "한국어", flag: "🇰🇷"),
        LanguageOption(id: "ru", name: "Русский", flag: "🇷🇺"),
        LanguageOption(id: "tr", name: "Turkce", flag: "🇹🇷"),
        LanguageOption(id: "nl", name: "Nederlands", flag: "🇳🇱"),
        LanguageOption(id: "pl", name: "Polski", flag: "🇵🇱"),
        LanguageOption(id: "sv", name: "Svenska", flag: "🇸🇪"),
        LanguageOption(id: "hi", name: "हिन्दी", flag: "🇮🇳"),
        LanguageOption(id: "th", name: "ไทย", flag: "🇹🇭"),
        LanguageOption(id: "vi", name: "Tieng Viet", flag: "🇻🇳"),
        LanguageOption(id: "uk", name: "Українська", flag: "🇺🇦"),
        LanguageOption(id: "ro", name: "Romana", flag: "🇷🇴"),
    ]

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
                        Text("Choisir...")
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
