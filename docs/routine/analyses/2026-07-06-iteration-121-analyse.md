# Iteration 121 — Analyse d'optimisation (2026-07-06)

## Protocole (démarrage)
`main` @ `45ced6258`, working tree propre. Branche `claude/brave-archimedes-fru31a` recréée depuis
`origin/main`. Numérotation : docs `main` jusqu'à **118** (itérations/F-numbers réutilisés par plusieurs
sessions parallèles) → ce cycle prend **119**.

### Constat de démarrage : régression d'un correctif déjà mergé (F84)
En reprenant le backlog (après merge de F85 — PR #1570), la revue de l'état de `main` a détecté que
**le correctif F84 (pagination anonyme, PR #1557, déjà mergé)** avait été **annulé** sur `main`.

- Correctif F84 : commit `6fc44fa35` (présent dans l'historique de `main`).
- Commit fautif : `06687928a` « feat: improve iOS quality, accessibility and fix CI flakiness »
  (`google-labs-jules[bot]`), dont le message ne concerne **que iOS/Swift/A11Y**. Son diff sur
  `apps/web/hooks/queries/use-conversation-messages-rq.ts` **remet `getNextPageParam` dans sa version
  pré-F84** (retour à `(lastPage) =>`, sans le 2ᵉ argument `allPages` ni la branche `if (linkId)`), et le
  test de régression associé a lui aussi disparu.
- Cause : merge sur une base périmée de ce fichier → **écrasement collatéral non intentionnel** du
  correctif web par une PR iOS.

## Cible : F84 (ré-application) — restaurer la pagination « load more » anonyme

### Current state (régressé sur `main`)
```ts
getNextPageParam: (lastPage) => {
  if (!lastPage.hasMore) return undefined;
  if (lastPage.nextCursor) return lastPage.nextCursor;   // jamais défini en anonyme
  const lastMessage = lastPage.messages[lastPage.messages.length - 1];
  if (lastMessage?.id) return lastMessage.id;            // ← string → collapse page 1 en anonyme
  return undefined;
},
```
Le bug F84 est **de retour** : pour tout participant anonyme (lien partagé), « load more » renvoie l'ID
du dernier message (string) → `fetchMessagesFromService` (branche anonyme) le retransforme en page 1
(`offset 0`) → re-charge la page 1 en boucle → doublons (flatMap sans dédup) + historique ancien
inaccessible.

### Problems / Root cause / Business impact
Identiques à l'itération 114 (voir `2026-07-06-iteration-114-analyse.md`) : une seule voie `pageParam`
sert deux stratégies (cursor authentifié / offset anonyme) ; le fallback `lastMessage.id` (string) n'est
valide qu'en cursor. Surface impactée : **chat par lien partagé** (invités anonymes). Ici la cause
immédiate est un **écrasement de merge**, pas un nouveau défaut logique.

### Proposed improvements (implémenté ce cycle)
Ré-application **verbatim** du correctif mergé F84 (contenu exact de `6fc44fa35` sur les deux fichiers) :
- `getNextPageParam: (lastPage, allPages) => { … if (linkId) return allPages.length + 1; … }` + commentaire.
- Ré-ajout du test « anonymous loadMore advances the offset » (1ᵉʳ appel `(20,0)`, 2ᵉ appel `(20,20)`,
  3 messages distincts sans doublon).

### Risk assessment
Très faible. Restauration verbatim d'un correctif déjà revu et mergé ; chemin authentifié inchangé.

### Validation criteria
- [x] `use-conversation-messages-rq.test.tsx` **19/19** (18 existants + 1 restauré).
- [x] Diff = exactement le contenu de `6fc44fa35` sur `use-conversation-messages-rq.ts` + le test.

### Leçon (à retenir)
Un correctif mergé peut être **silencieusement écrasé** par une PR ultérieure mergée sur une base
périmée — surtout **inter-domaines** (une PR iOS touchant un fichier web). Vérifier, en début de chaque
itération, que les correctifs récents de la session sont **toujours présents** sur `main` avant de
poursuivre le backlog.

## Backlog reporté (§ futur)
- **F86** (LOW) : `use-message-translations.ts` dedup ignorant le timestamp — intention produit à confirmer.
- Antérieurs : F69, F74, F75, F78, F80, F81, F82b toujours reportés.
