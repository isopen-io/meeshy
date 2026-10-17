/**
 * **LES ANCIENNES ADRESSES DE MEESHY MÈNENT À LEUR ÉCRAN** (#10881) — le
 * miroir des redirections 308 de `nginx.conf`.
 */
export const LEGACY_PATH_ALIASES: readonly (readonly [pattern: string, target: string])[] = [];

export const canonicalAppPath = (pathname: string): string => pathname;
