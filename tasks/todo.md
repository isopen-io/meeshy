# Cycle 125 — la protection masquait le TEXTE et laissait partir le FICHIER

## Point de départ

Le cycle 124 a refermé le CORPS d'un message protégé : la transcription d'un vocal ÉPHÉMÈRE / à
VUE UNIQUE / FLOUTÉ / CHIFFRÉ ne gagne plus sur le placeholder que `protectedPreview` compose.

La question posée à ce correctif — celle que la leçon 275 formule — est :

> **la charge que ce site remet contient-elle autre chose que ce que je viens de garder ?**

Elle se répond en lisant l'objet remis, ligne à ligne. Douze lignes sous la garde du cycle 124,
dans le même objet littéral :

```ts
firstAttachmentUrl: first?.fileUrl || undefined,
firstAttachmentMimeType: first?.mimeType || undefined,
```

`createNotification` les recopie dans `data.attachmentUrl` (sous la seule garde `showPreview`),
et la NSE iOS — `NotificationService.swift:171`, mesuré — télécharge cette URL puis l'attache en
`UNNotificationAttachment` **sans jamais regarder `notificationLocKey`**.

> **Une photo à VUE UNIQUE s'affichait ENTIÈRE, en grand, sur l'écran verrouillé, sous une
> bannière disant « 👁️ 🖼️ ».** Aucun texte n'avait besoin de fuir pour que le secret parte.

Second constat, distinct : `MessageAttachment` porte SES PROPRES drapeaux de masquage
(`isViewOnce`, `isBlurred`, `effectFlags`) et le `select` de l'éventail n'en lisait **aucun**.

## Plan

- [x] TDD — 15 témoins RED d'abord (`protectedMediaLeaks.test.ts`) : 13 rouges, 2 verts
      (les deux témoins du cas NOMINAL, qui prouvent que le harnais mesure la bonne chose).
- [x] `maskedAttachment()` — la JUMELLE de `protectedPreview`, posée juste à côté d'elle.
      Ne lit pas `isEncrypted` : le chiffrement d'une pièce jointe est un mode de TRANSPORT,
      pas un masque d'affichage — et le message chiffré reste retenu par `protectedPreview`.
- [x] L'éventail — `mediaMayTravel` gouverne `attachmentInfo` EN BLOC (fichier **et**
      étiquettes : le nom de fichier est PERSISTÉ, donc relu) **et** `firstAttachmentTranscript`,
      qui posait déjà la même question un niveau plus bas.
- [x] `createNotification` — SECOND VERROU sur `notificationLocKey`, dont `protectedPreview` est
      l'unique producteur du dépôt : sa présence est une DÉCLARATION, jamais un indice.
- [x] Aucun changement iOS, et c'est délibéré — cf. § « Ce qu'on n'a pas fait ».

## Revue

### Gates

| gate | résultat |
|---|---|
| `protectedMediaLeaks.test.ts` (nouveau) | **13 rouges avant → 15/15 verts après** |
| suites voisines (`notifications/` + éventail + `voiceNoteBannerPrism`) | **24 suites, 366 témoins** |
| suite gateway complète | **854/854 suites, 19476 témoins** |
| `services/gateway` `tsc --noEmit` | **0 erreur** |
| mutation « `mediaMayTravel` retiré de l'éventail » | **17 témoins tombent** (dont les 14 du cycle 124) |
| mutation « second verrou retiré de `createNotification` » | **1 témoin tombe** |
| Swift | non modifié |

**La première mutation est la mesure qui compte.** `mediaMayTravel` ne se contente pas de
gouverner le média : il a REPRIS `firstAttachmentTranscript`, la garde du cycle 124. Les 14
témoins de ce cycle tombent donc DEPUIS SON NOUVEAU SITE — un refactor qui déplace une règle
doit prouver qu'elle tombe encore de là où on l'a mise, sans quoi on a déplacé le code et perdu
la garde.

### Une régression de test, et ce qu'elle dit

La suite complète a rendu **3 rouges dans `MessageProcessor.test.ts`** — trois témoins de
l'éventail à ZÉRO appel. Le fichier fabrique le module `NotificationService` à la main
(`jest.mock(..., () => ({ NotificationService, protectedPreview }))`) : `maskedAttachment`
n'y figurait pas, donc l'éventail mourait sur `maskedAttachment is not a function`, silencieux
dans son propre `catch`.

> Un quatrième témoin du même bloc — `skips regular notification for users with mentionsOnly` —
> est resté VERT, parce qu'il assert `not.toHaveBeenCalled()`. **Un témoin d'absence passe au
> vert quand l'unité entière meurt** : c'est un mode de panne que le lot voisin masquait.

### Ce qu'on n'a pas fait

La NSE pourrait refuser d'attacher un média quand `notificationLocKey` est présent. Elle n'a pas
été touchée :

- la fuite est fermée **à la source**, et la source est le seul endroit qui CONNAISSE l'état de
  protection du message ;
- pour le seul cas où la NSE révèle légitimement un contenu protégé (E2EE déchiffré localement),
  la passerelle ne pousse plus d'URL du tout : la garde cliente serait **inerte** ;
- une édition Swift non compilable ici achèterait un risque de build (leçon 274, corollaire de
  harnais) contre zéro comportement observable.

> **Une garde qu'aucun témoin ne peut faire échouer est une ligne de commentaire déguisée.**

### Détail

- `tasks/realtime-sync-audit-2026-08-24-cycle125.md`
- `tasks/lessons.md` § Leçon 275

### Suivi MESURÉ

- **Les éventails RÉPONSE et MENTION ne composent aucun aperçu de média** — ils reçoivent
  `notificationPreview` (jamais `…ForPush`) et aucun `attachmentInfo`. Répondre par un vocal
  pousse donc une bannière au corps VIDE pendant que les autres membres reçoivent la
  transcription. Reporté du cycle 124, toujours ouvert.
- Aucun chemin de création n'écrit `isViewOnce` / `isBlurred` sur une `MessageAttachment` :
  le second niveau de `maskedAttachment` est **armé, pas encore atteignable**.
- `isEncrypted` reste lue par la NSE et jamais émise (cycle 124) — piège armé, pas panne.
- Réponse et mention ne poussent ni `createdAt` ni `messageType` : leur bulle reste ordonnée par
  l'horloge du device.
- La bannière d'un vocal joint toujours le fichier ORIGINAL, jamais la piste traduite du Prisme.
