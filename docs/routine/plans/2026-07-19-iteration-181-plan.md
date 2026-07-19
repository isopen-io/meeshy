# Plan d'implémentation — Itération 181

## Objectifs
Brancher les 2 sites `MessageHandler._notifyAgent` sur la SSOT
`resolveParticipantDisplayName` afin d'insérer le tier compte `User.displayName`
manquant et de supprimer la fuite chaîne-vide, tout en conservant le fallback
final `username`.

## Modules affectés
- `services/gateway/src/socketio/handlers/MessageHandler.ts` (import + 2 lignes)
- `services/gateway/src/__tests__/unit/handlers/MessageHandler.core.test.ts` (+1 test RED)

## Phases
1. **RED** — Ajouter le test « account displayName préféré au username » dans
   `MessageHandler.core.test.ts` (mirroir du test existant `null displayName →
   username`, mais avec `user.displayName` renseigné). Vérifier l'échec.
2. **GREEN** — Importer `resolveParticipantDisplayName` ; remplacer les 2
   coalescences `sender?.displayName ?? sender?.user?.username` par
   `resolveParticipantDisplayName(message.sender) ?? message.sender?.user?.username`.
3. **VALIDATE** — Suites `MessageHandler` vertes + `tsc --noEmit` 0 nouvelle
   erreur.

## Dépendances
- Helper `resolveParticipantDisplayName` (packages/shared, livré itér. 179) —
  déjà en prod.

## Risques estimés
Très faibles — fallback username conservé, changement additif (insertion d'un
tier), miroir d'un pattern existant. Voir analyse pour la matrice de
non-régression des tests existants.

## Stratégie de rollback
Revert du commit unique (import + 2 lignes + 1 test). Aucune migration, aucun
changement de schéma ni de contrat d'API.

## Critères de validation
- +1 test RED→GREEN.
- Suites `MessageHandler.core.test.ts` + `socketio/handlers/__tests__/MessageHandler.test.ts` vertes.
- `tsc --noEmit` 0 nouvelle erreur.

## Statut d'achèvement
- [ ] RED
- [ ] GREEN
- [ ] VALIDATE
- [ ] Commit + push

## Améliorations futures
- Balayer d'autres sites `sender?.displayName ?? …` restants (CallEventsHandler,
  participant-resolver) : sémantique parfois différente (fallback `username`
  vs `'Unknown'`), chacun requiert une vérification dédiée avant uniformisation.
