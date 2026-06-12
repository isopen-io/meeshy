# Plan UI/UX — Itération 45 (2026-06-12)

Branche : `claude/blissful-ritchie-dp7ibu` (depuis `main` 09e08439, post-#594).
Analyse source : `docs/analyses/uiux/2026-06-12-iteration-45.md`.

## Web

- [x] **W1** `conversation-participants-drawer.tsx` : remplacer les 6 littéraux FR par
  `t('participants.addUserSection')`, `t('participants.addAction')`, `t('participants.noUserFound')`,
  `t('participants.allAlreadyMembers', { count })`, `t('participants.loadMoreRemaining', { count })`.
  Ajouter les clés sous `participants` dans `locales/{en,fr,es,pt}/conversations.json`.
- [x] **W2** `utils/v2/transform-conversation.ts` : `formatRelativeTime(date, { t, locale })` ;
  clés compactes `timeCompact.{now,minutes,hours,days}` (4 locales, wording aligné iOS
  `time.short.*`) ; fallback date `toLocaleDateString(locale, …)`. Étendre
  `TransformConversationOptions` avec `t`/`locale` ; wiring dans `use-conversations-v2.ts` via
  `useI18n('conversations')`.
- [x] **W3** `users.service.ts` : `getLastSeenFormatted(user, { t, locale })` réutilisant les clés
  existantes `contacts.status.*` ; wiring `use-profile-v2.ts` + `use-contacts-v2.ts`
  (`useI18n('contacts')`) ; adapter les helpers de transform concernés.
- [x] **W4** Supprimer le code mort `formatNotificationTimestamp`/`formatNotificationContext`
  (utils/notification-helpers.ts) + le bloc de tests `formatNotificationContext`.
- [x] **W5** Passer `locale` (depuis `useI18n`) aux `toLocaleDateString()` de
  `ConversationEncryptionSection.tsx:135` et `LinkTypeStep.tsx:163`.
- [x] **W6** Tests Jest verts (95 ciblés + parité exacte avec main sur la passe large : 31 suites
  en échec préexistantes, 0 nouvelle) ; tsc : 0 nouvelle erreur sur les fichiers touchés
  (erreurs restantes préexistantes sur main, vérifié par git stash). ESLint local inopérant
  (config cassée dans l'environnement, préexistant) — arbitrage CI.

## iOS

- [x] **I1** `FeedCommentsSheet.swift` : supprimer les deux `timeAgo` privés (l.650, l.874) ;
  remplacer les appels (l.500, l.783) par `ShortRelativeTime.label(for:)`.
- [x] **I2** `ChangePasswordView.swift` : `accentColor` → `MeeshyColors.brandPrimaryHex` ;
  `"9B59B6"` → `MeeshyColors.indigo600Hex` ; 13 polices texte → sémantiques (ladder 44b),
  héros 48pt conservé.

## Android

- [x] **A1** Supprimer les clés `chat_date_*` dupliquées dans
  `feature/chat/src/main/res/values-es/strings.xml` et `values-pt/strings.xml` (l.28-30).

## Vérification & livraison

- [x] **V1** Cohérence cross-platform vérifiée : `timeCompact.*` web aligné mot pour mot sur
  `time.short.*` iOS (now/maintenant/ahora/agora ; « {n} min » ; « {n}h » ; fr « {n}j »,
  en/es/pt « {n}d ») ; lastSeen web réutilise `contacts.status.*` existants.
- [ ] **V2** Commit + push `claude/blissful-ritchie-dp7ibu`, PR vers `main`, CI verte, merge.
- [ ] **V3** Mettre à jour `branch-tracking.md` (itération 45 terminée, carry-over 46).

## Carry-over proposé pour l'itération 46
- Web : batch admin i18n (debug.tsx, AgentArchetypesTab, AgentConfigDialog, UserPicker),
  `'fr-FR'` admin (~10 fichiers), chart theming dark, BackSoundDetails.
- iOS : NewConversationView/DataExportView/DataStorageView polices ; ancienne palette
  08D9D6/FF2E63/4ECDC4 (~10 fichiers) ; arbitrage `time.*` vs `time.short.*`.
- Android : début parité stories OU réactions par pièce jointe (wiring gateway).
