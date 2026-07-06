# Iteration 113 — Analyse d'optimisation (2026-07-06)

## Protocole (démarrage)
`main` @ `ea901dd8` (« feat(android/settings): regional (content) language preference #1530 »),
working tree propre. Branche de travail `claude/brave-archimedes-nxiewe` recréée depuis `origin/main`
(`git checkout -B … origin/main`), 0 commit non-mergé à préserver.

**5 PR ouvertes au démarrage**, toutes **disjointes** de la cible retenue :
- **#1529** gateway `AffiliateTrackingService.getAffiliateStats` (F83 — filtres `groupBy`),
- **#1528** gateway `admin/system-rankings.ts` (fold participant→user, F82 dans leur numérotation),
- **#1527 / #1525 / #1524** iOS quality (design tokens, `MeeshyFont.relative()`, dates modernes) — sessions Jules.

Backlog F-series : plus haute étiquette observée **F83** (#1529). Cette itération prend **F84**.

### Revue d'ingénierie (constat de démarrage)
Balayage ciblé (agent d'exploration, 81 tool-uses) des fonctions **pures/quasi-pures** et méthodes de
service **auto-contenues** de `services/gateway/src/utils`, `services/gateway/src/services`,
`packages/shared/utils`, `apps/web/utils` et `apps/web/lib`, **hors** les fichiers des 5 PR ouvertes et
hors zones déjà traitées (itérations 100-111 : `initials`, `truncate`, `format-number`, `calendar-date`,
`mention-parser`, `duration-format`, `relative-time`, `time-remaining`, `presence-format`,
`email-validator`, `normalize`, `url-content`, `mention-display`, `generateCommunityIdentifier`,
`buildAttachmentUrl`, `blocking`, `pagination`, `response`, `etag`, `bounded-cache`, `lru-cache`,
`rate-limiter`, `language-normalize`, `call-summary`, `notification-strings`, `user-status`,
`circuitBreaker`, `sanitize`/`xss-protection`, `phone-validator`, `language-detection`).

Une racine de défaut de **cohérence de statistique agrégée** remonte, à appelants **live** persistants,
alimentant un endpoint auth-gated visible utilisateur → **F84** (impact réel, analytics, cœur produit
multilingue « Prisme Linguistique »).

## Cible : F84 — `languageDistribution` figé : `MessageHandler` transmet `null` comme langue du message

### Current state
`ConversationMessageStatsService` (`services/gateway/src/services/ConversationMessageStatsService.ts`)
maintient les statistiques de conversation exposées par `GET /conversations/:id/stats`
(`routes/conversations/stats.ts:58,88-97`, derrière `requiredAuth` + `canAccessConversation`), dont la
carte `languageDistribution` (répartition des messages par langue d'origine, servie triée décroissante
en `languageDistributionArray`).

Le service possède **deux** chemins d'écriture :
- **`recompute()`** (l.324-455) — reconstruit tout depuis `message.findMany`, compte correctement
  `languageDistribution[msg.originalLanguage]`. N'est appelé **que** quand la ligne de stats n'existe
  pas encore (`onNewMessage` l.104-107, `getStats` l.314-316) — pas de recompute périodique
  (`grep` de tous les appelants de `.recompute(` : seuls les chemins paresseux `!existing`).
- **`onNewMessage()` incrémental** (l.92-189) — pour chaque nouveau message une fois la ligne créée.
  Il n'incrémente `languageDistribution` que si `originalLanguage` est truthy (l.167-169) :
  ```ts
  if (originalLanguage) {
    languageDistribution[originalLanguage] = (languageDistribution[originalLanguage] || 0) + 1;
  }
  ```

Les **deux** sites d'appel live dans `MessageHandler.ts` transmettaient `null` en 6e argument, alors
que la vraie valeur était en main :
```ts
// MessageHandler.ts:320  (handleMessageSend)
conversationMessageStatsService.onNewMessage(
  this.prisma, message.conversationId, userId || participantId, validated.content ?? '', [], null
)…
// MessageHandler.ts:523  (handleMessageSendWithAttachments)
conversationMessageStatsService.onNewMessage(
  this.prisma, …, data.content ?? '', attachmentTypes, null
)…
```
`message` est le message sauvegardé enrichi (`response.data` de `saveMessage`) ; son champ
`originalLanguage` est déjà lu juste au-dessus pour `_notifyAgent` (l.312 et l.507).

### Problems identified
- **[LIVE] `languageDistribution` gèle après la création de la ligne de stats.** Une fois la ligne
  existante (dès le 2e appel `getStats`/`onNewMessage`), **chaque** nouveau message emprunte le chemin
  incrémental, qui avec `originalLanguage === null` ne touche jamais `languageDistribution`. Aucun
  chemin auto-réparateur (pas de recompute périodique).
- **Scénario concret :** une conversation dont la ligne de stats a été initialisée à `{fr: 7, en: 3}`,
  puis 10 000 messages supplémentaires → `languageDistribution` reste bloqué à `{fr: 7, en: 3}` **à
  jamais**, tandis que `totalMessages` (increment atomique), `dailyActivity` et `hourlyDistribution`
  grandissent correctement. Le champ devient **incohérent** avec `totalMessages` et visiblement faux
  dans l'UI de statistiques.

### Root cause
La langue d'origine du message, pourtant disponible au point d'appel (`message.originalLanguage`, déjà
consommée pour la notification agent), était codée en dur à `null` lors du câblage initial de
`onNewMessage` dans le handler (commit `d9bcfbda`). Le paramètre `originalLanguage` — dont l'unique
raison d'être est d'alimenter `languageDistribution` — recevait donc toujours `null`, faisant du
comptage de langues sur le chemin chaud du code mort d'exécution.

### Business impact
- Statistique analytics « répartition par langue » d'une conversation **fausse et gelée** dès la 2e
  interaction, cœur du positionnement produit multilingue (Prisme Linguistique). Un modérateur/admin ne
  voit jamais évoluer la diversité linguistique réelle d'une conversation.

### Technical impact
- Incohérence interne : `sum(languageDistribution) << totalMessages`. Fiabilité des dashboards sapée.
- Portée minimale : correctif de 2 arguments, service déjà correct et testé pour le cas « langue
  fournie » (`ConversationMessageStatsService.test.ts:488-495`).

### Risk assessment
Très faible. On transmet une valeur déjà en main et déjà utilisée pour un autre effet (notification
agent). Aucun changement de signature, de forme de réponse ou de schéma. Le chemin incrémental garde
son garde `if (originalLanguage)` — un message sans langue détectée n'ajoute simplement rien (identique
à `recompute`).

### Proposed improvements
`null` → `message.originalLanguage ?? null` aux deux sites d'appel de `MessageHandler.ts`.

### Expected benefits
`languageDistribution` suit désormais chaque nouveau message, cohérent avec `recompute()` et avec
`totalMessages`.

### Implementation complexity
Triviale (2 lignes source + 2 assertions de test au niveau handler).

### Validation criteria
- Test handler RED→GREEN prouvant que la 6e position de `onNewMessage` reçoit la langue du message
  sauvegardé (`'fr'` chemin texte, `'de'` chemin attachments) et non `null`.
- Suites `MessageHandler.core.test.ts` et `ConversationMessageStatsService.test.ts` vertes.
- CI verte.

## Améliorations futures (reportées)
- **F84b** — `locationCount` sur le chemin incrémental : `ATTACHMENT_TYPE_FIELDS` mappe
  `location → locationCount`, mais les `attachmentTypes` construits dans le handler ne contiennent que
  `image/audio/video/file` (dérivés du MIME), jamais `location` — les messages de localisation portent
  `messageType === 'location'` (compté correctement dans `recompute`, pas en incrémental). Même classe
  de défaut « incrémental vs recompute », mais nécessite de faire remonter `messageType` au handler
  (changement plus large) → cycle dédié.
- **F84c** — `reactionSummary` des posts/commentaires (`PostReactionService.ts:312-348`,
  `CommentReactionService.ts:371-407`) maintenu par delta read-modify-write non atomique alors que le
  total `reactionCount` est recomputé autoritairement ; dérive d'emoji fantôme possible en concurrence.
  Le durcissement `groupBy` déjà appliqué aux réactions de message (`ReactionService`) n'a pas été
  propagé. Confiance moindre (nécessite concurrence) → cycle dédié.
- **F83** (notif) — `groupNotificationsByDate` bucket « cette semaine » inatteignable le dimanche
  (cosmétique, déjà tracké).
</content>
</invoke>
