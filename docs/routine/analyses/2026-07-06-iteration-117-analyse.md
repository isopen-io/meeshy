# Iteration 117 — Analyse (2026-07-06)

## Contexte / priorité
`main` @ `cfc5fb7c` (post-merge #1561), working tree propre. Branche `claude/brave-archimedes-a3vrtu`
recréée depuis `origin/main`. Itération 116 (durcissement `ReactionService.updateMessageReactionSummary`,
transaction + recompte autoritaire) est **déjà mergée** dans `main` — vérifié dans le code.

PR ouvertes au démarrage (13) : essentiellement des bumps dependabot (#1532-#1549) + PR fonctionnelles
disjointes (#1572 realtime participantId cache, #1570 tts `_segment_text`, #1566 reactions groupBy
post/commentaire, #1564 audit Apple, #1563 docs calls). La cible retenue est **strictement disjointe**
de toutes.

### Revue d'ingénierie
Balayage medium-thorough (agent d'exploration parallèle, 57 tool-uses) des helpers purs/quasi-purs de
`services/gateway/src/utils`, `services/gateway/src/services`, `packages/shared/utils`, `apps/web/utils`,
`apps/web/lib`, hors zones déjà traitées et hors PR en vol. Vérifiés corrects et écartés :
`duration-format`, `relative-time`, `time-remaining`, `language-normalize`, `object-id`,
`safe-redirect`, `user-language-preferences`, `pagination`, `normalize`, `sanitize`, `bounded-cache`,
`conversation-id-cache`, `participant-lookup-cache`, `etag`, `callHistory`, `translation-transformer`,
`date-format`, ports `story-transforms`. Trois défauts remontent ; **F85** est le seul simultanément réel,
atteignable en production, violation de SSOT documentée, et auto-incohérent.

## Cible : F85 — `getParticipantDisplayName` viole le résolveur canonique de nom (pas de `trim`)

### Current state
`apps/web/utils/participant-helpers.ts` → `getParticipantDisplayName` (l.9-13, avant fix) :
```ts
export function getParticipantDisplayName(user: {...}): string {
  return user.displayName ||                                  // truthiness brute, jamais trimmée
    `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
    user.username;
}
```
Réimplémentation locale du SSOT documenté `getUserDisplayName` (`apps/web/utils/user-display-name.ts`,
l.24-48) qui résout `displayName (trimmé) > firstName+lastName > username` **et trimme la valeur**.

### Problems identified
1. **[LIVE] `displayName` blanc/espacé fuit dans l'UI.**
   - `getParticipantDisplayName({ displayName: '   ', username: 'bob' })` → `'   '` (rend un libellé
     vide) ; canonique → `'bob'`.
   - `getParticipantDisplayName({ displayName: 'John ', username: 'bob' })` → `'John '` (espace
     traîlant) ; canonique → `'John'`.
2. **[LIVE] Incohérence interne nom ↔ initiales.** Dans le **même module**, `getParticipantInitials`
   (l.15-17) délègue à `getUserInitials` → `avatar-utils` → le résolveur **canonique trimmé**
   (`resolveDisplayName`). Pour un `displayName` blanc, les initiales sont calculées sur le nom
   *trimmé/fallback* alors que le libellé nom est calculé sur le nom *non trimmé* → ils divergent.
   Les deux sont rendus **côte à côte** (avatar + nom) dans `conversation-participants.tsx` (l.179/187)
   et `conversation-participants-drawer.tsx` (l.405/428) : l'avatar peut afficher `BO` pendant que le
   libellé rend blanc/décalé.

### Root cause
Convergence de l'itération 49 (`avatar-utils`/`contacts-utils` alignés sur le résolveur canonique
trimmé) : `participant-helpers` a été **laissé de côté**. Réimplémentation inline jamais rétro-portée.

### Business impact
Sur les vues de participants d'une conversation (liste + drawer), un utilisateur ayant un `displayName`
constitué uniquement d'espaces (ou avec espaces parasites) affiche un nom vide/mal aligné à côté d'un
avatar aux initiales correctes.

### Technical impact
Deux résolveurs de nom pour la même primitive dans le même fichier ; violation de la règle Single Source
of Truth (`apps/web/CLAUDE.md` §Single Source of Truth). Fragile : toute évolution du contrat de nom
devait être dupliquée.

### Risk assessment
Très faible. On délègue à un résolveur **déjà en production et testé** (`getUserDisplayName`). Aucun
changement de signature publique ni de forme de retour. Le fallback final `user.username` est préservé
en le passant en 2e argument (`getUserDisplayName(user, user.username)`).

## Proposed improvements
Déléguer `getParticipantDisplayName` à `getUserDisplayName(user, user.username)`. Le nom et les
initiales dérivent désormais d'une seule source. Ajouter un fichier de tests unitaires couvrant :
displayName préféré, trim d'espace traîlant, fallback au-delà d'un displayName blanc, fallback
firstName+lastName, firstName seul, fallback username, et cohérence nom↔initiales.

## Expected benefits
- Correction d'un affichage de nom vide/mal trimmé sur le chemin des vues de participants.
- Cohérence garantie nom ↔ initiales (source unique).
- Suppression d'une réimplémentation de SSOT (dette technique).

## Implementation complexity
Triviale — 1 fichier de production modifié (délégation), 1 fichier de test ajouté.

## Validation criteria
- `participant-helpers.test.ts` vert (7/7).
- Suite `apps/web/utils/__tests__/` sans régression (118/118).
- `tsc --noEmit` sans nouvelle erreur sur `participant-helpers.ts` / `user-display-name.ts`.

## Candidats écartés cette itération (documentés pour éviter re-travail)
- **`contacts-utils.formatLastSeen`** : divergence réelle du contrat last-seen (>24h relatif vs
  calendaire canonique de `presence-format`), MAIS aucun import de production trouvé (l'UI passe par
  `users.service.formatLastSeenLabel` / copie locale `contacts/page.tsx`). Convergence complète = 3
  fichiers ; à traiter comme nettoyage/unification dédiée, reachability à confirmer d'abord.
- **`translation-cleaner.deepCleanTranslationOutput`** : bug réel (regex apostrophe casse les
  contractions `l'homme` → `l"homme`), MAIS code mort (aucun caller de production). Impact ~0.
