# Iteration 92 — Analyse d'optimisation (2026-07-04)

## Protocole (démarrage)
`main` @ `b33f20b5` (« Merge pull request #1437 … » — HEAD au démarrage, working tree propre).
Branche de travail `claude/brave-archimedes-5eth6v` recréée à neuf depuis `origin/main`, 0 commit
non-mergé à préserver.

PR ouvertes au démarrage : #1439 (iOS a11y — `SyncPill` Dynamic Type), #1438 (gateway —
`ReactionService.ts` + `schema.prisma` upsert atomique anti-doublon), #1429 (gateway realtime —
`MeeshySocketIOManager`/`MessageHandler`/`delivery-queue.ts` replay edit/delete offline). Cible
retenue **hors de tous ces fichiers** : le report explicite le plus ancien du backlog routine —
**F51** (parké itérations 87→91), suppression de dette morte, purement vérifiable en jest sans
toolchain Swift/Kotlin ni migration DB.

## Cible : F51 — `FirebaseNotificationService`, implémentation FCM parallèle morte + docs de notifs périmées

### Current state
Le service gateway possède **deux** implémentations d'envoi de push FCM :

1. **`services/PushNotificationService.ts` (909 lignes) — VIVANTE.** Instanciée dans
   `MeeshySocketIOManager` (`new PushNotificationService(this.prisma)`, l.694), injectée dans
   `NotificationService.setPushNotificationService()` (l.3727) et dans `CallEventsHandler`
   (l.785). C'est elle qui gère l'init firebase-admin, le multicast (`sendEachForMulticast`), APNs,
   la résolution de credentials, le routing d'environnement. Le commit HEAD le plus récent
   (`6cd1a3c4`, « implement FCM multicast push ») fait évoluer **cette** classe.

2. **`services/notifications/FirebaseNotificationService.ts` (242 lignes) — MORTE.** Sender FCM
   minimal antérieur (`FirebaseStatusChecker` + `FirebaseNotificationService.sendPushNotification`).
   **Jamais instanciée en production** : `grep "new FirebaseNotificationService"` (hors tests) = 0
   résultat. Ses seuls référents sont : (a) la ré-export de `notifications/index.ts` (l.7) ; (b) son
   propre test unitaire `__tests__/unit/services/notifications/FirebaseNotificationService.test.ts`
   (492 lignes, teste exclusivement la classe morte) ; (c) une assertion de ré-export dans
   `NotificationService.uncovered-paths.test.ts` (l.119-121).

Les docs de dossier (`README.md`, `SUMMARY.md`, `ARCHITECTURE.md`, `MIGRATION.md`, `FILES.txt`) sont
un **instantané historique de refactorisation** qui décrit une architecture qui **n'existe plus** :
- Elles affirment que `NotificationService` **compose** `FirebaseNotificationService` en constructeur
  (`this.firebaseService = new FirebaseNotificationService(prisma)`) — **FAUX**, le code réel injecte
  `PushNotificationService` via `setPushNotificationService()`.
- Elles listent un module `NotificationServiceExtensions.ts` (378 lignes) qui **n'existe pas** dans
  l'arbre actuel.
- `FILES.txt` contient des chemins absolus machine-spécifiques (`/Users/smpceo/Documents/…`) — pur
  artefact de génération, pas de la doc de repo.

### Problems identified
- **Duplication d'implémentation critique** : deux senders FCM coexistent. Un mainteneur qui corrige
  un bug de push (retry, invalidation de token, format de payload) peut le patcher dans la mauvaise
  classe (la morte), croyant corriger le chemin vivant — bug latent de maintenabilité.
- **Dette de test** : ~492 lignes de test unitaire couvrent du code qui n'est jamais exécuté en prod,
  gonflant artificiellement les métriques de couverture et le temps de suite.
- **Docs mensongères** : la doc de dossier décrit une composition `FirebaseNotificationService` qui
  n'existe plus, et un module fantôme `NotificationServiceExtensions`. Tout nouveau contributeur lisant
  `README.md`/`ARCHITECTURE.md` se construit un modèle mental faux du chemin de notification push.

### Root cause
Résidu de migration incomplète. `FirebaseNotificationService` (ancien sender) a été supplanté par
`PushNotificationService` (nouveau sender complet, APNs + multicast) sans supprimer l'ancien ni mettre
à jour les docs de refactorisation qui le décrivaient. Motif classique « la nouvelle implémentation
remplace l'ancienne mais l'ancienne n'est jamais retirée » (dette morte non collectée).

### Business impact
Indirect mais réel : le push FCM est le canal de re-engagement hors-app (notifs de message, mention,
appel manqué, réaction). Un correctif de push appliqué par erreur à la classe morte = régression de
délivrabilité silencieuse en production. Retirer l'ambiguïté protège ce canal.

