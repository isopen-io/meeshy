import SwiftUI

// MARK: - TranslationLanguage

/// A language available for content translation.
/// `id` follows BCP-47 (e.g. "fr", "pt-BR") so future per-variant support
/// can be added without breaking existing code.
/// `group` identifies the language family for flag-based grouping
/// (e.g. "fr" groups "fr", "fr-CA", "fr-BE" under 🇫🇷).
public struct TranslationLanguage: Identifiable, Hashable, Sendable {
    public let id: String       // BCP-47 code
    public let flag: String     // flag emoji
    public let name: String     // display name (localized)
    public let group: String    // base language code for grouping

    public init(id: String, flag: String, name: String, group: String) {
        self.id = id; self.flag = flag; self.name = name; self.group = group
    }

    // MARK: All supported languages (NLLB-200 subset, most widely spoken)

    public static let all: [TranslationLanguage] = [
        // Romance
        .init(id: "fr",    flag: "🇫🇷", name: "Français",           group: "fr"),
        .init(id: "es",    flag: "🇪🇸", name: "Español",            group: "es"),
        .init(id: "pt",    flag: "🇧🇷", name: "Português",          group: "pt"),
        .init(id: "it",    flag: "🇮🇹", name: "Italiano",           group: "it"),
        .init(id: "ro",    flag: "🇷🇴", name: "Română",             group: "ro"),
        // Germanic
        .init(id: "en",    flag: "🇺🇸", name: "English",            group: "en"),
        .init(id: "de",    flag: "🇩🇪", name: "Deutsch",            group: "de"),
        .init(id: "nl",    flag: "🇳🇱", name: "Nederlands",         group: "nl"),
        .init(id: "sv",    flag: "🇸🇪", name: "Svenska",            group: "sv"),
        .init(id: "no",    flag: "🇳🇴", name: "Norsk",              group: "no"),
        .init(id: "da",    flag: "🇩🇰", name: "Dansk",              group: "da"),
        // Slavic
        .init(id: "ru",    flag: "🇷🇺", name: "Русский",            group: "ru"),
        .init(id: "pl",    flag: "🇵🇱", name: "Polski",             group: "pl"),
        .init(id: "uk",    flag: "🇺🇦", name: "Українська",         group: "uk"),
        .init(id: "cs",    flag: "🇨🇿", name: "Čeština",            group: "cs"),
        .init(id: "sk",    flag: "🇸🇰", name: "Slovenčina",         group: "sk"),
        // Asian — East
        .init(id: "zh",    flag: "🇨🇳", name: "中文",               group: "zh"),
        .init(id: "ja",    flag: "🇯🇵", name: "日本語",              group: "ja"),
        .init(id: "ko",    flag: "🇰🇷", name: "한국어",              group: "ko"),
        // Asian — South & Southeast
        .init(id: "hi",    flag: "🇮🇳", name: "हिन्दी",              group: "hi"),
        .init(id: "bn",    flag: "🇧🇩", name: "বাংলা",              group: "bn"),
        .init(id: "th",    flag: "🇹🇭", name: "ภาษาไทย",            group: "th"),
        .init(id: "vi",    flag: "🇻🇳", name: "Tiếng Việt",         group: "vi"),
        .init(id: "id",    flag: "🇮🇩", name: "Bahasa Indonesia",   group: "id"),
        .init(id: "ms",    flag: "🇲🇾", name: "Bahasa Melayu",      group: "ms"),
        .init(id: "fil",   flag: "🇵🇭", name: "Filipino",           group: "fil"),
        // Middle East / MENA
        .init(id: "ar",    flag: "🇸🇦", name: "العربية",            group: "ar"),
        .init(id: "fa",    flag: "🇮🇷", name: "فارسی",              group: "fa"),
        .init(id: "tr",    flag: "🇹🇷", name: "Türkçe",             group: "tr"),
        .init(id: "he",    flag: "🇮🇱", name: "עברית",              group: "he"),
        .init(id: "ur",    flag: "🇵🇰", name: "اردو",               group: "ur"),
        // African
        .init(id: "sw",    flag: "🇰🇪", name: "Kiswahili",          group: "sw"),
        .init(id: "am",    flag: "🇪🇹", name: "አማርኛ",              group: "am"),
        .init(id: "ha",    flag: "🇳🇬", name: "Hausa",              group: "ha"),
        .init(id: "yo",    flag: "🇳🇬", name: "Yorùbá",             group: "yo"),
        .init(id: "zu",    flag: "🇿🇦", name: "isiZulu",            group: "zu"),
        // Other
        .init(id: "el",    flag: "🇬🇷", name: "Ελληνικά",           group: "el"),
        .init(id: "hu",    flag: "🇭🇺", name: "Magyar",             group: "hu"),
        .init(id: "fi",    flag: "🇫🇮", name: "Suomi",              group: "fi"),
        .init(id: "ca",    flag: "🏴",  name: "Català",             group: "ca"),
    ]

