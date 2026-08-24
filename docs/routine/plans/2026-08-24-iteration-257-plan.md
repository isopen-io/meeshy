# Plan — Itération 257 : câbler le Prisme sur `createReplyNotification` et `createMentionNotification`

## Objectifs

Amener les DEUX éventails restants de `messageNotificationFanOut` au niveau de
`createMessageNotification` (cycle 121) : lire `Message.translations` +
`originalLanguage`, filtrer aux traductions PUSHABLES, descendre le Prisme du
LECTEUR, pousser `translatedContent` / `translatedLanguage` sur le fil APNs/FCM.

Extraire le couple filtre-chiffré + descente en helper privé partagé pour éviter
la troisième copie (règle « Cette entité a-t-elle une JUMELLE ? »,
`services/gateway/CLAUDE.md`).

## Modules affectés

- `services/gateway/src/services/notifications/NotificationService.ts`
  - Ajout : `_resolveNotificationTranslation(liveMessage, recipientPrism)` — le
    couple filtre-chiffré + descente, source unique pour les trois éventails.
  - Modification : `createMentionNotification` — refetch minimal +
    `_resolveNotificationTranslation` + injection `translatedContent` /
    `translatedLanguage` dans `context` + `lang: recipientLang`.
  - Modification : `createReplyNotification` — idem.
  - Refactor : `createMessageNotification` — inline remplacé par appel du
    helper (trois consommateurs, un corps).
- `services/gateway/src/__tests__/unit/services/notifications/mentionNotificationPrism.test.ts` (nouveau)
- `services/gateway/src/__tests__/unit/services/notifications/replyNotificationPrism.test.ts` (nouveau)

## Phases d'implémentation

1. **RED** — 14 tests neufs (7 par méthode) calqués sur `messageNotificationPrism.test.ts`.
   Ils assertent sur `pushService.sendToUser`, jamais sur un calcul intermédiaire. ✅
2. **GREEN** — helper `_resolveNotificationTranslation` + rebranchement des
   trois méthodes. `createMessageNotification` migre AU MÊME lot, pas de code mort. ✅
3. **Validation** — suites Prism + `NotificationService.test.ts` +
   `messageNotificationFanOut.test.ts` + `anonymousActor` + `collapseId` +
   régression notification complète. ✅

## Dépendances

`packages/shared` doit être built (le gateway importe `resolvePrismTranslation`
depuis `@meeshy/shared/utils/conversation-helpers` via `dist`). Prisma client
doit être généré (import de types utilisés par le mock).

## Risques estimés

Faible : patron du cycle 121 rejoué à l'identique, avec 24h de production
derrière lui sur son premier consommateur. Ajout additif côté fil (aucune
traduction Prisme-servable ⇒ pas de `translatedContent`, comportement historique
préservé mot pour mot). Coût runtime : 1 lecture Prisma supplémentaire par
mention/réponse — négligeable, cf. plafond de 50 mentions/message. Voir
`docs/routine/analyses/2026-08-24-iteration-257-analyse.md` § Risk assessment.

## Stratégie de rollback

Revert du fichier `NotificationService.ts` (helper + trois consommateurs) et
suppression des deux fichiers de tests. Atomique, un seul commit.

## Critères de validation

Voir l'analyse § Validation criteria. Résumé : Prism 23/23, notification
regression 261/261, tsc gateway exit 0.

## Statut de complétion

**Complet.** Toutes les phases exécutées et validées localement. Reste : CI
verte sur la PR.

## Suivi de progression

- [x] RED prouvé (10/14 tests rouges avant correctif ; 4 négatifs passaient
      trivialement — c'est attendu, le code d'avant ne poussait jamais de
      traduction).
- [x] GREEN + helper unique
- [x] `createMessageNotification` migré sur le helper
- [x] Validation locale complète (jest, tsc)
- [ ] Push + CI

## Améliorations futures

Voir l'analyse § Améliorations futures :
1. Parité race guard (`deletedAt`/`expiresAt`) — cycle à part, change fire.
2. Pré-fetch dans `createMentionNotificationsBatch` — cycle à part, contrat de
   paramètre optionnel.
3. Notifications sociales (réactions, commentaires) — cycle à part si mesuré.
