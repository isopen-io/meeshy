# Iteration 235 — Le type de page du cache infini portait deux champs d'enveloppe delta morts (dette de type, 2 erreurs `tsc`)

## Protocole (démarrage)
`main` @ `e5072025` (dernier commit : `docs(tasks): (beta) suivi de l'avis d'arrivee modernise`).
Branche `claude/brave-archimedes-53aac8` alignée sur `origin/main` (0 avance / 0 retard) au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité : `bun install --ignore-scripts`, puis
`npx prisma generate --generator client` + `bun run build` dans `packages/shared`. Suite web
`infinite-cache` + suites appelantes vertes au départ.

**Audit anti-doublon** (15 PRs ouvertes au départ) : les PRs jcnm en vol portent les itérations
222→234 (séquences `$`, focal quote, ZMQ audio dedup, parité langue TS↔Swift, pickers iOS,
transcription `endMs ≥ startMs`, activity-heat Android). **Aucune PR ouverte ne touche
`apps/web/lib/conversations/infinite-cache.ts` ni `services/conversations/types.ts`** — zéro
chevauchement de fichier. Le correctif de contrat `InfiniteData` (PR #3231, iteration 233) est
DÉJÀ mergé sur `main` ; cette itération éteint la dette de type qu'il avait explicitement laissée
en « améliorations futures ».

## Sélection : **Priorité 1 — code récent, dette de type explicitement consignée par l'itération précédente**

Le plan d'iteration 233 (`docs/routine/plans/2026-08-20-iteration-233-plan.md`, section « Améliorations
futures ») note :

> **Dette de type pré-existante** : les pages construites par `rebuildInfiniteConversationPages`
> (et par le test) n'ont pas `deletedConversationIds` / `deletedConversationIdsTruncated`, requis par
> `GetConversationsResponse`. Le type de page du cache mériterait d'être un sous-type
> (`Pick`/`Omit`) plutôt que `GetConversationsResponse` complet, ces champs étant purement
> delta-réseau. Candidat propre pour une itération dédiée.

C'est exactement le point d'écriture STRUCTURÉ unique du cache `queryKeys.conversations.infinite()`
(la sidebar), la « feature récemment développée » que la stratégie priorise, et une dette qui se
matérialise en **erreurs `tsc` réelles** — donc mesurable, pas cosmétique.

## Current state (avant correctif)

`InfiniteConversationData['pages']` était typé `GetConversationsResponse[]`. Or
`GetConversationsResponse` (`apps/web/services/conversations/types.ts`) exige **deux champs non
optionnels** :

```ts
deletedConversationIds: string[];         // toujours défini, vide hors mode delta
deletedConversationIdsTruncated: boolean; // plafond serveur débordé → relecture complète
```

Ces champs sont des **métadonnées d'enveloppe du batch delta**, pas du contenu de page :
- Le `queryFn` de la liste pagine par OFFSET (`useInfiniteConversationsQuery`, `updatedSince`
  absent) — le serveur les rend TOUJOURS vides sur ce chemin.
- Le catch-up delta (`use-conversations-delta-sync.ts:283-296`) les lit sur la RÉPONSE de fetch et
  les consomme à la volée (`mergeDeltaIntoCache`) — jamais stockés dans une page.
- Aucun lecteur ne lit ces champs sur une page STOCKÉE (`grep deletedConversationIds` : seuls la
  réponse de fetch, `crud.service.ts` et `delta-sync.ts` les touchent).

