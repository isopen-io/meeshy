/**
 * Routes Communautes - proxy de retrocompatibilite
 *
 * @deprecated L'implementation vit dans `src/routes/communities/`.
 *
 * Ce fichier ne doit JAMAIS reprendre d'implementation. La resolution
 * CommonJS de `'./routes/communities'` — le specificateur qu'utilise
 * `route-registration.ts` — essaie le FICHIER avant le dossier : tant que
 * `communities.ts` portait des routes, il gagnait, et le dossier entier ne
 * servait personne. Trois cycles de correctifs y ont atterri sans jamais
 * atteindre la production (cf. `tasks/realtime-sync-audit-2026-08-22-cycle86.md`).
 *
 * `attachments.ts`, `users.ts` et `voice.ts` sont les trois autres scissions du
 * meme lot : toutes se sont terminees par ce proxy. Celle-ci ne l'avait pas eu.
 */

export { communityRoutes } from './communities/index';
