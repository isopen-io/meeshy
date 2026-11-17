/**
 * La référence TypeScript de la CONFIRMATION D'UN APPAREIL PAR CODE COURT (#18906, #19154) :
 * descripteur, engagement, code et accusé, rendus, options en carré, validation à la
 * réception. WebCrypto seul. Spécification :
 * `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md` (§ 4).
 *
 * Et l'ÉVALUATION du registre de confiance de mes appareils (§ 6.1-6.2, #19182) : octets
 * signés, forme, JSON strict, réception en six temps, état effectif. La vérification XEdDSA
 * est INJECTÉE (libsignal dans Node, le pont WASM dans le navigateur). L'émission, « confirmé »,
 * « peut admettre » et la transaction (§ 4.6, § 6.4) sont en revue (#19183) : rien ici.
 */
export * from './descriptor.js';
export * from './sas.js';
export * from './emoji.js';
export * from './options.js';
export * from './messages.js';
export * from './sas-emoji-table.js';
export * from './ledger-json.js';
export * from './ledger-signature.js';
export * from './ledger-entry.js';
export * from './ledger-state.js';
export * from './ledger.js';
