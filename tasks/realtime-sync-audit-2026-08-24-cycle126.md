# Cycle 126 — le cycle 125 bis a fait converger le CORPS ; ce qui le QUALIFIE est resté derrière

Date : 2026-08-24 · Branche : `claude/keen-hamilton-veokcs` · Base : `a604d477`

## Note de convergence, d'abord

Ce cycle a démarré sur le même défaut que le **cycle 125 bis** (PR #3478,
`2f618c3a`) : « répondre par un vocal ou une photo poussait une bannière au corps
VIDE ». Les deux passes l'ont diagnostiqué, corrigé et mesuré en parallèle. Le
cycle 125 bis a mergé le premier ; **son implémentation est celle qui est
retenue**, intégralement, y compris sa décision explicite de NE PAS étendre le
rich-push (`firstAttachmentUrl` / `firstAttachmentMimeType` /
`metadata.attachments`) aux éventails réponse et mention :

> Le rich-push n'est délibérément pas étendu à ces deux éventails — leur bannière
> compose désormais le bon TEXTE ; y attacher le média inline rouvrirait une
> surface que le cycle 125 vient de resserrer.

Cette passe-ci avait pris la décision inverse, par argument de cohérence. **Une
convergence ne se résout pas en prenant l'union des deux lots** : la décision
explicite et raisonnée du lot mergé en premier l'emporte. Elle est conservée
telle quelle, et rien de ce cycle ne la rouvre.

Ce qui reste, ci-dessous, est ce que cette passe apportait EN PLUS et que le
cycle 125 bis ne couvre pas.

## Ce que le lot précédent a laissé derrière

Le cycle 125 bis a fait converger le CORPS des trois bannières. Deux champs de
l'éventail ne l'ont pas suivi, et pour une raison qu'il faut dire à voix haute :
**ils ne composent aucune chaîne.**

| champ | ce qu'il fait | ce que son absence coûtait à la réponse et à la mention |
|---|---|---|
| `notificationLocKey` | QUALIFIE le placeholder d'un message protégé — la NSE iOS le rend depuis sa propre table de localisation — et sert de SECOND VERROU à `createNotification` | placeholder servi dans la chaîne composée par la passerelle, non localisé ; le verrou du cycle 125 inapplicable ; `protectedByLocKey` absent de `previewPrismSource` et `prePersistedMessageFields` |
| `messageCreatedAt` / `messageType` | l'horloge SERVEUR de la bulle que la NSE PRÉ-ENREGISTRE au démarrage à froid | la bulle d'une réponse ou d'une mention datée par l'horloge du DEVICE, donc rangée au mauvais endroit du fil |

`createMessageNotification` tenait les deux de sa relecture VIVANTE — celle qui
lui sert aussi de gate d'éligibilité. Réponse et mention n'ont que
`loadMessagePrismSource`, dont le `select` ne demandait ni `createdAt` ni
`messageType`.

## La leçon (§ 279)

> **Un lot qui partage une valeur composée doit énumérer ce qui voyage AVEC elle,
> pas seulement ce qui la compose.** Un champ qui QUALIFIE un texte — une clé de
> localisation, une horloge, un type — ne se trouve pas en cherchant « qui compose
> ce texte ? » : par construction, il n'apparaît dans aucune composition.

C'est la forme du cycle 125 rejouée un cran plus haut : là, quatre gardes tenaient
une CHAÎNE pendant que le fichier partait dans l'objet voisin ; ici, un lot fait
converger une CHAÎNE pendant que ce qui la qualifie reste derrière.

**Et le motif de structure qui l'a rendu possible** : `createMentionNotificationsBatch`
relayait `commonData` **champ par champ** — neuf lignes de recopie. Un relais de
cette forme retient silencieusement tout ce qu'on ajoute en amont : il ne rougit
jamais, il oublie. Il répand désormais, ne recopiant que les deux champs qui
changent de NOM.

## Le correctif

1. **`MessageBannerSource`** — `MessagePrismSource` + `createdAt` + `messageType`.
   Deux types et non un : la première dit ce qui TRADUIT l'aperçu, la seconde ce
   qui l'ORDONNE. Elles voyagent ensemble parce qu'elles viennent de la même
   lecture, pas parce qu'elles répondent à la même question.
2. **`loadMessagePrismSource`** lit deux colonnes de plus dans la requête qu'il
   faisait déjà — aucune requête supplémentaire, et un témoin l'assert sur le
   `select` autant que sur la valeur servie.
3. **`messageClockFields()`** — la projection, partagée par les trois éventails ;
   `createMessageNotification` y est rebranché pour qu'il n'en existe qu'un site.
4. **`notificationLocKey`** déclaré et servi sur `createReplyNotification`,
   `createMentionNotification` et le batch ; `protectedByLocKey` posé sur leurs
   `previewPrismSource` et `prePersistedMessageFields`.
5. **Le relais du batch répand** au lieu de recopier.

Le verrou est REDONDANT avec la base `protected-placeholder` que l'éventail pose
déjà — et c'est voulu : `protectedPreview` est l'unique producteur de cette clé
dans tout le dépôt, donc sa présence DÉCLARE la protection là où une base peut
être omise par un appelant solo.

## Gates

| gate | résultat |
|---|---|
| `replyMentionBannerClock.test.ts` (nouveau) | **14 rouges contre `origin/main` / 19 verts après** |
| suites voisines (`notifications/` + `messaging/` + éventail + `NotificationService`) | 36 suites, 709 témoins |
| suite gateway complète (`bun run test:coverage`) | **859/859 suites, 19538 témoins**, exit 0 — couverture globale 95,47 % stmts / 89,60 % branches |
| `services/gateway` `tsc --noEmit` | 0 erreur (code de retour lu SANS pipe — cf. la règle du pipefail) |
| `packages/shared` `tsc --noEmit` | 0 erreur |
| non-régression du cycle 125 bis (`replyMentionMediaPreview.test.ts`) | vert |
| Swift / Kotlin | non modifiés |

## Suivi MESURÉ

- **Le rich-push reste hors des éventails réponse et mention** — décision du
  cycle 125 bis, conservée. Le suivi qu'elle laisse ouvert est le sien.
- La bannière d'un vocal joint toujours le fichier ORIGINAL, jamais la piste
  traduite du Prisme (cycle 123, toujours ouvert).
- `isEncrypted` reste lue par la NSE iOS et n'est jamais émise (cycle 124) —
  piège armé, pas panne.
- Aucun chemin de création n'écrit `isViewOnce` / `isBlurred` sur une
  `MessageAttachment` (cycle 125) — armé, pas atteignable.
- Couverture des deux fichiers touchés : `messageNotificationFanOut.ts` 99,13 % · `NotificationService.ts` 94,63 % — inchangée ou en hausse.
- **Le lot `regular` reste le seul à faire une relecture VIVANTE du message**
  (son gate d'éligibilité : supprimé / expiré / brûlé en vol). Réponse et mention
  tiennent leur échéance de l'appelant. Ce n'est pas une divergence de bannière
  mais une divergence de GATE : un message soft-supprimé dans la fenêtre de
  l'éventail annonce encore sa réponse et ses mentions. Distinct, non instruit.
