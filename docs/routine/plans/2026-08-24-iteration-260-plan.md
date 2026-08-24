# Plan — Itération 260 : router la recherche de messages par le SSOT de pagination

## Objectifs

Fermer le seul défaut de correctness de pagination ATTEIGNABLE du gateway : la
route `GET /conversations/:id/messages/search` reparsait sa taille de page à la
main (`Math.min(parseInt(limitStr, 10) || 20, 50)`), rouvrant le bug que
`validatePagination` documente tuer — `limit=0` → page pleine, `limit=-5` →
`take` Prisma négatif.

## Modules affectés

- `services/gateway/src/routes/conversations/messages.ts` (1 ligne de prod).
- `services/gateway/src/__tests__/unit/routes/messages-routes.test.ts` (2 témoins
  neufs + 1 témoin existant mis à jour).

## Phases

1. **Vérification de portée** — confirmer que les 4 autres sites `parseInt(limit)
   || …` de `routes/` sont défendus par un pipe Zod `min(1).max(N)` (faits :
   admin/languages, admin/analytics, admin/system-rankings, admin/broadcasts).
   Seul le site recherche a un `querystring` nu. ✅
2. **RED** — ajouter deux témoins dans le groupe `messages/search` :
   délégation (`validatePagination('0','0',{maxLimit:50})` appelé) et « le limit
   rendu gouverne take/hasMore/cursorPagination » (mock → 7, `take` 8). Mettre à
   jour le témoin `hasMore` existant pour fixer le retour du helper mocké. ✅
3. **GREEN** — remplacer l'inline par
   `const { limit: searchLimit } = validatePagination('0', limitStr, { maxLimit: 50 });`. ✅
4. **Validation** — suite ciblée verte, suite fichier complète verte, `tsc`. ✅

## Dépendances

Aucune. `validatePagination` déjà importé dans le fichier.

## Risques estimés

Faible : substitution vers un helper éprouvé et déjà consommé par la route sœur
du même fichier. Seule différence observable : sur des entrées hors-borne que
l'inline traitait mal.

## Stratégie de rollback

Révocation d'un commit d'une ligne de prod + trois de test. Sans état persistant,
sans migration.

## Critères de validation

- RED mesuré (2 témoins tombent avant, `take: 51` / 0 appel).
- `messages-routes.test.ts` : 229/229.
- `tsc --noEmit` gateway : 0 erreur.

## Statut d'achèvement

**COMPLET.** RED prouvé, GREEN, suite fichier verte (229/229), `tsc` propre.

## Suivi / améliorations futures

- `clamp(value,min,max)` SSOT partagé (10+ inlines) — différé, faible payoff.
- Durcir le `querystring` de la recherche par un `validateQuery` Zod borné —
  changement de contrat d'entrée, à évaluer séparément.
