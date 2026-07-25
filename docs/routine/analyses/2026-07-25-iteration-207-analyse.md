# Iteration 207 — `freezeMessageStatus` : dernier site du suivi « qui a lu, dans quelle langue » qui contourne le SSOT `mergeViewedLanguages` → doublon logique de langue possible sur stock legacy dénormalisé

## Protocole (démarrage)
`main` @ `555d7c65` (dernier commit : android sharelink create-link). Branche
`claude/brave-archimedes-x50rhz` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Le plus gros du travail récent est iOS/Android
(hors surface). Le dernier feature testable est **media-views-enrichment**
(spec `2026-07-24`), dont fait partie `MessageReadStatusService` — cible
**Priorité 1** (feature récemment développée).

PRs ouvertes au démarrage — **audit anti-doublon** :
- **#2305** (iteration 206) : `isUserAnonymous` + suivi de lecture `ConversationView`.
  Surface `apps/web/utils/auth.ts` + `ConversationView.tsx`. **Aucun chevauchement**
  (cette itération est **gateway-only**, aucun fichier partagé). #2305 **cite
  explicitement** ce site en « Future Considerations » comme prochain candidat.
- **#2275** : iOS a11y VoiceOver. Hors surface TypeScript.

## Sélection : **Priorité 1 — SSOT + correctness (couche gateway read-tracking)**

Le Prisme linguistique des vues (« qui a lu, ET dans quelle langue ») s'appuie
sur un SSOT unique — `mergeViewedLanguages` (`services/gateway/src/utils/viewed-languages.ts`) —
qui **re-normalise l'existant** avant d'unir les langues consultées, précisément
pour que `fr-FR` et `fr` ne créent pas deux entrées pour la même version.

## Current state (avant correctif)

Quatre sites écrivent `viewedLanguages`. **Trois** passent par le SSOT :
- `MessageReadStatusService.ts:2035` (écoute audio),
- `:2126` (visionnage vidéo),
- `:2208` (vue générique média),

chacun via `mergeViewedLanguages(previous?.viewedLanguages, incoming)` puis
`set:` complet — l'existant est re-normalisé, aucun doublon possible.

Le **quatrième**, `freezeMessageStatus` (`:1122-1141`), fige la langue de lecture
des messages texte et **contourne le SSOT** au profit d'un `{ push: code }`
Prisma brut (pour préserver un `updateMany` groupé par langue). Sa garde de dédup
comparait la valeur **brute** stockée :

```ts
if (entry.viewedLanguages?.includes(code)) continue;              // ← brut
if ((entry.viewedLanguages?.length ?? 0) >= MAX_VIEWED_LANGUAGES) continue;
...
data: { viewedLanguages: { push: code } }
```

## Problems identified
1. **Doublon logique de langue** : une entrée héritée d'une version antérieure a
   pu stocker la locale complète (`viewedLanguages: ['fr-FR']`). Le lecteur revient
   dans la même version, résolue et normalisée en `fr`. `['fr-FR'].includes('fr')`
   → `false` → push `fr` → stockage `['fr-FR', 'fr']` : **deux entrées pour une
   seule version consultée**. Le `languageBreakdown` (qui re-normalise à la
   lecture) le compte alors une fois — mais le stock est corrompu et un futur
   consommateur lisant la valeur brute sur-compterait.
2. **Plafond faussé** : la garde `MAX_VIEWED_LANGUAGES` mesure la longueur brute,
   qui sur-compte les doublons dénormalisés — le plafond peut se déclencher trop
   tôt (langue réellement nouvelle rejetée à tort).
3. **Divergence SSOT** : un quatrième site du même invariant réimplémente à la
   main la dédup que `mergeViewedLanguages` fournit — dette de cohérence.

## Root causes
Optimisation `updateMany` groupé par langue → besoin d'un `{ push }` scalaire
plutôt que d'un `set` complet par entrée → la dédup a été réécrite localement
sur la valeur **brute**, perdant la re-normalisation que le SSOT garantit.

## Business impact
Faible mais réel : le Prisme des vues est une feature produit (l'auteur voit
« lu en français par 3, en anglais par 1 »). Un doublon dénormalisé fausse
silencieusement ce décompte pour tout consommateur brut, et le plafond peut
masquer une langue réellement consultée.

## Technical impact
Corruption de données de bas bruit + divergence d'un invariant SSOT sur une
feature récente. Contenu du fix : **1 ligne de garde remplacée** par un appel au
SSOT déjà importé.

## Risk assessment
Très faible. Le `{ push: code }` groupé reste inchangé (perf préservée) ; seule la
**décision** de pousser passe par la vue normalisée de l'existant. `code` est déjà
normalisé (`languageFor` → `normalizeLanguageCode`). Aucun schéma, aucune migration.

## Proposed improvements
Remplacer la garde brute par le SSOT :
```ts
const known = mergeViewedLanguages(entry.viewedLanguages, []); // re-normalise
if (known.includes(code)) continue;
if (known.length >= MAX_VIEWED_LANGUAGES) continue;
```
`mergeViewedLanguages` est **déjà importé** (`:30`) — zéro nouvelle dépendance.

## Expected benefits
- Plus aucun doublon logique de langue, quel que soit le stock legacy.
- Plafond mesuré sur la vue normalisée dédupliquée (sémantique correcte).
- Les **4** sites d'écriture `viewedLanguages` convergent sur le même SSOT.

## Implementation complexity
Triviale : 1 site, ~4 lignes, SSOT déjà en place et testé.

## Validation criteria
- RED prouvé : existant `['fr-FR']` + lecture `fr` → aujourd'hui push doublon,
  après fix → aucun push.
- Suite `MessageReadStatusService.test.ts` verte (dont les 5 tests langue
  existants inchangés : happy-path push, dédup exacte, groupage, exception).
- `tsc --noEmit` : 0 nouvelle erreur.

## Future improvements
- `freezeMessageStatus` conserve un `{ push }` brut concurrent-unsafe (deux gels
  simultanés du même lot peuvent doubler) : candidat `$addToSet` si Prisma
  l'expose un jour pour les listes scalaires Mongo.
- Read-path `getMessageStatusDetails` : plusieurs retours `viewedLanguages` bruts
  (`:1437`, `:1922`) pourraient normaliser via `toCodes` pour blinder l'API.
