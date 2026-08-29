/**
 * Coquille de ré-export — #4277, critère 5.
 *
 * L'implémentation a déménagé vers `services/community-member-presence.ts`
 * (elle n'enregistre aucune route, elle n'avait rien à faire dans `routes/`).
 * Ce fichier ne fait que RÉEXPORTER pour que `routes/communities/search.ts`
 * — hors territoire de ce lot, son import déclaré dans
 * `edits_hors_territoire` — continue de résoudre `../community-member-presence`
 * sans interruption tant que son édit n'est pas appliqué. Cf. la leçon du
 * dépôt sur les scissions inachevées (§ « Un fichier X.ts à côté d'un
 * répertoire X/ » du CLAUDE.md du gateway) : une coquille de ré-export
 * n'est pas facultative, elle est ce qui empêche une scission de laisser un
 * importeur pointer dans le vide.
 *
 * SUPPRIMER ce fichier une fois `routes/communities/search.ts` repointé
 * directement sur `../services/community-member-presence`.
 */
export {
  resolveCommunityMemberPresence,
  type PreviewMemberProfile,
  type PreviewMemberRow,
  type PreviewCommunityRow,
} from '../services/community-member-presence';
