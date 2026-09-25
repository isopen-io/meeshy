## Iteration 196 — SSOT convergence appliquée aux helpers d'affichage utilisateur
- `users.service.ts` réimplémentait localement 3 SSOT (`getUserDisplayName`,
  `getInitials`, `formatPresenceLabel`) et en avait divergé. Leçon : quand un
  SSOT existe déjà (`utils/user-display-name`, `utils/initials`,
  `utils/presence-format`), un service ne doit JAMAIS refaire la logique — il
  délègue. Les copies dérivent silencieusement (blank-guard, découpe Unicode,
  règle présence partagée) et réintroduisent des bugs déjà corrigés ailleurs.
- Les clés i18n canoniques `contacts.status.lastSeen*` existaient déjà dans les
  4 locales ; vérifier la présence des clés AVANT de migrer un formatter vers le
  SSOT (évite d'ajouter des clés inutiles ou de casser le rendu).
- Les tests figeant l'ANCIEN comportement bugué (ex. `status.minutesAgo`, `'JP'`)
  doivent être mis à jour vers la vérité SSOT, pas contournés. Ajouter en même
  temps les cas défaillants explicites (displayName blanc, nom emoji, isOnline
  périmé, bascule cross-minuit) qui documentent POURQUOI la délégation corrige.
- `getInitials` multi-mot = 1ᵉʳ + dernier mot (JJ), pas 2 premiers mots (JP) :
  divergence volontaire alignée sur Telegram/Discord/Slack.
