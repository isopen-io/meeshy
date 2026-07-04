# Iteration 87 — Analyse d'optimisation (2026-07-03)

## Protocole (démarrage)
`main` @ `0a64d3b7` (PR #1393 « android/calls WebRTC-plumbing » mergée). Branche de travail
`claude/brave-archimedes-okvqw1` recréée à neuf depuis `origin/main` (working tree propre,
aucun commit non-mergé à préserver).

PR ouvertes au démarrage : #1394 (gateway `StatusHandler` — enforce membership sur `typing:*`)
et #1392 (iOS a11y `BubbleDeliveryCheck`) — deux pistes indépendantes gérées par d'autres
sessions. Cible retenue **hors de ces deux fichiers** (aucun conflit de merge attendu).

## Cible : compléter le fix badge F1 pour Android (FCM `notificationCount`)

### Current state
Le fix **F1** (`f2ee0d71`, 2026-07-03 — « badge unread embarqué dans le push ») a résolu le
badge d'icône **gelé app fermée** en injectant le compte unread dans le payload push :
`NotificationService.sendToUser` calcule `prisma.notification.count({ readAt: null })` et le
propage via `payload.badge` (+ `data.unreadCount`). Côté transport, `PushNotificationService`
(le service **live**, appelé par `NotificationService` + `CallEventsHandler`) forwarde
`payload.badge` :
- **iOS** (`sendViaFCM`, branche `platform === 'ios'`) → `aps.badge = payload.badge` ✓
- **APNs natif** (via `apn.Provider`) → `note.badge` ✓
- **Android** (`sendViaFCM`, branche `platform === 'android'`) → **rien.** Le bloc
  `message.android.notification` ne pose que `sound` + `channelId`. `payload.badge` est
  silencieusement ignoré.

### Problems identified
Sur Android, le badge d'icône du launcher (pour les launchers qui supportent le badging) n'est
**jamais piloté par le payload push**. C'est exactement la classe de bug que F1 visait — mais F1
n'a été câblé que pour iOS. App fermée, le badge Android reste figé quel que soit le nombre de
messages/notifications reçus.

### Root cause
FCM expose `AndroidNotification.notificationCount` (→ `notification_count`) : « the number of
items this notification represents, may be displayed as a badge count for launchers that support
badging ». C'est l'analogue Android de `aps.badge`. La branche `platform === 'android'` de
`sendViaFCM` ne l'a jamais posé — le champ n'a probablement pas été ajouté à l'époque de l'écriture
initiale de FCM, et le fix F1 (récent) s'est concentré sur le chemin iOS/widget (`data.unreadCount`
alimente le miroir App Group, câblé pour toutes plateformes ; mais le badge natif Android manquait).

### Business impact
Parité de l'expérience « badge unread fidèle app fermée » entre iOS et Android. L'app Android est
en développement actif (cf. PR #1393 android/calls) → un badge gelé est une régression UX perçue
directement sur l'écran d'accueil.

### Technical impact
1 ligne conditionnelle dans la branche android de `sendViaFCM`. Zéro nouvelle dépendance, zéro
changement de signature, zéro impact perf (champ ajouté au message FCM déjà construit).

### Risk assessment
TRÈS FAIBLE. Ajout conditionnel (`payload.badge !== undefined`) → aucun changement de payload
quand aucun badge n'est fourni (compatibilité stricte : le test d'égalité exacte existant
`should include android-specific config` reste vert). `notificationCount: 0` est un entier FCM
valide (représente « pas de badge »), cohérent avec la sémantique de recale de F1.

### Proposed improvements
Dans `PushNotificationService.sendViaFCM`, branche `platform === 'android'` :
```ts
notification: {
  sound: payload.sound || 'default',
  channelId: 'meeshy_notifications',
  ...(payload.badge !== undefined ? { notificationCount: payload.badge } : {}),
}
```

### Expected benefits
- Badge d'icône Android piloté par le push → fidèle app fermée (parité iOS).
- Clôt le résidu Android du fix F1.

### Implementation complexity
TRÈS FAIBLE — 1 spread conditionnel + 3 tests (badge présent, badge 0, badge absent).

### Validation criteria
- `PushNotificationService.test.ts` : 73/73 verts (3 régressions neuves incluses).
- RED prouvé : sans le fix prod, 2 des 3 nouveaux tests échouent.
- Suites `[Nn]otification` : 644/644 verts (29 suites).
- `tsc --noEmit` gateway : 0 erreur.

## Note — `FirebaseNotificationService` (dead code parallèle)
Constaté durant l'analyse : `services/notifications/FirebaseNotificationService.ts` (multicast
`sendEachForMulticast`, badge hardcodé `1`) n'est **jamais instancié en production** — seul
`PushNotificationService` est câblé (`MeeshySocketIOManager`, `CallEventsHandler`,
`NotificationService`). Candidat consolidation/suppression pour une itération dédiée (voir F51).

## Améliorations futures (report)
- **F51** : `FirebaseNotificationService` = implémentation FCM parallèle inutilisée (badge hardcodé
  `1`, pas de circuit breaker, pas de retry) vs `PushNotificationService.sendViaFCM` (live, circuit
  breaker + retry + badge dynamique). Supprimer le mort ou fusionner — chantier de consolidation.
- **F49/F50** : résidus lost-update in-process sur caches stats (report des iter 82-84, sévérité
  basse, auto-guéris par TTL / `recompute()`).
