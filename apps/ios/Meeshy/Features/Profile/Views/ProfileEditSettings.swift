import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce que l'édition de ma vitrine règle en plus de mon identité (planche `Moi-Edition`, #19512) : ma voix publique et la
/// traduction automatique. Des BROUILLONS : ils partent avec « Enregistrer », dans le même PATCH, appliqués d'abord.
nonisolated struct ProfileEditSettings: Equatable, Sendable {
    var voicePublic: Bool
    /// `nil` quand la passerelle ne sert pas `autoTranslateEnabled` : l'interrupteur ne paraît pas.
    var autoTranslate: Bool?

    static func make(user: MeeshyUser?) -> ProfileEditSettings {
        ProfileEditSettings(voicePublic: user?.voicePublic == true, autoTranslate: user?.autoTranslateEnabled)
    }

    /// Ce qui part pour ma voix : `nil` quand rien n'a bougé (omis du PATCH). Une voix jamais servie compte comme privée.
    func voicePublicToSend(original: MeeshyUser) -> Bool? {
        voicePublic == (original.voicePublic == true) ? nil : voicePublic
    }

    /// Ce qui part pour la traduction automatique : `nil` sans interrupteur ou sans changement.
    func autoTranslateToSend(original: MeeshyUser) -> Bool? {
        guard let autoTranslate, autoTranslate != original.autoTranslateEnabled else { return nil }
        return autoTranslate
    }
}

/// Les mots des réglages de l'édition.
nonisolated enum ProfileEditSettingsCopy {

    static var autoTranslate: String {
        String(localized: "profile.edit.autoTranslate", defaultValue: "Traduire automatiquement", bundle: .main)
    }

    static var autoTranslateHint: String {
        String(localized: "profile.edit.autoTranslate.hint", defaultValue: "Tu lis tout dans ta langue principale.",
               bundle: .main)
    }
}

/// La dernière réponse connue de « ai-je des clés de chiffrement ? », par compte (#19512) : ma vitrine la montre dès
/// l'ouverture, puis la passerelle la confirme. Une réponse sans résumé n'efface pas ce qu'on savait.
struct ProfileOwnEncryptionMemory {
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    private static func key(_ userId: String) -> String {
        "profile.ownEncryption.\(userId)"
    }

    func remembered(userId: String) -> Bool? {
        defaults.object(forKey: Self.key(userId)) as? Bool
    }

    func remember(_ hasSignalKeys: Bool?, userId: String) {
        guard let hasSignalKeys else { return }
        defaults.set(hasSignalKeys, forKey: Self.key(userId))
    }
}

/// « Hors ligne — tes changements partiront au retour du réseau » au pied de l'édition (planche `Moi-Edition`) : la
/// note du kit (K46) suit le réseau en direct. Elle seule se redessine quand il change, pas la fiche.
struct ProfileEditOfflineBand: View {
    let isEditing: Bool

    @State private var isOffline = NetworkMonitor.shared.isOffline

    static func isShown(isEditing: Bool, isOffline: Bool) -> Bool {
        isEditing && isOffline
    }

    static var emphasis: String {
        String(localized: "profile.edit.offline.emphasis", defaultValue: "Hors ligne", bundle: .main)
    }

    static var text: String {
        String(localized: "profile.edit.offline",
               defaultValue: "Hors ligne — tes changements partiront au retour du réseau", bundle: .main)
    }

    var body: some View {
        VStack {
            Spacer()
            if Self.isShown(isEditing: isEditing, isOffline: isOffline) {
                MeeshyNote(Self.text, emphasis: Self.emphasis, form: .band, kind: .warn,
                           lead: .systemImage("icloud.slash"))
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: CGFloat(MeeshyNoteRecipe.bandRadius),
                                                                    style: .continuous))
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.bottom, MeeshySpacing.lg)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .accessibilityIdentifier("profile.edit.offline")
            }
        }
        .meeshyMotion(.rise, value: isOffline)
        .onReceive(NetworkMonitor.shared.isOfflinePublisher.receive(on: DispatchQueue.main)) { isOffline = $0 }
    }
}
