# Cycle 126 — la bulle pré-enregistrée d'une RÉPONSE ou d'une MENTION était ordonnée par l'horloge du DEVICE

> Troisième reprise du suivi MESURÉ du cycle 124. Les deux premières ont porté sur le TEXTE
> (cycle 124 : il n'arrivait pas ; cycle 125 bis : il arrivait vide). Celle-ci porte sur ce qui
> décide de sa PLACE et de son RENDU.

## Le défaut

La NSE iOS pré-enregistre une bulle dès qu'un push porte un `messageId` — donc pour les **trois**
éventails de `messageNotificationFanOut`, pas seulement le message simple. Elle en écrit quatre
champs :

| champ NSE | ce qu'il décide | repli quand le fil ne le porte pas |
|---|---|---|
| `content` | le texte de la bulle | `""` |
| `originalLanguage` | l'étiquette de langue, donc la descente du Prisme | `"en"` |
| **`createdAt`** | **la PLACE de la bulle dans le fil** | **`Date()` — l'horloge du device** |
| **`messageType`** | **le RENDU (audio / image / vidéo vs texte)** | **`text`** |

Les deux premiers sont composés par `NotificationService.prePersistedMessageFields`, que les trois
éventails appellent depuis le cycle 124. **Les deux derniers étaient posés EN LIGNE, dans le seul
`createMessageNotification`.** Sur un même message :

| destinataire | sa bulle au démarrage à froid |
|---|---|
| les membres du fil | à sa place, rendue selon son type |
| **celui à qui on répond** | **rangée à l'heure de RÉCEPTION du push, rendue en `text`** |
| **celui qu'on mentionne** | **idem** |

Deux conséquences distinctes, les deux mesurées :

1. **L'ordre.** Deux appareils du même compte n'ont aucune raison d'horodater pareil, et une salve
   de messages range la bulle à contretemps de celles que la synchro REST pose ensuite.
2. **Le rendu.** Ces deux éventails ne poussent pas `attachmentMimeType` non plus — décision
   DÉLIBÉRÉE du cycle 125 bis (« le rich-push n'est pas étendu à la réponse ni à la mention »),
   donc le repli `mediaMessageTypes` de l'extension ne peut rien rattraper. La bulle d'une réponse
   VOCALE était un rectangle de texte **vide** jusqu'à la synchro REST — c'est-à-dire pendant toute
   la fenêtre où un pré-enregistrement a une raison d'être.

## Pourquoi il a survécu au cycle 125 bis

Ce cycle-là a consolidé la composition du CORPS des trois bannières, en nommant exactement la
bonne cause : « la composition vivait chez UN des trois ». Il n'a pas regardé le
PRÉ-ENREGISTREMENT, parce que celui-ci avait déjà son helper partagé — `prePersistedMessageFields`,
appelé par les trois — et que ce partage suffisait à le faire passer pour partagé.

Le helper ne composait que **deux des quatre** champs que son nom annonce.

> **Un helper PARTAGÉ peut ne composer qu'une PARTIE de ce que son nom promet, et le partage de la
> partie fait passer le TOUT pour partagé.**
>
> C'est le retournement exact de la leçon du cycle 125 bis (« compter les appelants du helper le
> plus BAS rassure à tort — c'est le plus HAUT qu'il faut compter »). Ici le helper EST le plus
> haut, ses trois appelants sont bien les trois éventails, et le compte est juste. Ce qui manque
> n'est pas un appelant, c'est un CHAMP. La question qui l'attrape ne se pose donc pas du côté des
> appelants mais du côté du CONSOMMATEUR : **quels champs la NSE lit-elle, et lesquels ce helper
> compose-t-il ?** — deux listes à confronter, pas un compte à faire.

## Le correctif

1. **`prePersistedMessageFields` compose les QUATRE champs** — un site unique enfin conforme à son
   nom. `createMessageNotification` cesse de poser les deux siens en ligne : les trois éventails
   passent désormais par la même projection, donc ne peuvent plus diverger.

2. **`MessagePrePersistStamp`** — l'estampille (`createdAt`, `messageType`), et
   **`MessageNotificationSource`** qui la tient AVEC la source du Prisme. Les deux viennent de la
   même ligne `Message` et aucune ne dépend du destinataire : `loadMessagePrismSource` devient
   `loadMessageNotificationSource` et rend les deux en **UNE** requête (deux colonnes de plus dans
   un `select` existant — aucune lecture ajoutée, et l'éventail de mentions continue de relire une
   seule fois pour tout son lot). `createMessageNotification` n'y touche pas : sa propre relecture
   est un GATE d'éligibilité et chargeait déjà les quatre colonnes.

3. **L'estampille traverse les trois refus du helper, et c'est une décision.** `prePersistedMessageFields`
   refuse d'écrire le TEXTE d'un placeholder de protection, d'une transcription, ou d'un aperçu
   vide. L'estampille, elle, n'est pas du contenu : un horodatage ne révèle que l'instant d'un
   message que la bannière annonce de toute façon, et un type ne révèle que l'icône que
   `protectedPreview` compose déjà (« 👁️ 🎵 »). Les retirer avec le texte n'ajouterait **aucune**
   garde et laisserait la bulle d'un message protégé se ranger à l'heure du device. C'est aussi,
   exactement, ce que `createMessageNotification` faisait déjà : le lot ne change rien à l'éventail
   de référence.

4. **Fail-OPEN inchangé, et une absence ne ment pas.** Une relecture en échec rend une estampille
   vide ⇒ aucune clé sur le fil ⇒ l'extension retombe sur ses propres replis. Poser une valeur
   inventée (l'heure du fan-out, `text`) ferait mentir l'ordre du fil — pire qu'une absence, que le
   client sait interpréter.

## Gates

| gate | résultat |
|---|---|
| `prePersistStampParity.test.ts` (nouveau) | **8 témoins — 5 rouges avant, 8 verts après** |
| suites voisines (`notifications/` + éventail + `NotificationService`) | 42 suites, 760 témoins verts |
| suite gateway complète | **859 suites / 19 527 témoins verts** (exit 0) |
| `services/gateway` `tsc --noEmit` | 0 erreur |
| Swift | non modifié — le fil porte enfin les clés que la NSE lisait déjà |

Trois des huit témoins étaient VERTS avant le correctif, délibérément : la référence
(`createMessageNotification` pousse l'estampille), le fail-open, et « l'éventail de mentions relit
UNE fois ». Ils ne conduisent pas le correctif, ils gardent ce qu'il ne doit pas casser — le
troisième en particulier, parce qu'élargir un `select` est exactement le geste qui invite à ajouter
une requête.

## Suivi MESURÉ

- **Le rich-push n'est toujours pas étendu à la réponse ni à la mention** — inchangé, et toujours
  délibéré (cycle 125 bis). Leur bulle porte désormais le bon TYPE sans le FICHIER : elle se rend
  en bulle audio/image en attente de téléchargement, plus en rectangle vide. C'est la dégradation
  correcte, pas un contournement.
- `isEncrypted` reste lue par la NSE et jamais émise. **Piège armé, pas panne, et mesuré comme
  tel** : `prePersistMessage` et la branche `locKey` retombent toutes deux sur
  `encryptedContent`, que le fil porte. Le jour où quelqu'un chiffre sans poser `encryptedContent`,
  les deux gardes tombent ensemble.
- La bannière d'un vocal joint toujours le fichier ORIGINAL, jamais la piste traduite du Prisme.
- Aucun chemin de création n'écrit `isViewOnce` / `isBlurred` sur une `MessageAttachment` : le
  second niveau de `maskedAttachment` reste armé, pas encore atteignable.
- **La bulle pré-enregistrée porte `state: .delivered` et `deliveredAt: nil`** — non instruit ce
  cycle-ci. À vérifier au prochain : un accusé de remise part bien de `postDeliveryReceipt`, mais
  la ligne locale ne le reflète pas, et c'est elle que l'app relit au démarrage à froid.
