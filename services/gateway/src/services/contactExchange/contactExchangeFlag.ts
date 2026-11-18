/**
 * LE DRAPEAU DU PARTAGE SANS CONTACT (#19205) — le SEUL site qui lit `CONTACT_EXCHANGE_ENABLED`.
 * Éteint par défaut : le lot touche à l'identité, aux demandes d'ami et à l'énumération de
 * comptes, et attend la revue `auditeur-adversarial` avant d'être allumé. Éteint, les deux
 * routes répondent comme des routes qui n'existent pas.
 */
export const contactExchangeEnabled = (): boolean => process.env.CONTACT_EXCHANGE_ENABLED === 'true';
