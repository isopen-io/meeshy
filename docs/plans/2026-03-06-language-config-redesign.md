# Language Configuration Redesign & Translation Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the broken translation pipeline (messages always in English) and reorganize language settings so content languages are in Profile and interface language is in Appearance.

**Architecture:** The fix spans 3 layers: (1) SDK `UpdateProfileRequest` gains translation booleans, (2) iOS ProfileView computes them implicitly from configured languages and sends them to backend, (3) iOS `sendMessage()` sends `originalLanguage` from keyboard detection. SettingsView language section moves into Appearance.

**Tech Stack:** SwiftUI (iOS 17+), MeeshySDK (Swift Package), Fastify gateway (TypeScript)

---

### Task 1: SDK — Add translation booleans to UpdateProfileRequest

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/UserModels.swift:2-18`

**Step 1: Add the 3 boolean fields to UpdateProfileRequest**

```swift
public struct UpdateProfileRequest: Encodable {
    public var firstName: String?
    public var lastName: String?
    public var displayName: String?
    public var bio: String?
    public var systemLanguage: String?
    public var regionalLanguage: String?
    public var customDestinationLanguage: String?
    public var translateToSystemLanguage: Bool?
    public var translateToRegionalLanguage: Bool?
    public var useCustomDestination: Bool?

    public init(firstName: String? = nil, lastName: String? = nil, displayName: String? = nil,
                bio: String? = nil, systemLanguage: String? = nil, regionalLanguage: String? = nil,
                customDestinationLanguage: String? = nil,
                translateToSystemLanguage: Bool? = nil,
                translateToRegionalLanguage: Bool? = nil,
                useCustomDestination: Bool? = nil) {
        self.firstName = firstName; self.lastName = lastName; self.displayName = displayName
        self.bio = bio; self.systemLanguage = systemLanguage; self.regionalLanguage = regionalLanguage
        self.customDestinationLanguage = customDestinationLanguage
        self.translateToSystemLanguage = translateToSystemLanguage
        self.translateToRegionalLanguage = translateToRegionalLanguage
        self.useCustomDestination = useCustomDestination
    }
}
```

**Step 2: Build SDK to verify compilation**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/UserModels.swift
git commit -m "feat(sdk): add translation boolean fields to UpdateProfileRequest"
```

---

### Task 2: iOS — Create LanguagePickerSheet component

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/LanguagePickerSheet.swift`

**Step 1: Create the LanguagePickerSheet**

This is a reusable sheet that displays a searchable list of languages with flags and native names. Used by both ProfileView (60+ languages) and SettingsView (limited set for UI).

```swift
import SwiftUI
import MeeshySDK

struct LanguagePickerSheet: View {
    let title: String
    let languages: [(code: String, name: String, nativeName: String, flag: String)]
    let selectedCode: String
    let allowClear: Bool
    let onSelect: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
    @State private var searchText = ""

