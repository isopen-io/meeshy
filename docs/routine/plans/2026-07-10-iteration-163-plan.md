# Plan itération 163 — Réactiver la suppression de légende REST (AJV body schema)

## Objectives
Rendre la fonctionnalité « edit à contenu vide sur message avec pièces jointes »
réellement fonctionnelle sur le chemin REST `PUT /conversations/:id/messages/:messageId`,
en corrigeant le schéma AJV `schema.body` qui la court-circuitait avant le handler.

## Affected modules
- `services/gateway/src/routes/conversations/messages-advanced.ts` (route edit)
- `services/gateway/src/__tests__/unit/routes/edit-message-body-schema.test.ts` (nouveau)

## Implementation phases
1. **Extraction + fix** — sortir le schéma AJV du body dans
   `export const editMessageBodyJsonSchema`, remplacer `minLength: 1` par
   `maxLength: 10000` (miroir de `EditMessageBodySchema` Zod), référencer la
   constante dans `schema.body`. ✅
2. **Régression fidèle** — nouveau test inject sur un vrai Fastify utilisant la
   constante exportée : contenu vide accepté (200), > 10 000 rejeté (400), = 10 000
   accepté (200), clé `content` manquante rejetée (400). ✅
3. **Non-régression** — `conversation-messages-advanced` (101/101) + `tsc`. ✅

## Dependencies
Aucune. S'appuie sur le fix handler déjà livré par #1803.

## Estimated risks
Faible — retrait d'une contrainte min, borne max + `required` conservés, garde
`hasAttachments` du handler inchangé.

## Rollback strategy
Revert du commit : restaurer `minLength: 1` inline et supprimer le test. Aucune
migration, aucun état persistant touché.

## Validation criteria
- RED vérifié (minLength:1 → 2 cas en échec).
- GREEN : 5/5 nouveau test, 101/101 suite existante, tsc propre.

## Completion status
- [x] Phase 1 — extraction + fix
- [x] Phase 2 — test inject de régression
- [x] Phase 3 — non-régression + typecheck
- [x] Docs analyse + plan
- [ ] Commit + push branche `claude/brave-archimedes-lvnleg`

## Progress tracking
Itération 163. Départ : `main` @ `5541e8c`. Cible : parité REST/socket caption removal.

## Future improvements
- Nettoyer les `CommentReaction` orphelines dans `PostCommentService.deleteComment`
  (appeler `deleteCommentReactions` sur le sous-arbre soft-deleted).
- Auditer les autres routes dont le `schema.body` AJV et le re-parse Zod interne
  divergent (risque de branches mortes similaires).
