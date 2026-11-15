/**
 * L'ENTRÉE DE CONSTRUCTION du pont libsignal (#17114, `vite.config.ts` ›
 * `rollupOptions.input`). Tant qu'aucun écran n'appelle `loadLibsignalBridge()`,
 * le pont n'est atteint par aucun module de l'application, donc ni construit,
 * ni mesuré, ni borné. Cette entrée le fait construire comme un chunk À LA
 * DEMANDE (avec son WASM), exactement celui que produira l'import() du chargeur.
 * Aucun document ne la référence : elle n'est jamais exécutée par un lecteur.
 * Elle se retire quand le premier écran branche le chargeur.
 */
void import('./libsignal-bridge');
