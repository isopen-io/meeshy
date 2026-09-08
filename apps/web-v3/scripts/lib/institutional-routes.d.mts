/**
 * Les types du module voisin — qui reste du JavaScript, et pas par négligence :
 * ses trois consommateurs tournent sur trois runtimes différents (Vite pour la
 * configuration, bun pour le préchauffage, node pour le témoin), et seul le
 * premier sait lire du TypeScript. Un `.d.mts` posé à côté, comme le fait déjà
 * `budget-reseau.d.mts` de l'autre application, donne le typage sans imposer
 * une étape de compilation à un fichier de six déclarations.
 */
export declare const INSTITUTIONAL_ROUTES: readonly string[];
export declare const INSTITUTIONAL_PATHS: readonly string[];
export declare const INSTITUTIONAL_PATTERN: RegExp;
