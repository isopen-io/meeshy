import Foundation

// MARK: - Ce que les adresses GÉNÉRÉES de l'annuaire E2EE déclarent (#3707)
//
// Écrit à la main à côté de `E2EeEndpoint.swift`, qui est généré : une
// redéfinition posée chez lui serait perdue à la prochaine régénération.
//
// Les huit routes `/e2ee/*` documentent leurs codes (`E2EE_ERROR_CODES`) et
// l'appareil doit les LIRE : un enrôlement refusé parce que le compte a déjà
// seize appareils (`E2EE_DEVICE_LIMIT_REACHED`) propose d'en retirer un, une
// identité révoquée (`E2EE_IDENTITY_REVOKED`) se régénère. Sans cette
// déclaration, le transport ne rendrait qu'une phrase.
public extension E2EeEndpoint {
    var rejectionPolicy: MeeshyEndpointRejectionPolicy { .structured }
}
