# Cycle 124 bis — le contrat de fil push, mesuré dans les DEUX sens

> **Ce lot a convergé avec le cycle 124 (PR #3465), mergé pendant qu'il était en CI.** Les deux
> passes ont instruit le même suivi et découvert le même défaut ; celle de #3465 a atterri la
> première. **Sa conception est reprise EN ENTIER** — ce document ne consigne que ce que cette
> passe ajoute PAR-DESSUS, et pourquoi son propre choix de conception a été abandonné.

## 1. Le point de départ, commun aux deux passes

Les journaux des cycles 122 et 123 se closent tous deux sur la même ligne :

> `NotificationService.prePersistMessage` côté NSE lit `userInfo["content"]`, une clé que le
> payload push ne porte pas — le message pré-enregistré au démarrage à froid a donc un corps
> VIDE jusqu'à la synchro REST.

Deux fois nommé, deux fois différé au motif « Swift, non exerçable ici ». Le motif est réel
(aucune chaîne Swift dans ce conteneur) et il ne couvre pas la moitié TypeScript du défaut.

## 2. La mesure — clé par clé, dans les DEUX sens

C'est l'apport de méthode de cette passe, et il va plus loin que le suivi.

Le payload push est un contrat entre deux fichiers qu'aucun type ne relie :

- **producteur** : `NotificationService.createNotification`, bloc `data:` (TS) ;
- **consommateur** : les lectures `userInfo[...]` de `MeeshyNotificationExtension` (Swift).

Deux listes de chaînes, écrites séparément, jamais confrontées. Le diff EXHAUSTIF :

### 2.1 Lu par la NSE, JAMAIS émis (4 clés)

| clé | conséquence | statut |
|---|---|---|
| `content` | corps **VIDE** — le défaut du suivi | **clos par #3465** |
| `originalLanguage` | langue **fabriquée** (`"en"` en repli) sur un enregistrement dont la résolution du Prisme dépend | **clos par #3465** |
| `senderName` | **aucun nom d'expéditeur**. La passerelle émet `senderDisplayName` — et `NotificationService.swift:563`, dans le MÊME fichier, le lit correctement pour le cadrage Communication | **clos ici** |
| `isEncrypted` | second verrou E2EE inerte — le premier (`encryptedContent`) tient, donc pas de panne | ouvert, nommé |

### 2.2 Émis POUR la NSE, jamais lu par elle (2 clés)

| clé | commentaire du producteur | ce que la NSE faisait | statut |
|---|---|---|---|
| `createdAt` | « GW5 — persistance NSE : timestamp serveur » | `Date()` — l'horloge du device | **clos ici** |
| `messageType` | « GW5 — … + type du message » | dérivé du mime de la pièce jointe | **clos ici** |

> **Un helper à un appelant est un inventaire (leçon 271) ; un CHAMP à zéro lecteur est une
> intention.** La mesure du cycle 122 — « `translatedContent` n'est lu par aucun client » —
> n'était pas un cas isolé : c'est la forme normale d'un contrat dont les deux moitiés vivent
> dans deux langages qu'aucun type ne relie. **Et il dérive dans les DEUX sens** : la moitié
> « émis, jamais lu » n'était nommée par aucun des deux suivis, ni par #3465.

## 3. La conception : celle de #3465, et pourquoi celle-ci a été abandonnée

Les deux passes ont buté sur la même question — **quel texte la NSE a-t-elle le droit
d'enregistrer ?** — et y ont répondu différemment.

| | #3465 (retenue) | cette passe (abandonnée) |
|---|---|---|
| ce qui voyage | `content` = l'**ORIGINAL** du message, `originalLanguage` son étiquette | le texte **SERVI** (déjà traduit), avec la langue servie |
| clé sur le fil | les noms que la NSE lit **déjà** | une clé neuve, dont la PRÉSENCE autorisait l'enregistrement |
| changement client | **aucun** | réécriture de `prePersistMessage` |

**#3465 a raison, et la raison est le modèle de données** : `MessageRecord.content` EST le champ
d'origine, `originalLanguage` son étiquette, et la traduction a déjà `translatedContent` et son
rang (cycle 121). Écrire le texte servi dans `content` produit un enregistrement cohérent mais
FAUX sur sa propre sémantique — un message espagnol traduit en français y serait enregistré
comme un message français, et la synchro REST devrait le corriger.

L'objection de cette passe — « émettre `content` rouvre la fuite du cycle 123 » — **était
fausse, et #3465 le démontre** : le couple n'est posé que sous la même base
`message-content` + verrou `notificationLocKey`, sous `showPreview`, et il est retiré à la
seconde coupe du budget APNs. La protection tient. La bonne question n'était pas *« ce champ
peut-il fuir ? »* mais *« sous quelle garde ? »*, et la garde existait déjà.

> **Deux passes qui divergent sur une conception ne divergent pas forcément sur une mesure.**
> Les deux ont trouvé le même défaut, la même garde et le même prédicat ; l'écart tenait
> entièrement à ce qu'on croit que `MessageRecord.content` SIGNIFIE.

## 4. Ce que cette passe ajoute, par-dessus #3465

### 4.1 Le prédicat devient un SITE, et sert les trois éventails

#3465 pose son prédicat EN LIGNE dans `createMessageNotification`. Or les **TROIS** éventails de
`messageNotificationFanOut` poussent un `messageId`, donc les trois font pré-enregistrer une
bulle : sans le couple, celle d'une **RÉPONSE** et celle d'une **MENTION** restaient vides
pendant que celle d'un message simple en avait une — le symptôme « deux textes pour un même
message » que les cycles 121 à 123 poursuivent.

`prePersistedMessageFields()` est ce site unique. Les deux jumelles tiennent déjà la langue
d'origine (`MessagePrismSource.originalLanguage`, relue UNE fois pour tout l'éventail depuis le
cycle 122) : **aucune lecture de base supplémentaire.**

