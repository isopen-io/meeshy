# Cycle 124 — le message PRÉ-ENREGISTRÉ n'a jamais lu le fil qu'on remplissait pour lui

## Point de départ — le suivi MESURÉ, laissé ouvert par les cycles 122 ET 123

Les deux cycles précédents ont clos leur lot sur la même ligne, mot pour mot :

> `NotificationService.prePersistMessage` côté NSE lit `userInfo["content"]`, une clé que le
> payload push ne porte pas — le message pré-enregistré au démarrage à froid a donc un corps
> VIDE jusqu'à la synchro REST. Défaut distinct du Prisme.

Deux fois nommé, deux fois différé (« Swift, non exerçable ici »). Ce cycle l'instruit — et la
mesure qui le confirme en découvre TROIS autres du même genre, dont deux en sens inverse.

## La mesure — le contrat de fil, clé par clé, dans les DEUX sens

Le payload push est un contrat entre deux fichiers qu'aucun type ne relie : la composition
`data` de `NotificationService.createNotification` (TS) et les lectures `userInfo[...]` de la
NSE (Swift). Deux listes de chaînes, écrites séparément. Diff exhaustif :

**Lu par la NSE, JAMAIS émis par la passerelle** (4 clés) :

| clé | conséquence sur le message pré-enregistré |
|---|---|
| `content` | corps **VIDE** — le défaut hérité |
| `senderName` | **aucun nom d'expéditeur** ; la passerelle émet `senderDisplayName`, et la ligne 563 du MÊME fichier le lit correctement |
| `originalLanguage` | langue **fabriquée** (`"en"` en repli) sur un enregistrement dont la résolution du Prisme dépend ensuite |
| `isEncrypted` | second verrou E2EE inerte (le premier, `encryptedContent`, tient) |

**Émis par la passerelle POUR la NSE, jamais lu par elle** (2 clés) :

| clé | commentaire du producteur | ce que la NSE fait à la place |
|---|---|---|
| `createdAt` | « GW5 — persistance NSE : timestamp serveur » | `Date()` — l'horloge du device |
| `messageType` | « GW5 — … + type du message » | dérivé du mime de la pièce jointe |

> **Un helper à un appelant est un inventaire (leçon 271) ; un CHAMP à zéro lecteur est une
> intention.** `createdAt` et `messageType` ont été ajoutés, documentés et testés côté serveur
> pour un consommateur qui ne les a jamais lus. La mesure du cycle 122 — « `translatedContent`
> n'est lu par aucun client » — n'était pas un cas isolé : c'est la forme normale d'un contrat
> dont les deux moitiés vivent dans deux langages et qu'aucun type ne relie.

## Ce qu'il manquait vraiment, et pourquoi ce n'est PAS `content`

Émettre `content` serait rouvrir la fuite du cycle 123 : le texte NU d'un message protégé
(éphémère / vue unique / flouté) repartirait sur le fil pendant que la bannière affiche son
placeholder. La passerelle a raison de ne pas l'émettre.

Le texte que la NSE peut légitimement enregistrer est celui qu'elle est sur le point d'AFFICHER
— déjà descendu par le Prisme (cycle 121), déjà masqué par la protection (cycle 123). Il ne lui
manque qu'une chose pour l'écrire : **savoir dans quelle langue il est**, et savoir qu'il est
bien le contenu du message et non un placeholder ou une transcription.

Or la passerelle le sait déjà, et depuis le cycle 123 elle le sait sous forme de TYPE :
`PreviewPrismBasis`. Le correctif est donc une projection de plus de ce type — la troisième :

| projection de `PreviewPrismBasis` | cycle | question à laquelle elle répond |
|---|---|---|
| `previewPrismSource` | 123 | qu'est-ce qui TRADUIT cet aperçu ? |
| garde de `servedTranslationFields` | 123 | que peut-on transporter à côté ? |
| **`storableMessageLanguage`** | **124** | **cet aperçu peut-il être ENREGISTRÉ comme le message ?** |

## Plan

### Lot 1 — passerelle (exerçable ici)

