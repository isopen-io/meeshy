/**
 * L'origine de la passerelle de PRODUCTION — celle qu'un build sans
 * `VITE_API_BASE` vise, donc l'image construite sur `main` que meeshy.me sert
 * depuis la décommission du legacy (#6702). `docker.yml` ne pose
 * `VITE_API_BASE` que sur `dev` (`gate.staging.meeshy.me`). Elle servait aussi
 * `legacy-link.ts` (#6354), supprimé avec les derniers renvois vers le legacy
 * (#6335).
 */
export const PRODUCTION_ORIGIN = 'https://gate.meeshy.me';