`rebuildInfiniteConversationPages` construit ses pages avec `{ conversations, pagination }`
uniquement (les deux seuls champs qu'une page du cache porte réellement), ce qui viole le type
`GetConversationsResponse[]` — d'où **2 erreurs `tsc` TS2345** (lignes 49 et 72, aux deux `push`).

## Problems identified

1. **Dette de type matérialisée en 2 erreurs `tsc` TS2345.** Le type de page (`GetConversationsResponse`)
   surdéclare deux champs qu'aucune page stockée ne porte, forçant soit une erreur (état actuel),
   soit la fabrication de deux champs morts (`deletedConversationIds: []`) à chaque `push` — du bruit
   qui se lit comme une source de vérité.
2. **Le test recopiait la même dette.** `infinite-cache.test.ts` fabriquait un
   `GetConversationsResponse` complet (delta fields inclus) pour construire ses pages — un contrat
   d'enveloppe recopié dans un contexte où il ne s'applique pas.

## Root causes
- Lors de l'extraction de `infinite-cache.ts` depuis `use-socket-cache-sync.ts`, le type de page a
  été pris comme le type de RETOUR du `queryFn` (`GetConversationsResponse`), sans distinguer
  « ce que le fetch renvoie » de « ce qu'une page du cache porte durablement ». Les deux divergent
  précisément sur les métadonnées d'enveloppe delta.

## Business impact
- Nul en runtime (les champs sont vides/absents sur ce chemin). L'impact est de **fiabilité de
  build** : 2 erreurs `tsc` sur le point d'écriture le plus chaud du cache (sidebar) — une dette qui
  masque de VRAIES erreurs futures dans le même fichier au milieu du bruit.

## Technical impact
- `apps/web` passe de **1267 → 1265** erreurs `tsc` (config incluant les tests). Le type de page
  décrit désormais la réalité : `Omit<GetConversationsResponse, 'deletedConversationIds' |
  'deletedConversationIdsTruncated'>`. `rebuildInfiniteConversationPages` n'a plus à fabriquer de
  champs morts, et les deux `push` valident sans erreur.

## Risk assessment
- **Négligeable.** Changement PUREMENT au niveau type + simplification du test. Aucun champ n'était
  lu sur une page stockée (vérifié par grep), aucun comportement runtime ne change. Les deux
  appelants (`use-socket-cache-sync.ts`, `use-conversations-delta-sync.ts`) passent par l'alias
  `InfiniteConversationData` explicitement annoté — découplés du type inféré de React Query — donc
  le narrowing est self-consistent. `Omit<…>` reste un SUPERTYPE structurel de
  `GetConversationsResponse` : une réponse complète stockée au fetch reste assignable à la page.

## Proposed improvements
Introduire un type de page dédié qui dit la vérité :

```ts
export type InfiniteConversationPage = Omit<
  GetConversationsResponse,
  'deletedConversationIds' | 'deletedConversationIdsTruncated'
>;
export type InfiniteConversationData = {
  pages: InfiniteConversationPage[];
  pageParams: number[];
};
```

Et aligner le test : `page()` construit désormais une `InfiniteConversationPage` (conversations +
pagination), + un test qui verrouille que les pages reconstruites ne portent QUE ces deux clés.

## Expected benefits
- 2 erreurs `tsc` éteintes ; le type de page décrit la réalité du cache ; plus de champs morts à
  fabriquer ; le test exprime le bon contrat. Robuste aux consommateurs futurs de la structure.

## Implementation complexity
- **Faible.** 1 fichier source (`infinite-cache.ts`, +type, -type élargi), 1 fichier de test
  (factory simplifiée + 1 test de garde).

## Validation criteria
- [x] RED : 2 erreurs `tsc` TS2345 reproduites (lignes 49, 72) avant correctif.
- [x] GREEN : 0 erreur dans `infinite-cache.ts` ; total web 1267 → **1265** (exactement -2).
- [x] Suite `infinite-cache.test.ts` : **4/4 verts** (3 existants + 1 garde d'enveloppe).
- [x] Non-régression appelants : `use-conversations-query` (+dedupe), `use-conversations-pagination-rq`,
      `use-socket-cache-sync` (×2), `use-conversations-delta-sync` = **191 tests verts**.
- [ ] CI verte sur la PR (gate lint/bun réel).

## Notes environnement
- `npx eslint` échoue globalement dans ce conteneur (ESLint 10 + `eslint-plugin-react` 7.37) —
  incompatibilité d'outillage pré-existante, sans rapport avec ce changement. Gate lint réel = CI.
- `tsc --noEmit` à la racine web remonte 1265 erreurs pré-existantes (config incluant les tests) —
  le build réel (`next build`) et les suites jest ne s'en trouvent pas bloqués. Ce correctif en
  RETIRE 2, n'en ajoute aucune.