C'est la règle de `services/gateway/CLAUDE.md` appliquée à son propre lot — « une règle qui doit
être retapée à chaque site est une règle qu'un site finira par ne pas avoir ».

### 4.2 Les trois champs que #3465 ne touche pas (côté NSE)

| champ | avant | après |
|---|---|---|
| `senderName` | clé jamais émise ⇒ **nil** | `senderDisplayName` → `senderUsername` |
| `createdAt` | `Date()` — horloge du device | l'horodatage **SERVEUR** du fil (ISO 8601, avec ou sans fraction) |
| `messageType` | dérivé du mime seul | le mime reste PRIORITAIRE (N4 : `Message.messageType` vaut `text` pour un vocal légendé) ; le type du fil ne sert qu'en l'absence de pièce jointe |

## 5. Gates

| gate | résultat |
|---|---|
| suite gateway complète | voir § Revue de `tasks/todo.md` |
| `services/gateway` `tsc --noEmit` | 0 erreur |
| `packages/shared` build (`tsc`) | 0 erreur |
| Swift | **non compilable ici** — gardé par la CI (`Build app (app + cibles de test)`) |

## 6. Suivi MESURÉ

- **`isEncrypted` reste une clé lue et jamais émise.** Sans conséquence tant qu'`encryptedContent`
  tient le verrou E2EE — piège armé, pas panne.
- **Les éventails RÉPONSE et MENTION ne poussent ni `createdAt` ni `messageType`.** Leur bulle
  reste donc ordonnée par l'horloge du device. Combler exige d'élargir `MessagePrismSource`, un
  type partagé écrit pour un autre usage : lot à part.
- **La bannière d'un vocal joint toujours le fichier ORIGINAL** — les pistes audio traduites ne
  sont attachées à aucune notification (hérité du cycle 123, inchangé).
