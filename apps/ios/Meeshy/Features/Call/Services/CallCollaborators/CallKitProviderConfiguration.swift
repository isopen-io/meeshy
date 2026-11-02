import UIKit
@preconcurrency import CallKit
import MeeshySDK
import os

enum CallKitProviderConfiguration {
    /// What CallKit is told about Meeshy calls: video, groups, handle type,
    /// Recents, brand icon and ringtone.
    static func make() -> CXProviderConfiguration {
        let config = CXProviderConfiguration()
        config.supportsVideo = true
        config.maximumCallsPerCallGroup = 1
        // Restauré à 2 (rollback audit P2-iOS-5 qui l'avait baissé à 1) :
        // entre commits 4dbb387e (état fonctionnel) et HEAD, lowering this
        // value à 1 a coïncidé avec la régression "CallKit teardown autonome
        // à ~3s sur appels sortants". Le couple maximumCallGroups=1 +
        // supportsHolding=false était valide en théorie mais a confondu
        // l'iOS runtime au point de tuer l'appel avant que
        // provider:didActivate:audioSession ne se déclenche. 2 est la valeur
        // par défaut (sans config) et celle utilisée par FaceTime/WhatsApp.
        config.maximumCallGroups = 2
        config.supportedHandleTypes = [.generic]
        config.includesCallsInRecents = true
        // Custom CallKit icon: a 40x40 pt template PNG named "CallKitIcon".
        // `iconTemplateImageData` is a TEMPLATE — iOS discards the colour
        // channels and reads the alpha channel only, so the asset carries an
        // opaque glyph on a fully transparent background. An opaque PNG would
        // render as a filled rectangle.
        //
        // Never silence a miss here: this branch was guarded by a bare `if let`
        // against an asset that had never existed, so the call card shipped
        // without brand identity from the very first build and nothing said so.
        if let icon = UIImage(named: "CallKitIcon"), let data = icon.pngData() {
            config.iconTemplateImageData = data
        } else {
            Logger.calls.error("[CALLKIT] CallKitIcon asset missing — call UI ships without brand identity")
            assertionFailure("CallKitIcon asset missing from Assets.xcassets")
        }
        // Phase 1.5 fix — explicit ringtone for incoming calls.
        // CallKit's default `ringtoneSound = nil` falls back to system ringtone,
        // but iOS 17+ has been reporting unreliable behavior (UI shows but no
        // audio) on real devices. Apple's SOTA pattern (FaceTime, WhatsApp) is
        // to bundle a custom .caf and set it explicitly. The file must be in
        // the main app bundle, ≤30s, CAF format.
        // Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.3
        config.ringtoneSound = "Ringtone.caf"
        return config
    }
}

private extension Logger {
    nonisolated static let calls = MeeshyLog.logger(.calls)
}
