# Cycle 124 — le contrat de fil push, mesuré dans les DEUX sens

> Suivi MESURÉ des cycles 122 et 123, laissé ouvert par les deux dans les mêmes
> termes. Instruit ici, et la mesure qui le confirme en découvre trois autres.

## 1. Le point de départ

Les journaux des cycles 122 et 123 se closent tous deux sur cette ligne :

> `NotificationService.prePersistMessage` côté NSE lit `userInfo["content"]`, une clé que le
> payload push ne porte pas (vérifié : `PushNotificationService:785` pose `{...payload.data}`) —
> le message pré-enregistré au démarrage à froid a donc un corps VIDE jusqu'à la synchro REST,
> défaut distinct du Prisme.

Deux fois nommé, deux fois différé au motif « Swift, non exerçable ici ». Le motif est réel
(aucune chaîne Swift dans ce conteneur) et il ne couvre pas la moitié TypeScript du défaut, qui
n'avait jamais été regardée.

## 2. La mesure — clé par clé, dans les deux sens

Le payload push est un contrat entre deux fichiers qu'aucun type ne relie :

- **producteur** : `NotificationService.createNotification`, bloc `data:` (TS) ;
- **consommateur** : les lectures `userInfo[...]` de `MeeshyNotificationExtension` (Swift).

Deux listes de chaînes, écrites séparément, jamais confrontées.

### 2.1 Lu par la NSE, JAMAIS émis (4 clés)

| clé | conséquence |
|---|---|
| `content` | corps **VIDE** sur la bulle pré-enregistrée — le défaut hérité |
| `senderName` | **aucun nom d'expéditeur**. La passerelle émet `senderDisplayName` — et `NotificationService.swift:563`, dans le MÊME fichier, le lit correctement pour le cadrage Communication |
| `originalLanguage` | langue **fabriquée** (`"en"` en repli) sur un enregistrement dont la résolution du Prisme dépend ensuite |
| `isEncrypted` | second verrou E2EE inerte — le premier (`encryptedContent`) tient, donc pas de panne |

### 2.2 Émis POUR la NSE, jamais lu par elle (2 clés)

| clé | commentaire du producteur | ce que la NSE faisait |
|---|---|---|
| `createdAt` | « GW5 — persistance NSE : timestamp serveur » | `Date()` — l'horloge du device |
| `messageType` | « GW5 — … + type du message » | dérivé du mime de la pièce jointe |

> **Un helper à un appelant est un inventaire (leçon 271) ; un CHAMP à zéro lecteur est une
> intention.** La mesure du cycle 122 — « `translatedContent` n'est lu par aucun client » —
> n'était pas un cas isolé : c'est la forme normale d'un contrat dont les deux moitiés vivent
> dans deux langages qu'aucun type ne relie.

## 3. Pourquoi le correctif n'est PAS d'émettre `content`

C'est le correctif évident, et il rouvrirait exactement la fuite que le cycle 123 vient de
fermer : le texte NU d'un message protégé (éphémère / vue unique / flouté) repartirait sur le
canal push pendant que la bannière affiche son placeholder. La passerelle a RAISON de ne pas
l'émettre, et le mode privé (`showPreview: false`) a raison de retirer tout champ porteur de
contenu.

Le texte que la NSE peut légitimement enregistrer est celui qu'elle s'apprête à AFFICHER :

- déjà descendu dans le Prisme du destinataire (cycle 121) ;
- déjà masqué par la protection s'il y a lieu (cycle 123) ;
- déjà présent dans la charge, en `aps.alert.body`.

Il ne lui manque que **la langue de ce texte**, et **l'autorisation** de le prendre pour le
contenu du message.

## 4. Le correctif — la troisième projection de `PreviewPrismBasis`

La passerelle sait déjà répondre aux deux, et depuis le cycle 123 elle le sait sous forme de
TYPE : `PreviewPrismBasis` dit ce que l'aperçu EST.

| projection | cycle | question |
|---|---|---|
| `previewPrismSource` | 123 | qu'est-ce qui TRADUIT cet aperçu ? |
| garde de `servedTranslationFields` | 123 | que peut-on transporter à côté ? |
| **`storableMessageLanguage`** | **124** | **peut-il être ENREGISTRÉ comme le message ?** |

### 4.1 Passerelle

`storableMessageLanguage({ basis, originalLanguage, protectedByLocKey })` rend la langue du
message, ou `undefined` sur les trois formes où le corps servi n'est pas `Message.content` :

- `protected-placeholder` — l'écrire planterait « ⏱️ 💬 24h » dans la base locale, où il
  survivrait à la bannière si la synchro REST n'arrive jamais ;
- `transcript` — la parole d'un vocal appartient à la pièce jointe, pas au message ;
- `protectedByLocKey` — second verrou, même arbitrage que la descente : un appelant qui compose
  un placeholder sans déclarer sa base perd un enregistrement local, jamais le secret.

