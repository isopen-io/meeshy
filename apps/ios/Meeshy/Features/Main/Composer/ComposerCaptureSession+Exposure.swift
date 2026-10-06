import Foundation

// MARK: - La luminosité du viseur (#9351)

extension ComposerCaptureSession {

    /// **Le curseur règle la luminosité visée**, bornée à ±2 EV par la loi (et
    /// par l'objectif à ce qu'il sert). Une valeur inchangée ne réveille pas
    /// l'objectif : le doigt qui tient le curseur immobile ne le reverrouille pas.
    func setExposureBias(_ bias: Float) {
        let borne = ComposerExposureRule.clamped(bias)
        guard borne != exposureBias else { return }
        exposureBias = borne
        controls.setExposureBias(borne)
    }

    /// Un pas VoiceOver, d'un tiers d'EV.
    func stepExposure(up: Bool) {
        setExposureBias(ComposerExposureRule.stepped(exposureBias, up: up))
    }

    /// **Neutre au retournement et à la réouverture** : la luminosité réglée
    /// pour une scène ne suit ni sur l'autre objectif ni au viseur suivant.
    func resetExposure() {
        exposureBias = ComposerExposureRule.neutral
        controls.setExposureBias(ComposerExposureRule.neutral)
    }
}
