import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MediaDownloadPreferences is now defined in MeeshySDK
// (packages/MeeshySDK/Sources/MeeshySDK/Networking/MediaDownloadPreferences.swift).
// The store that persists it lives in MeeshyUI
// (MediaDownloadPreferencesStore.shared) and handles migration from the
// previous 6-booleans format automatically on first load.

struct MediaDownloadSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }

    @ObservedObject private var store: MediaDownloadPreferencesStore
    /// #9684 — à la prise de vue : l'original (défaut : non) et la version avec effets et cadre.
    @AppStorage(CaptureSavePolicy.savesOriginalKey) private var captureSavesOriginal = CaptureSavePolicy.standard.savesOriginal
    @AppStorage(CaptureSavePolicy.renderedModeKey) private var captureRenderedMode = CaptureSavePolicy.standard.renderedMode
    /// #17269 — à l'ouverture du composer : la caméra armée et la photothèque à mi-hauteur.
    @AppStorage(ComposerOpeningPreferences.armsCameraKey) private var openingArmsCamera = ComposerOpeningPreferences.standard.armsCamera
    @AppStorage(ComposerOpeningPreferences.opensLibraryKey) private var openingOpensLibrary = ComposerOpeningPreferences.standard.opensLibrary
    /// #9885 — à l'envoi : le lieu des photos (retiré par défaut, #11247) et la compression.
    @AppStorage(OutgoingImageLocationSetting.key) private var keepsPhotoLocation = OutgoingImageLocationSetting.standard
    @ObservedObject private var preferences: UserPreferencesManager
    /// Le (i) ouvert : un seul à la fois sur l'écran.
    @State private var openNoteID: String?
    init(store: MediaDownloadPreferencesStore = .shared, preferences: UserPreferencesManager = .shared) {
        self.store = store
        self.preferences = preferences
    }

    private let accentColor = MeeshyColors.brandPrimaryHex
    private static let fieldIconSide: CGFloat = 28
    /// Le séparateur s'aligne sur le texte des lignes : leur marge, leur icône, puis l'espacement.
    private static let separatorInset = MeeshySpacing.mdPlus + fieldIconSide + MeeshySpacing.md

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            CollapsibleHeaderPage(
                title: String(localized: "settings.media.download.title", defaultValue: "Téléchargement auto", bundle: .main),
                onBack: { dismiss() },
                titleColor: theme.textPrimary,
                backArrowColor: Color(hex: accentColor),
                backgroundColor: theme.backgroundPrimary,
                content: { pageContent }
            )
        }
    }

    // MARK: - Content

    private var pageContent: some View {
        VStack(spacing: MeeshySpacing.xl) {
            autoSaveSection
            captureSaveSection
            composerOpeningSection
            outgoingSection
            policyPicker(
                title: String(localized: "settings.media.download.images", defaultValue: "Images", bundle: .main), icon: "photo.fill", color: MeeshyColors.brandPrimaryHex,
                binding: $store.preferences.image
            )
            policyPicker(
                title: String(localized: "settings.media.download.audio", defaultValue: "Audio", bundle: .main), icon: "waveform", color: MeeshyColors.indigo600Hex,
                binding: $store.preferences.audio
            )
            policyPicker(
                title: String(localized: "settings.media.download.audio_translation", defaultValue: "Traductions audio", bundle: .main), icon: "character.bubble.fill", color: MeeshyColors.indigo400Hex,
                binding: $store.preferences.audioTranslation
            )
            policyPicker(
                title: String(localized: "settings.media.download.video", defaultValue: "Vidéo", bundle: .main), icon: "play.rectangle.fill", color: MeeshyColors.indigo300Hex,
                binding: $store.preferences.video
            )
            Spacer().frame(height: 40)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.lg)
    }

    // MARK: - Enregistrement automatique (#8307)

    private var autoSaveSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "settings.media.autosave.header", defaultValue: "Galerie", bundle: .main),
                          icon: "photo.on.rectangle", color: accentColor)
            // #14640 — la préférence SERVEUR, la même que Réglages › Confidentialité. Coupée par défaut.
            captureToggle(isOn: Binding(get: { preferences.privacy.saveMediaToGallery },
                                        set: { enregistre in preferences.updatePrivacy { $0.saveMediaToGallery = enregistre } }),
                          icon: "square.and.arrow.down.on.square.fill", iconColor: accentColor,
                          title: String(localized: "settings.media.autosave.title", defaultValue: "Enregistrer dans Photos", bundle: .main),
                          note: SettingsInfoNotes.galleryAutosave)
            .background(SettingsSectionBackground(tint: accentColor))
        }
    }

    // MARK: - À la prise de vue (#9684)

    private var captureSaveSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "settings.media.capture.header", defaultValue: "À la prise de vue", bundle: .main),
                          icon: "camera.fill", color: MeeshyColors.indigo600Hex)
            VStack(spacing: 0) {
                captureToggle(isOn: $captureSavesOriginal, icon: "photo",
                              title: String(localized: "settings.media.capture.original.title",
                                            defaultValue: "Enregistrer l'original", bundle: .main),
                              note: SettingsInfoNotes.captureOriginal)
                Divider().padding(.leading, Self.separatorInset)
                captureToggle(isOn: Binding(get: { captureRenderedMode == .automatic },
                                            set: { captureRenderedMode = $0 ? .automatic : .manual }),
                              icon: "camera.filters",
                              title: String(localized: "settings.media.capture.rendered.title",
                                            defaultValue: "Version avec effets", bundle: .main),
                              note: SettingsInfoNotes.renderedCapture)
            }
            .background(SettingsSectionBackground(tint: MeeshyColors.indigo600Hex))
        }
    }

    // MARK: - À l'ouverture du composer (#17269)

    private var composerOpeningSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "settings.media.opening.header",
                                        defaultValue: "À l'ouverture du composer", bundle: .main),
                          icon: "square.and.pencil", color: MeeshyColors.indigo600Hex)
            VStack(spacing: 0) {
                captureToggle(isOn: $openingArmsCamera, icon: "camera.viewfinder",
                              title: String(localized: "settings.media.opening.camera.title",
                                            defaultValue: "Armer la caméra", bundle: .main),
                              note: SettingsInfoNotes.cameraArming)
                Divider().padding(.leading, Self.separatorInset)
                captureToggle(isOn: $openingOpensLibrary, icon: "photo.on.rectangle",
                              title: String(localized: "settings.media.opening.library.title",
                                            defaultValue: "Ouvrir la photothèque", bundle: .main),
                              note: SettingsInfoNotes.libraryOpening)
            }
            .background(SettingsSectionBackground(tint: MeeshyColors.indigo600Hex))
        }
    }

    // MARK: - À l'envoi (#9885)

    private var outgoingSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "settings.media.outgoing.header", defaultValue: "À l'envoi", bundle: .main),
                          icon: "paperplane.fill", color: MeeshyColors.indigo600Hex)
            VStack(spacing: 0) {
                captureToggle(isOn: Binding(get: { preferences.document.compressImagesOnUpload },
                                            set: { compresse in preferences.updateDocument { $0.compressImagesOnUpload = compresse } }),
                              icon: "arrow.down.right.and.arrow.up.left",
                              title: String(localized: "settings.media.outgoing.compress.title",
                                            defaultValue: "Compression forte", bundle: .main),
                              note: SettingsInfoNotes.compression)
                Divider().padding(.leading, Self.separatorInset)
                captureToggle(isOn: $keepsPhotoLocation, icon: "location",
                              title: String(localized: "settings.media.outgoing.location.title",
                                            defaultValue: "Conserver le lieu des photos", bundle: .main),
                              subtitle: String(localized: "settings.media.outgoing.location.subtitle",
                                               defaultValue: "Par défaut, la position GPS est retirée de chaque photo avant l'envoi.",
                                               bundle: .main))
            }
            .background(SettingsSectionBackground(tint: MeeshyColors.indigo600Hex))
        }
    }

    private func captureToggle(
        isOn: Binding<Bool>,
        icon: String,
        iconColor: String = MeeshyColors.indigo600Hex,
        title: String,
        subtitle: String? = nil,
        note: MeeshyInfoNote? = nil
    ) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            fieldIcon(icon, color: iconColor)
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                MeeshyInfoNoted(note: note, openNoteID: $openNoteID, tint: theme.textMuted) {
                    Text(title)
                        .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                }
                if let subtitle {
                    Text(subtitle)
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .regular))
                        .foregroundColor(theme.textMuted)
                        .lineSpacing(2)
                }
            }
            Spacer(minLength: MeeshySpacing.sm)
            Toggle("", isOn: isOn)
                .labelsHidden()
                .tint(Color(hex: accentColor))
                .accessibilityLabel(title)
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.vertical, MeeshySpacing.smPlus)
    }

    // MARK: - Policy picker section

    @ViewBuilder
    private func policyPicker(
        title: String,
        icon: String,
        color: String,
        binding: Binding<AutoDownloadPolicy>
    ) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: title, icon: icon, color: color)

            VStack(spacing: 0) {
                ForEach(Array(AutoDownloadPolicy.allCases.enumerated()), id: \.element) { index, policy in
                    Button {
                        HapticFeedback.light()
                        binding.wrappedValue = policy
                    } label: {
                        HStack(spacing: MeeshySpacing.md) {
                            fieldIcon(policyIcon(policy), color: color)
                            Text(policy.shortLabel)
                                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                                .foregroundColor(theme.textPrimary)
                            Spacer()
                            if binding.wrappedValue == policy {
                                Image(systemName: "checkmark")
                                    .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .bold))
                                    .foregroundColor(Color(hex: accentColor))
                            }
                        }
                        .padding(.horizontal, MeeshySpacing.mdPlus)
                        .padding(.vertical, MeeshySpacing.smPlus)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(title), \(policy.shortLabel)")
                    .accessibilityAddTraits(binding.wrappedValue == policy ? .isSelected : [])

                    if index != AutoDownloadPolicy.allCases.count - 1 {
                        Divider().padding(.leading, Self.separatorInset)
                    }
                }
            }
            .background(SettingsSectionBackground(tint: color))
        }
    }

    private func policyIcon(_ policy: AutoDownloadPolicy) -> String {
        switch policy {
        case .always:              return "infinity"
        case .wifiAndGoodCellular: return "antenna.radiowaves.left.and.right"
        case .wifiOnly:            return "wifi"
        case .never:               return "xmark.octagon"
        }
    }

    // MARK: - Helpers

    private func sectionHeader(title: String, icon: String, color: String) -> some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                .foregroundColor(Color(hex: color))
                .accessibilityHidden(true)
            Text(title.uppercased())
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))
                .tracking(1.2)
        }
        .padding(.leading, MeeshySpacing.xs)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
        .accessibilityAddTraits(.isHeader)
    }

    private func fieldIcon(_ name: String, color: String) -> some View {
        Image(systemName: name)
            .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .medium))
            .foregroundColor(Color(hex: color))
            .frame(width: Self.fieldIconSide, height: Self.fieldIconSide)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.xs)
                    .fill(Color(hex: color).opacity(0.12))
            )
    }
}