    private var filteredLanguages: [(code: String, name: String, nativeName: String, flag: String)] {
        guard !searchText.isEmpty else { return languages }
        let query = searchText.lowercased()
        return languages.filter {
            $0.name.lowercased().contains(query) ||
            $0.nativeName.lowercased().contains(query) ||
            $0.code.lowercased().contains(query)
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()

                ScrollView {
                    LazyVStack(spacing: 2) {
                        if allowClear {
                            clearRow
                        }
                        ForEach(filteredLanguages, id: \.code) { lang in
                            languageRow(lang)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                }
            }
            .searchable(text: $searchText, prompt: "Rechercher une langue")
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") { dismiss() }
                        .foregroundColor(Color(hex: "A855F7"))
                }
            }
        }
    }

    private var clearRow: some View {
        Button {
            HapticFeedback.light()
            onSelect("")
            dismiss()
        } label: {
            HStack(spacing: 12) {
                Text("🚫")
                    .font(.system(size: 24))
                    .frame(width: 36)
                Text("Aucune")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                Spacer()
                if selectedCode.isEmpty {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(Color(hex: "A855F7"))
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(selectedCode.isEmpty
                        ? Color(hex: "A855F7").opacity(0.1)
                        : theme.surfaceGradient(tint: "6B7280"))
            )
        }
    }

    private func languageRow(_ lang: (code: String, name: String, nativeName: String, flag: String)) -> some View {
        let isSelected = lang.code == selectedCode
        return Button {
            HapticFeedback.light()
            onSelect(lang.code)
            dismiss()
        } label: {
            HStack(spacing: 12) {
                Text(lang.flag)
                    .font(.system(size: 24))
                    .frame(width: 36)

                VStack(alignment: .leading, spacing: 2) {
                    Text(lang.nativeName)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                    Text(lang.name)
                        .font(.system(size: 12))
                        .foregroundColor(theme.textMuted)
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(Color(hex: "A855F7"))
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected
                        ? Color(hex: "A855F7").opacity(0.1)
                        : Color.clear)
            )
        }
    }
}
```

**Step 2: Add LanguageData helper (static language list for iOS)**

Add at the bottom of the same file:

```swift
enum LanguageData {
    static let allLanguages: [(code: String, name: String, nativeName: String, flag: String)] = [
        ("fr", "French", "Français", "🇫🇷"),
        ("en", "English", "English", "🇬🇧"),
        ("es", "Spanish", "Español", "🇪🇸"),
        ("ar", "Arabic", "العربية", "🇸🇦"),
        ("de", "German", "Deutsch", "🇩🇪"),
        ("it", "Italian", "Italiano", "🇮🇹"),
        ("pt", "Portuguese", "Português", "🇧🇷"),
        ("zh", "Chinese", "中文", "🇨🇳"),
        ("ja", "Japanese", "日本語", "🇯🇵"),
        ("ko", "Korean", "한국어", "🇰🇷"),
        ("ru", "Russian", "Русский", "🇷🇺"),
        ("tr", "Turkish", "Türkçe", "🇹🇷"),
        ("nl", "Dutch", "Nederlands", "🇳🇱"),
        ("hi", "Hindi", "हिन्दी", "🇮🇳"),
        ("sw", "Swahili", "Kiswahili", "🇰🇪"),
        ("pl", "Polish", "Polski", "🇵🇱"),
        ("uk", "Ukrainian", "Українська", "🇺🇦"),
        ("ro", "Romanian", "Română", "🇷🇴"),
        ("el", "Greek", "Ελληνικά", "🇬🇷"),
        ("cs", "Czech", "Čeština", "🇨🇿"),
        ("sv", "Swedish", "Svenska", "🇸🇪"),
        ("da", "Danish", "Dansk", "🇩🇰"),
        ("fi", "Finnish", "Suomi", "🇫🇮"),
        ("no", "Norwegian", "Norsk", "🇳🇴"),
        ("hu", "Hungarian", "Magyar", "🇭🇺"),
        ("he", "Hebrew", "עברית", "🇮🇱"),
        ("th", "Thai", "ไทย", "🇹🇭"),
        ("vi", "Vietnamese", "Tiếng Việt", "🇻🇳"),
        ("id", "Indonesian", "Bahasa Indonesia", "🇮🇩"),
        ("ms", "Malay", "Bahasa Melayu", "🇲🇾"),
        ("bn", "Bengali", "বাংলা", "🇧🇩"),
        ("ta", "Tamil", "தமிழ்", "🇮🇳"),
        ("ur", "Urdu", "اردو", "🇵🇰"),
        ("fa", "Persian", "فارسی", "🇮🇷"),
        ("bg", "Bulgarian", "Български", "🇧🇬"),
        ("hr", "Croatian", "Hrvatski", "🇭🇷"),
        ("sr", "Serbian", "Српски", "🇷🇸"),
        ("sk", "Slovak", "Slovenčina", "🇸🇰"),
        ("lt", "Lithuanian", "Lietuvių", "🇱🇹"),
        ("lv", "Latvian", "Latviešu", "🇱🇻"),
        ("et", "Estonian", "Eesti", "🇪🇪"),
        ("sl", "Slovenian", "Slovenščina", "🇸🇮"),
        ("ka", "Georgian", "ქართული", "🇬🇪"),
        ("hy", "Armenian", "Հայերեն", "🇦🇲"),
        ("az", "Azerbaijani", "Azərbaycan", "🇦🇿"),
        ("kk", "Kazakh", "Қазақша", "🇰🇿"),
        ("uz", "Uzbek", "O'zbek", "🇺🇿"),
        ("am", "Amharic", "አማርኛ", "🇪🇹"),
        ("yo", "Yoruba", "Yorùbá", "🇳🇬"),
        ("ig", "Igbo", "Igbo", "🇳🇬"),
        ("ha", "Hausa", "Hausa", "🇳🇬"),
        ("zu", "Zulu", "isiZulu", "🇿🇦"),
        ("xh", "Xhosa", "isiXhosa", "🇿🇦"),
        ("af", "Afrikaans", "Afrikaans", "🇿🇦"),
        ("mg", "Malagasy", "Malagasy", "🇲🇬"),
        ("tl", "Filipino", "Filipino", "🇵🇭"),
        ("my", "Burmese", "မြန်မာဘာသာ", "🇲🇲"),
        ("km", "Khmer", "ភាសាខ្មែរ", "🇰🇭"),
        ("lo", "Lao", "ລາວ", "🇱🇦"),
        ("ne", "Nepali", "नेपाली", "🇳🇵"),
    ]

