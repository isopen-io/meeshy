/**
 * `EPHEMERAL_POST_TTL_HOURS.{STORY,STATUS}` — RECOPIÉES, et il faut dire
 * pourquoi c'est accepté ici alors que le § 3.2 interdit les secondes tables.
 *
 * Les constantes vivent dans
 * `services/gateway/src/services/posts/ephemeralPosts.ts` et ne sont PAS
 * exportées par `@meeshy/shared` (vérifié : aucune occurrence). La v3 n'a pas
 * le droit d'importer depuis le gateway — c'est la contrainte de séparation
 * de ce chantier. Il reste donc deux formes possibles : une valeur citée avec
 * sa source, ou une phrase vague (« quelques heures ») qui n'apprend rien. La
 * première est choisie, et son coût est nommé : le jour où le gateway change
 * ce nombre, CES lignes doivent changer aussi. Le remède durable est de
 * remonter la constante dans `@meeshy/shared` — hors du territoire de ce lot,
 * qui ne touche pas au serveur.
 *
 * SEULES DES CONSTANTES SCALAIRES VIVENT ICI (#5479) — ni copie d'écran, ni
 * dépendance d'aucune sorte. `lib/contenu/story.ts` (donc `lib/realtime/feed.ts`
 * en transitif, via `lib/contenu/partage.ts`) n'a besoin que de
 * `HEURES_DE_VIE_D_UNE_STORY` ; les faire vivre dans `story-neuve.ts` — qui
 * porte aussi la copie entière de l'écran de CRÉATION (`STORY_NEUVE`,
 * `mediaAide`, `mediaImporter`, …) — forçait esbuild à embarquer cette copie
 * dans le bundle de `/feed` pour l'usage d'un seul entier. `story-neuve.ts`
 * réexporte ces constantes pour ses propres consommateurs ; tout module qui
 * n'a besoin QUE de la durée de vie importe d'ICI, jamais de `story-neuve.ts`.
 */
export const HEURES_DE_VIE_D_UNE_STORY = 20;

/** `EPHEMERAL_POST_TTL_HOURS.STATUS` — même source, même réserve. */
export const HEURES_DE_VIE_D_UNE_HUMEUR = 1;
