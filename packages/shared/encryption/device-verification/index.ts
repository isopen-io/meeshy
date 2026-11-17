/**
 * La référence TypeScript de la CONFIRMATION D'UN APPAREIL PAR CODE COURT (#18906, #19154) :
 * descripteur, engagement, code et accusé, rendus, options en carré, validation à la
 * réception. WebCrypto seul. Spécification :
 * `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md` (§ 4).
 * Le registre de confiance (§ 6) n'est pas ici : son texte attend sa contre-relecture.
 */
export * from './descriptor.js';
export * from './sas.js';
export * from './emoji.js';
export * from './options.js';
export * from './messages.js';
export * from './sas-emoji-table.js';