    static let interfaceLanguages: [(code: String, name: String, nativeName: String, flag: String)] = [
        ("fr", "French", "Français", "🇫🇷"),
        ("en", "English", "English", "🇬🇧"),
        ("es", "Spanish", "Español", "🇪🇸"),
        ("ar", "Arabic", "العربية", "🇸🇦"),
    ]

    static func info(for code: String) -> (name: String, nativeName: String, flag: String)? {
        allLanguages.first(where: { $0.code == code }).map { ($0.name, $0.nativeName, $0.flag) }
    }
}
```

**Step 3: Add file to Xcode project**

The file needs to exist at the correct path. Since meeshy.sh builds via xcodebuild and the project uses folder references, verify it compiles:

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/LanguagePickerSheet.swift
git commit -m "feat(ios): add LanguagePickerSheet component with 60+ languages"
```

---

### Task 3: iOS — Enhance ProfileView language section

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ProfileView.swift`

**Step 1: Add sheet state variables**

At the top of ProfileView, add after the existing `@State` vars (around line 22):

```swift
@State private var showSystemLanguagePicker = false
@State private var showRegionalLanguagePicker = false
@State private var showCustomLanguagePicker = false
```

**Step 2: Replace languagesSection (lines 379-390)**

Replace the existing `languagesSection` with enhanced version:

```swift
private var languagesSection: some View {
    VStack(alignment: .leading, spacing: 12) {
        sectionHeader(icon: "globe", title: "LANGUES", color: "FF6B6B")

        VStack(spacing: 0) {
            languagePickerRow(
                title: "Langue principale",
                subtitle: "Le contenu sera traduit dans cette langue",
                code: systemLanguage,
                required: true,
                showPicker: $showSystemLanguagePicker
            )
            languagePickerRow(
                title: "Langue regionale",
                subtitle: nil,
                code: regionalLanguage,
                required: false,
                showPicker: $showRegionalLanguagePicker
            )
            languagePickerRow(
                title: "Langue personnalisee",
                subtitle: nil,
                code: customDestinationLanguage,
                required: false,
                showPicker: $showCustomLanguagePicker
            )
        }
        .background(sectionBackground)
    }
    .sheet(isPresented: $showSystemLanguagePicker) {
        LanguagePickerSheet(
            title: "Langue principale",
            languages: LanguageData.allLanguages,
            selectedCode: systemLanguage,
            allowClear: false,
            onSelect: { systemLanguage = $0 }
        )
    }
    .sheet(isPresented: $showRegionalLanguagePicker) {
        LanguagePickerSheet(
            title: "Langue regionale",
            languages: LanguageData.allLanguages,
            selectedCode: regionalLanguage,
            allowClear: true,
            onSelect: { regionalLanguage = $0 }
        )
    }
    .sheet(isPresented: $showCustomLanguagePicker) {
        LanguagePickerSheet(
            title: "Langue personnalisee",
            languages: LanguageData.allLanguages,
            selectedCode: customDestinationLanguage,
            allowClear: true,
            onSelect: { customDestinationLanguage = $0 }
        )
    }
}
```

**Step 3: Add languagePickerRow helper**

Replace the existing `languageRow` function (lines 523-549) with:

```swift
private func languagePickerRow(
    title: String,
    subtitle: String?,
    code: String,
    required: Bool,
    showPicker: Binding<Bool>
) -> some View {
    Button {
        guard isEditing else { return }
        HapticFeedback.light()
        showPicker.wrappedValue = true
    } label: {
        HStack(spacing: 12) {
            fieldIcon("globe")

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(theme.textPrimary)

                if let subtitle, !code.isEmpty {
                    Text(subtitle)
                        .font(.system(size: 11))
                        .foregroundColor(theme.textMuted)
                }
            }

            Spacer()

            if let info = LanguageData.info(for: code) {
                HStack(spacing: 6) {
                    Text(info.flag)
                        .font(.system(size: 18))
                    Text(info.nativeName)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
            } else {
                Text(required ? "Choisir" : "Aucune")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }

            if isEditing {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(theme.textMuted)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }
    .disabled(!isEditing)
}
```

**Step 4: Update saveProfile to compute and send booleans**

Replace `saveProfile()` function (lines 611-634):

```swift
private func saveProfile() {
    isSaving = true
    Task {
        do {
            let request = UpdateProfileRequest(
                firstName: firstName.isEmpty ? nil : firstName,
                lastName: lastName.isEmpty ? nil : lastName,
                displayName: displayName.isEmpty ? nil : displayName,
                bio: bio.isEmpty ? nil : bio,
                systemLanguage: systemLanguage.isEmpty ? nil : systemLanguage,
                regionalLanguage: regionalLanguage.isEmpty ? nil : regionalLanguage,
                customDestinationLanguage: customDestinationLanguage.isEmpty ? nil : customDestinationLanguage,
                translateToSystemLanguage: !systemLanguage.isEmpty ? true : nil,
                translateToRegionalLanguage: !regionalLanguage.isEmpty ? true : false,
                useCustomDestination: !customDestinationLanguage.isEmpty ? true : false
            )
            let updatedUser = try await UserService.shared.updateProfile(request)
            authManager.currentUser = updatedUser
            HapticFeedback.success()
            isEditing = false
        } catch {
            HapticFeedback.error()
            withAnimation { errorMessage = error.localizedDescription }
        }
        isSaving = false
    }
}
```

**Step 5: Initialize systemLanguage from device locale in loadUserData**

Replace `loadUserData()` (lines 588-596):

```swift
private func loadUserData() {
    firstName = user?.firstName ?? ""
    lastName = user?.lastName ?? ""
    displayName = user?.displayName ?? user?.username ?? ""
    bio = user?.bio ?? ""
    let deviceLang = Locale.current.language.languageCode?.identifier ?? "fr"
    systemLanguage = user?.systemLanguage ?? deviceLang
    regionalLanguage = user?.regionalLanguage ?? ""
    customDestinationLanguage = user?.customDestinationLanguage ?? ""
}
```

**Step 6: Remove old languages constant and languageName helper**

Delete the `languages` array (lines 41-46) and `languageName(for:)` function (lines 584-586) since they're replaced by `LanguageData`.

**Step 7: Build and verify**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 8: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ProfileView.swift
git commit -m "feat(ios): enhance ProfileView language section with full picker and implicit booleans"
```

---

### Task 4: iOS — Reorganize SettingsView (move interface language to Appearance)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/SettingsView.swift`

**Step 1: Remove the languageSection entirely**

Delete the `languageSection` computed property (lines 297-318) and remove `languageSection` from the `scrollContent` VStack (line 120).

**Step 2: Add interface language picker to appearanceSection**

After the theme row in `appearanceSection` (line 241), add:

```swift
// Inside appearanceSection, after the ForEach for theme buttons:

settingsRow(icon: "globe", title: "Langue de l'interface", color: "4ECDC4") {
    Picker("", selection: Binding(
        get: { prefs.application.interfaceLanguage },
        set: { val in prefs.updateApplication { $0.interfaceLanguage = val } }
    )) {
        ForEach(LanguageData.interfaceLanguages, id: \.code) { lang in
            HStack {
                Text(lang.flag)
                Text(lang.nativeName)
            }
            .tag(lang.code)
        }
    }
    .pickerStyle(.menu)
    .tint(Color(hex: "4ECDC4"))
}
```

**Step 3: Remove old preferredLanguage AppStorage**

Delete line 32: `@AppStorage("preferredLanguage") private var preferredLanguage = "fr"`
(Not used by anything meaningful since the real preference is in UserPreferencesManager.)

**Step 4: Build and verify**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/SettingsView.swift
git commit -m "feat(ios): move interface language to Appearance section, remove standalone Language section"
```

---

### Task 5: iOS — Send originalLanguage from keyboard detection in sendMessage

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:501-607`

**Step 1: Add keyboard language detection helper**

Add this private function near the MARK: - Send Message section (around line 498):

```swift
private func detectKeyboardLanguage() -> String {
    if let primaryLanguage = UITextInputMode.current?.primaryLanguage {
        let langCode = String(primaryLanguage.prefix(2))
        return langCode
    }
    return authManager.currentUser?.systemLanguage ?? "fr"
}
```

**Step 2: Update sendMessage to pass originalLanguage**

In the `sendMessage` function, change line 607 from:

```swift
originalLanguage: nil,
```

to:

```swift
originalLanguage: detectKeyboardLanguage(),
```

**Step 3: Build and verify**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift
git commit -m "fix(ios): send originalLanguage from keyboard detection instead of nil"
```

---

### Task 6: Gateway — Log warning when detectLanguage fallback is used

**Files:**
- Modify: `services/gateway/src/services/messaging/MessageValidator.ts:290-299`

**Step 1: Update detectLanguage to log a warning**

The function currently returns hardcoded 'fr'. Change it to:

```typescript
async detectLanguage(content: string): Promise<string> {
    // TODO: Implémenter détection via service de traduction (NLLB-200 ou FastText)
    console.warn('[MessageValidator] detectLanguage() fallback used — client should send originalLanguage');
    return 'fr';
}
```

Note: The real fix is that the iOS client now sends `originalLanguage`. The gateway `MessagingService.ts` line 85-86 already prioritizes client-provided `originalLanguage` over this fallback:
```typescript
const originalLanguage = enrichedRequest.originalLanguage ||
    await this.validator.detectLanguage(enrichedRequest.content);
```

So this is a safety net that now warns when hit.

**Step 2: Commit**

```bash
git add services/gateway/src/services/messaging/MessageValidator.ts
git commit -m "fix(gateway): add warning log when detectLanguage fallback is used"
```

---

### Task 7: Build, test end-to-end, final commit

**Step 1: Full iOS build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 2: Manual end-to-end verification checklist**

- [ ] Open Profile → Languages section shows picker with flags
- [ ] Langue principale pre-filled from device locale
- [ ] Picking a language shows flag + native name
- [ ] Save profile sends `translateToSystemLanguage: true`
- [ ] Settings → Apparence shows "Langue de l'interface" row
- [ ] Old "Langue" section in Settings is gone
- [ ] Sending a message sends `originalLanguage` from keyboard
- [ ] Receiving messages shows translations in user's configured language

**Step 3: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "feat(ios): language config redesign - content langs in profile, interface lang in appearance"
```
