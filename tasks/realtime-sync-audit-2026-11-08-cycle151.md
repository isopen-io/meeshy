# Cycle 151 — l'enveloppe de l'appareil : la faire voyager, et la retenir

*2026-11-08. Branche `claude/exciting-planck-14zure`, démarrée depuis `dev`
après la fusion du cycle 150 (`ee28259f9`).*

**CADRAGE — ce fichier est la réservation de la branche (directive 2026-09-06).**
Il sera remplacé par le journal du lot.

## Le lot

Le suivi que le cycle 150 a laissé ouvert et nommé « demande son propre tour » :
**#17080** — en conversation E2EE, la bannière d'une RÉPONSE ou d'une MENTION
reste `🔒 💬` à vie, parce que `encryptedContent` ne voyage que sur l'éventail
`regular`.

## Ce que le cadrage a trouvé AVANT d'écrire la première ligne

Faire voyager l'enveloppe sur les trois éventails **sans la garder** aurait
propagé à deux éventails de plus une fuite qui existe déjà sur `regular` :

- `protectedPreview` a pour préséance *éphémère > vue unique > flouté > chiffré* ;
- `createNotification` pose `encryptedContent` **sans aucune condition** sous
  `showPreview` — ni le verrou `notificationLocKey`, ni `mediaMayTravel` ;
- la NSE iOS (`applyBodyRewrites`) déchiffre et **remplace le corps**, sans
  jamais consulter `declaresProtection`.

Donc, aujourd'hui, en conversation E2EE : un message à **VUE UNIQUE**, **FLOUTÉ**
ou **ÉPHÉMÈRE** pousse son texte ENTIER sur l'écran verrouillé, sous une bannière
qui dit `👁️ 🖼️`. En mode serveur, le même message est protégé.

C'est la leçon 275 dans un médium de plus — **ce qui part À CÔTÉ de la chaîne
qu'on vient de garder** — et la raison pour laquelle ce cycle porte DEUX moitiés
qui ne se livrent pas séparément.

## Fichiers du lot (réservation)

- `services/gateway/src/services/notifications/notification-preview.ts`
- `services/gateway/src/services/notifications/NotificationService.ts`
- `services/gateway/src/services/messaging/messageNotificationFanOut.ts`
- ses témoins