    /// Top languages shown by default in the quick strip (one per group).
    public static let quickStrip: [TranslationLanguage] = [
        all.first { $0.id == "fr" }!,
        all.first { $0.id == "en" }!,
        all.first { $0.id == "es" }!,
        all.first { $0.id == "de" }!,
        all.first { $0.id == "pt" }!,
        all.first { $0.id == "ar" }!,
        all.first { $0.id == "zh" }!,
        all.first { $0.id == "ja" }!,
        all.first { $0.id == "ru" }!,
    ]
}

// MARK: - LanguagePickerSheet

/// Full-screen language picker sheet for translation.
/// Groups language variants under the same flag for future expandability.
public struct LanguagePickerSheet: View {
    public enum Style { case dark, light }
    public var style: Style
    public var onSelect: ((TranslationLanguage) -> Void)?
    public var onDismiss: (() -> Void)?

    @State private var searchText = ""
    @State private var selectedId: String?

    public init(
        style: Style = .dark,
        onSelect: ((TranslationLanguage) -> Void)? = nil,
        onDismiss: (() -> Void)? = nil
    ) {
        self.style = style; self.onSelect = onSelect; self.onDismiss = onDismiss
    }

    private var filtered: [TranslationLanguage] {
        guard !searchText.isEmpty else { return TranslationLanguage.all }
        let q = searchText.lowercased()
        return TranslationLanguage.all.filter {
            $0.name.lowercased().contains(q) ||
            $0.id.lowercased().contains(q) ||
            $0.flag.contains(q)
        }
    }

    public var body: some View {
        ZStack(alignment: .bottom) {
            // Dimmed background
            (style == .dark ? Color.black.opacity(0.6) : Color.black.opacity(0.3))
                .ignoresSafeArea()
                .onTapGesture { onDismiss?() }

            VStack(spacing: 0) {
                dragHandle
                searchBar
                languageGrid
            }
            .frame(maxWidth: .infinity)
            .background(sheetBackground)
            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
            .padding(.horizontal, 0)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
        .ignoresSafeArea()
    }

    // MARK: - Drag Handle

    private var dragHandle: some View {
        VStack(spacing: 10) {
            Capsule()
                .fill(style == .dark ? Color.white.opacity(0.3) : Color.gray.opacity(0.3))
                .frame(width: 36, height: 4)
                .padding(.top, 12)

            HStack {
                Text("Langue de traduction")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(style == .dark ? .white : .primary)
                Spacer()
                Button {
                    onDismiss?()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 22))
                        .foregroundColor(style == .dark ? .white.opacity(0.5) : Color.gray.opacity(0.5))
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 8)
        }
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundColor(style == .dark ? .white.opacity(0.5) : .gray)
                .font(.system(size: 15))

            TextField("Rechercher une langue…", text: $searchText)
                .font(.system(size: 15))
                .foregroundColor(style == .dark ? .white : .primary)
                .tint(Color(hex: "08D9D6"))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(style == .dark ? Color.white.opacity(0.08) : Color.black.opacity(0.06))
        )
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
    }

    // MARK: - Language Grid

    private var languageGrid: some View {
        ScrollView(showsIndicators: false) {
            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 4),
                spacing: 12
            ) {
                ForEach(filtered) { lang in
                    languageCell(lang)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 40)
        }
        .frame(maxHeight: UIScreen.main.bounds.height * 0.52)
    }

    private func languageCell(_ lang: TranslationLanguage) -> some View {
        let isSelected = selectedId == lang.id
        let accent = Color(hex: "08D9D6")

        return Button {
            HapticFeedback.medium()
            selectedId = lang.id
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                onSelect?(lang)
                onDismiss?()
            }
        } label: {
            VStack(spacing: 6) {
                Text(lang.flag)
                    .font(.system(size: 28))
                    .scaleEffect(isSelected ? 1.15 : 1.0)
                    .animation(.spring(response: 0.25, dampingFraction: 0.6), value: isSelected)

                Text(lang.name)
                    .font(.system(size: 10, weight: isSelected ? .semibold : .medium))
                    .foregroundColor(
                        isSelected
                            ? accent
                            : (style == .dark ? .white.opacity(0.75) : .primary.opacity(0.7))
                    )
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(
                        isSelected
                            ? accent.opacity(style == .dark ? 0.2 : 0.12)
                            : (style == .dark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(
                                isSelected ? accent.opacity(0.6) : Color.clear,
                                lineWidth: 1
                            )
                    )
            )
        }
    }

    // MARK: - Background

    private var sheetBackground: some View {
        Group {
            if style == .dark {
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: 28, style: .continuous)
                            .fill(Color.black.opacity(0.5))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 28, style: .continuous)
                            .stroke(Color.white.opacity(0.1), lineWidth: 0.5)
                    )
            } else {
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .fill(.regularMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: 28, style: .continuous)
                            .stroke(Color.gray.opacity(0.1), lineWidth: 0.5)
                    )
            }
        }
    }
}
