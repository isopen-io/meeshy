/**
 * LE SIGNAL DE DÉCONNEXION (#5095) — le CONTRAT entre le navigateur
 * (`lib/realtime/deconnexion.ts`, qui poste ce message à chaque registration
 * active) et le travailleur de zone (`lib/sw/travailleur.js`, du JS PLAT sans
 * import : il porte le LITTÉRAL). Le lien entre les deux n'est pas un grep,
 * c'est l'EXÉCUTION — `__tests__/sw-zone.test.ts` importe cette constante et
 * dispatche avec elle : si les deux chaînes divergent, le témoin rougit.
 */
export const SIGNAL_DE_DECONNEXION = 'meeshy-v3:deconnexion';
