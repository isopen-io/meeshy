## Leçon 20 — F51 soldé : suppression du sender FCM mort `FirebaseNotificationService`, supplanté par `PushNotificationService` (2026-07-04, itération 92)

Report explicite parké 5 itérations (87→91). Le gateway hébergeait **deux** implémentations d'envoi
de push FCM : la vivante `services/PushNotificationService.ts` (909 l., multicast `sendEachForMulticast`
+ APNs + routing d'env, instanciée dans `MeeshySocketIOManager` et injectée via
`setPushNotificationService()`, faisant l'objet du commit HEAD `6cd1a3c4`) et la morte
`services/notifications/FirebaseNotificationService.ts` (242 l., ancien sender minimal). Preuve de mort :
`grep "new FirebaseNotificationService"` hors tests = 0 ; seuls référents = ré-export `index.ts` + son
test unitaire dédié + une assertion de ré-export dans `NotificationService.uncovered-paths.test.ts`.
Retiré : la classe, son test unitaire (492 l.), la ré-export, l'assertion, et `FILES.txt` (cruft
machine-spécifique `/Users/smpceo/…` référençant un module fantôme `NotificationServiceExtensions.ts`).
**Piège évité : `notifications-firebase.test.ts` (770 l.) NE teste PAS la classe morte** — il monte le
chemin VIVANT `NotificationService`/APNs et ne référence jamais `FirebaseNotificationService` ; il est
donc CONSERVÉ. Toujours vérifier le SUJET réel d'un test « firebase » avant de le supprimer avec la
classe : ici l'homonymie de nom (`FirebaseNotificationService.test.ts` = mort vs `notifications-firebase.test.ts`
= vivant) est un piège de suppression.

Docs de dossier (`README/SUMMARY/ARCHITECTURE/MIGRATION.md`) = instantané historique périmé décrivant
une **composition** `FirebaseNotificationService` qui n'existe plus (le réel est INJECTÉ, pas composé) +
un module `NotificationServiceExtensions.ts` inexistant. Choix : bannière « obsolète » bornée pointant
vers `PushNotificationService`, PAS de réécriture complète (dette pré-existante orthogonale, reportée
F51b). **Règle : supprimer une classe référencée par des docs impose au minimum de neutraliser les
références pendantes (sinon la doc pointe un fichier supprimé = pire dette) — mais ne pas se laisser
entraîner dans une réécriture doc complète non bornée pour un cycle de suppression de code mort.**

**Gotcha d'environnement de validation (sandbox) réutilisable** : le schema Prisma override l'output
vers `./client`, donc `@prisma/client` (que `SequenceService.ts` importe) n'est jamais généré → baseline
TS2305 qui bloque le CHARGEMENT de toute suite important la chaîne `NotificationService` (documenté
it.87-91, faussement pris pour « suites non exécutables »). Pour un signal vert RÉEL : injecter un
générateur `client_default` (output par défaut) **transitoire** dans le schema, `npx prisma generate`,
puis **restaurer le schema immédiatement** (`git diff` schema == vide) — ça peuple
`node_modules/.prisma/client` (gitignored). Résultat : les 28 suites `[Nn]otification` du runner par
défaut passent (619 tests), dont la suite éditée `uncovered-paths` (53/53). Effet de bord à connaître :
avec DEUX clients générés (le `./client` + le default transitoire), ts-jest peut lever un TS2321
« Excessive stack depth » sur `new SequenceService(prisma)` (`NotificationService.ts:419`) dans les
suites `@ts-nocheck` hors runner par défaut (`notifications-firebase.test.ts`) — artefact du double
client aux types divergents, JAMAIS un signal de régression du diff. Ne pas chasser cette erreur si le
fichier concerné n'est pas dans le diff.