La quatrième forme — le mode privé — est tenue une couche plus haut, par la garde `showPreview`
sous laquelle le champ est émis.

**Aucun texte neuf ne part sur le fil** : la clé ajoutée est un code de langue de deux à cinq
octets, et sa PRÉSENCE est le discriminant.

### 4.2 La JUMELLE, posée dans le MÊME lot

`services/gateway/CLAUDE.md` : « Cette entité a-t-elle une JUMELLE ? à poser au moment où l'on
corrige, pas des cycles plus tard. » Elle en a deux, et la réponse est la même qu'au cycle 122
pour le Prisme lui-même : **les TROIS éventails de `messageNotificationFanOut` poussent un
`messageId`, donc les trois font pré-enregistrer une bulle côté NSE.** Sans le champ, celles
d'une RÉPONSE et d'une MENTION seraient restées sans corps pendant que celle d'un message simple
en aurait un — l'exact symptôme « deux textes pour un même message » que les cycles 121 à 123
poursuivent.

`createReplyNotification` et `createMentionNotification` tiennent déjà la langue d'origine :
`MessagePrismSource.originalLanguage`, relue UNE fois pour tout l'éventail depuis le cycle 122.
**Aucune lecture de plus.**

### 4.3 NSE

`NotificationPayloadHelpers.prePersistedMessageFields(userInfo:notificationBody:fallbackNow:)`
— helper PUR, déjà compilé dans les deux cibles — rend les quatre champs :

| champ | source |
|---|---|
| `content` | `translatedContent` (texte servi NU) ; sinon le corps de la bannière, **et seulement en l'absence de pièce jointe** (avec, le corps porte un cadrage — « 🎵 Audio · 0:34 », badges `+2📷` — qui n'est pas le texte du message) ; sinon `""` |
| `language` | `translatedLanguage` quand une traduction a été servie, `messageOriginalLanguage` sinon |
| `createdAt` | `createdAt` du fil (ISO 8601, avec ou sans fraction), repli horloge device |
| `senderName` | `senderDisplayName` → `senderUsername` |

`prePersistedMessageTypes` garde N4 prioritaire (le mime décide du rendu média ;
`Message.messageType` vaut `text` pour un vocal légendé) et n'utilise le type du fil qu'en
l'absence de pièce jointe.

## 5. Gates

| gate | résultat |
|---|---|
| `messageNotificationPrism.test.ts` | 29/29 |
| `replyMentionNotificationPrism.test.ts` | 44/44 |
| répertoire `notifications/` complet | 18 suites, 266 témoins |
| mutation « garde de `storableMessageLanguage` retirée » | **3 témoins tombent** (transcription, placeholder, verrou locKey) |
| mutation « champ hors de la garde `showPreview` » | **1 témoin tombe** (mode privé) |
| RED initial, message | **2 témoins de présence tombent** |
| RED initial, jumelles (réponse + mention) | **4 témoins tombent** |
| `packages/shared` build (`tsc`) | 0 erreur |
| `services/gateway` `tsc --noEmit` | 0 erreur |
| suite gateway complète | **848/848 suites, 19431 témoins** |
| suite shared complète | **108 fichiers, 2578 témoins** |

**Swift non compilable ici** (aucune chaîne Swift dans le conteneur). Les 14 témoins XCTest sont
posés dans `MeeshyTests/Unit/Services/NotificationPayloadHelpersTests.swift`, sur le helper PUR
— la forme qui les rend exerçables sans le runtime `UNNotificationServiceExtension`, et sans
modification de `project.yml` (le fichier est déjà membre des deux cibles).

Leçon : `tasks/lessons.md` § 273.

## 6. Suivi MESURÉ

- **La bannière d'un vocal joint toujours le fichier ORIGINAL.** Les pistes audio traduites
  (`url` sur l'entrée `MessageAttachment.translations`) ne sont pas attachées à la notification.
  Absence nommée au cycle 123, non instruite ; inchangée.
- **Les éventails RÉPONSE et MENTION ne poussent ni `createdAt` ni `messageType`.** Leur bulle
  pré-enregistrée est donc ordonnée par l'horloge du device et rendue depuis le mime de la pièce
  jointe — le comportement que ce lot vient de corriger sur `new_message`. Combler exigerait
  d'élargir `MessagePrismSource`, un type partagé écrit pour un autre usage : c'est un lot à
  part, pas une omission. Nommé, mesuré, ouvert.
- **`isEncrypted` reste une clé lue et jamais émise.** Sans conséquence tant que
  `encryptedContent` tient le verrou E2EE — piège armé, pas panne : le premier lot qui
  déciderait de pousser le drapeau sans la charge le désarmerait sans faire tomber de témoin.