### Technical impact
Suppression : 1 fichier de prod mort (242 l.) + 1 test dédié (492 l.) + 1 ligne de ré-export + 1
assertion de test + 1 `FILES.txt` cruft. Neutralisation honnête des docs périmées (bannière
« obsolète » pointant vers `PushNotificationService`). Zéro changement de comportement runtime : le
code retiré n'était jamais exécuté. `notifications-firebase.test.ts` (770 l., teste le chemin VIVANT
`NotificationService`/APNs — ne référence PAS la classe morte) est **conservé intact**.

### Risk assessment
TRÈS FAIBLE. La classe supprimée est prouvablement morte (0 instanciation prod). Le seul risque de
compilation serait un import résiduel — audité exhaustivement : seuls `index.ts` (ré-export) et
l'assertion de test la référencent, tous deux corrigés dans le même diff. Aucune migration DB, aucun
changement d'API publique consommée.

### Proposed improvements
1. Supprimer `services/notifications/FirebaseNotificationService.ts`.
2. Supprimer `__tests__/unit/services/notifications/FirebaseNotificationService.test.ts`.
3. Retirer la ré-export `FirebaseNotificationService, FirebaseStatusChecker` de
   `notifications/index.ts`.
4. Retirer l'assertion « should re-export FirebaseNotificationService » de
   `NotificationService.uncovered-paths.test.ts`.
5. Supprimer `FILES.txt` (cruft machine-spécifique, référence un module inexistant).
6. Bannière d'obsolescence en tête de `README.md`/`SUMMARY.md`/`ARCHITECTURE.md`/`MIGRATION.md`
   pointant vers `services/PushNotificationService.ts` comme chemin de push réel (borné — pas de
   réécriture du corps stale, documenté en F51b).

### Expected benefits
- Une seule implémentation FCM (`PushNotificationService`) → plus d'ambiguïté « quelle classe patcher ».
- ~734 lignes de code/test mort retirées.
- Docs qui ne référencent plus de fichier supprimé ni de composition défunte.

### Implementation complexity
FAIBLE — suppressions + 2 petites éditions de code + bannières bornées. Pas de nouvelle logique.

### Validation criteria
- [ ] `grep -r "FirebaseNotificationService\|FirebaseStatusChecker"` sur `services/gateway/src`
  (hors docs) = 0 résultat après diff.
- [ ] `NotificationService.uncovered-paths.test.ts` : les 3 assertions de ré-export restantes
  (`NotificationService`, `SocketNotificationService`, `NotificationFormatter`) passent ; l'assertion
  Firebase est retirée.
- [ ] Suites `notifications` (hors la suite supprimée) + `notifications-firebase.test.ts` (chemin
  vivant) : 0 régression.
- [ ] `tsc --noEmit` gateway : pas de NOUVELLE erreur vs baseline `main` (baseline pré-existant
  `SequenceService.ts` → `@prisma/client` inchangé).

## Candidats écartés ce cycle (documentés)
- **Comment-reaction `postType` collapse** (`CommentReactionHandler` + `createCommentReactionNotification`,
  `params.isStory ? 'STORY' : 'POST'` perd STATUS/REEL) : sibling direct du fix post-reaction it.91,
  mais la valeur dépend d'une consommation client de `metadata.postType` non confirmée + le body i18n
  ne supporte qu'un booléen `isStory` (extension = churn i18n). Reporté (F58).
- **REST comment-like (`comment_like`) vs socket comment-reaction (`comment_reaction`)** : deux types
  de notif pour la même action « réagir à un commentaire » selon le transport — possiblement
  intentionnel (like legacy vs reaction), confiance insuffisante pour unifier sans spec produit.
  Reporté (F59).

## Améliorations futures (report)
- **F51b** (LOW) : réécriture complète des docs `notifications/` (README/SUMMARY/ARCHITECTURE/
  MIGRATION) — stale au-delà de Firebase (composition défunte, module fantôme
  `NotificationServiceExtensions`, noms de métriques `firebaseSent`). Ce cycle ne pose qu'une bannière.
- **F55** (MEDIUM) : reels cache desync web sur edit/delete — itération web dédiée.
- **F56** (MEDIUM-HIGH) : `likeCount` double-count self-reaction web.
- **F57** (LOW) : `hasMentions` (ASCII `\w`) vs `parseMentions` (Unicode) boundary drift.
- **F58** (LOW) : comment-reaction `postType` STATUS/REEL collapse.
- **F59** (LOW) : REST comment-like vs socket comment-reaction notif type divergence.