- [x] `storableMessageLanguage()` — la langue du contenu, émise SEULEMENT quand le corps servi
      EST le contenu du message (base `message-content`, hors verrou `notificationLocKey`).
- [x] `messageOriginalLanguage` sur `data`, sous la garde `showPreview` : sa PRÉSENCE est le
      discriminant qui autorise la NSE à enregistrer un corps. Aucun texte neuf sur le fil.
- [x] Témoins RED d'abord, sur la charge REMISE — présence, et absence sur les quatre familles
      qui ne doivent pas l'émettre (protégé, transcription, locKey, mode privé).

### Lot 1 bis — la JUMELLE, dans le MÊME lot

Les TROIS éventails poussent un `messageId`, donc les trois font pré-enregistrer une bulle.

- [x] `createReplyNotification` et `createMentionNotification` émettent le champ depuis
      `MessagePrismSource.originalLanguage`, déjà relue — aucune lecture de plus.
- [x] 4 témoins RED d'abord (présence, distinction origine/servie, base protégée).

### Lot 2 — NSE (Swift, non compilable ici ; helper PUR + témoins XCTest)

- [x] `NotificationPayloadHelpers.prePersistedMessageFields(...)` — helper pur, testé, qui rend
      les quatre champs corrigés depuis le fil réel.
- [x] `prePersistMessage` le consomme : corps servi, langue servie, `createdAt` serveur,
      `senderDisplayName`.
- [x] Témoins dans `NotificationPayloadHelpersTests.swift`.

## Revue

### Ce qui a été mesuré

Le contrat de fil push entre la passerelle (TS) et la NSE (Swift), clé par clé, dans les deux
sens : **4 clés lues jamais émises** (`content`, `senderName`, `originalLanguage`,
`isEncrypted`) et **2 clés émises pour ce consommateur et jamais lues** (`createdAt`,
`messageType`, toutes deux commentées « persistance NSE » côté producteur).

### Ce qui a été corrigé

- **Passerelle** — `storableMessageLanguage()`, troisième projection de `PreviewPrismBasis`, et
  le champ `messageOriginalLanguage` sur les TROIS éventails (message, réponse, mention). Aucun
  texte neuf sur le fil : la clé est un code de langue, et sa PRÉSENCE est le discriminant qui
  autorise l'enregistrement local.
- **NSE** — `prePersistedMessageFields` / `prePersistedMessageTypes`, helpers PURS, et
  `prePersistMessage` qui les consomme : corps servi, langue servie, horodatage SERVEUR,
  `senderDisplayName`. N4 (le mime décide du rendu média) reste prioritaire.

### Gates

| gate | résultat |
|---|---|
| suite gateway complète | **848/848 suites, 19431 témoins** |
| suite shared complète | **108 fichiers, 2578 témoins** |
| `services/gateway` `tsc --noEmit` | 0 erreur |
| `packages/shared` build (`tsc`) | 0 erreur |
| RED initial | **6 témoins** (2 message + 4 jumelles) |
| mutation « garde retirée » | **3 témoins tombent** |
| mutation « champ hors garde `showPreview` » | **1 témoin tombe** |
| Swift | **non compilable ici** (aucune chaîne Swift dans le conteneur) — 14 témoins XCTest posés sur le helper pur, déjà membre des deux cibles |

Détail raisonné : `tasks/realtime-sync-audit-2026-08-24-cycle124.md`.
Leçon : `tasks/lessons.md` § 273 (rédigée en 272, renumérotée à la fusion — `main` a pris 272
pendant que ce lot était en CI).

### Suivi MESURÉ (non hérité)

- Les éventails RÉPONSE et MENTION ne poussent ni `createdAt` ni `messageType` : leur bulle
  reste ordonnée par l'horloge du device. Combler exige d'élargir `MessagePrismSource` — un lot
  à part.
- `isEncrypted` reste lue et jamais émise : sans conséquence tant qu'`encryptedContent` tient le
  verrou E2EE. Piège armé, pas panne.
- La bannière d'un vocal joint toujours le fichier ORIGINAL — les pistes audio traduites ne sont
  attachées à aucune notification. Hérité du cycle 123, inchangé.
