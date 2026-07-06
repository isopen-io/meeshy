# Iteration 114 — Analyse (2026-07-06)

## Contexte / priorité
Suite de **F84c** (reporté par l'itération 113). L'analyse d'origine de F84c décrivait la dérive du
`reactionSummary` des posts/commentaires et proposait de propager le durcissement `groupBy`
« déjà appliqué aux réactions de message ». **La réalité de `main` est l'inverse** : les services
`PostReactionService` et `CommentReactionService` ont depuis été durcis (transaction + recompte
autoritaire du compteur dénormalisé), tandis que le service **des réactions de message**
(`ReactionService`) est resté le **maillon non durci**. Priorité 1/3 : homogénéiser les trois
services de réaction sur le même contrat de cohérence.

## État actuel
Trois services de réaction quasi identiques :
- `PostReactionService.updatePostReactionSummary` (l.312-348) : **`$transaction`** + compteur
  **autoritaire** `reactionCount = tx.postReaction.count(...)` (+ `likeCount` synchronisé). Race
  d'insert concurrent gérée par `try/catch` **P2002** idempotent dans `addReaction` (l.127-148).
- `CommentReactionService.updateCommentReactionSummary` (l.371-401) : idem (transaction + recompte
  autoritaire + P2002 idempotent).
- `ReactionService.updateMessageReactionSummary` (l.330-370) : **pur read-modify-write hors
  transaction**, `reactionCount` **incrémental jamais re-dérivé** ; `addReaction` (l.106-116) **sans
  gestion P2002**.

Le modèle `Reaction` porte pourtant la même contrainte
`@@unique([messageId, participantId, emoji])` (schema.prisma:1111) que `PostReaction` /
`CommentReaction`.

## Problèmes identifiés
1. **Dérive permanente du compteur / résumé de réactions de message.** `reactionSummary` (map
   emoji→count JSON) ET `reactionCount` sont maintenus par read-modify-write non atomique. Deux
   `add`/`remove` concurrents sur le même message lisent la même map, la modifient chacun en mémoire,
   et le dernier `update` écrase l'autre → **lost update**. Le compteur n'étant jamais recomputé
   depuis la table `Reaction`, la dérive est **définitive** (aucune auto-réparation).
2. **`addReaction` non idempotent sous course.** Deux ajouts concurrents du même emoji par le même
   participant passent tous deux le pré-check `findFirst` (null), tentent `create`, l'un lève **P2002**
   (contrainte unique) qui **remonte en erreur** à l'appelant au lieu d'être traité comme un succès
   idempotent — divergent des chemins post/commentaire.
3. **Incohérence inter-surfaces.** Trois services au comportement de cohérence différent pour la même
   primitive « réaction emoji dénormalisée », alors que le produit vise l'homogénéité.

## Root cause
Le durcissement transaction + recompte autoritaire (appliqué aux posts puis commentaires lors de
l'unification `likeCount`) n'a jamais été rétro-porté au service des réactions de message, qui n'a pas
de `likeCount` et n'a donc pas été touché par ce chantier.

## Business impact
- Compteur de réactions d'un message (badge « ❤️ 3 ») affiché faux et figé après une course, sur le
  chemin le plus chaud du messaging temps réel. Le résumé emoji devient incohérent avec le nombre réel
  de lignes `Reaction`.

## Technical impact
- `sum(reactionSummary)` peut diverger de `count(Reaction)` et de `reactionCount`, sans jamais se
  réparer. Fiabilité des agrégats sapée ; parité de comportement rompue avec post/commentaire.

## Risk assessment
Faible. On aligne exactement sur un patron **déjà en production et testé** (post/commentaire). Aucun
changement de signature publique, de forme de réponse, ni de schéma. `reactionCount` re-dérivé depuis
la table est la **source de vérité** — strictement plus correct que l'incrément. Le seul risque est le
coût d'un `count()` supplémentaire par mutation, négligeable (index `@@index([messageId])` présent) et
déjà accepté pour post/commentaire.

## Proposed improvements
1. `updateMessageReactionSummary` → envelopper dans `this.prisma.$transaction`, re-dériver
   `reactionCount = tx.reaction.count({ where: { messageId } })` (compteur autoritaire, auto-réparant),
   miroir exact de `updatePostReactionSummary`.
2. `addReaction` → `try/catch` P2002 idempotent autour de `create` + `updateMessageReactionSummary`,
   miroir exact du chemin post/commentaire.

## Expected benefits
- `reactionCount` de message ne dérive plus jamais et s'auto-répare à chaque mutation.
- `addReaction` idempotent sous concurrence (plus d'erreur P2002 remontée).
- Les trois services de réaction convergent vers un contrat de cohérence unique.

## Implementation complexity
Faible (2 méthodes d'un fichier de 422 lignes ; patron copié depuis un service voisin déjà validé).

## Validation criteria
- RED→GREEN : `addReaction`/`removeReaction` appellent `$transaction` ; `reactionCount` écrit provient
  de `reaction.count()` (autoritaire) et non de l'incrément ; `addReaction` renvoie la ligne existante
  sans lever quand `create` lève P2002.
- Suites `ReactionService.test.ts` (+ voisines réactions) vertes.
- CI verte.

## Améliorations futures (reportées)
- **F84b** — `locationCount` incrémental des stats de conversation (nécessite de faire remonter
  `messageType` au handler) — inchangé.
</content>
</invoke>
