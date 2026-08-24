# Cycle 124 bis — le contrat de fil push, mesuré dans les DEUX sens

> **Ce lot a CONVERGÉ avec le cycle 124 (PR #3465), mergé sur `main` pendant qu'il était en CI.**
> Les deux passes ont instruit le même suivi et trouvé le même défaut. Celle de #3465 a atterri
> la première ; **sa conception est reprise EN ENTIER**. Ce journal ne consigne que ce que cette
> passe ajoute par-dessus, et pourquoi son propre choix de conception a été abandonné.

## Point de départ — le suivi MESURÉ, laissé ouvert par les cycles 122 ET 123

> `prePersistMessage` (NSE iOS) lit `userInfo["content"]`, une clé que le payload push ne porte
> pas — la bulle écrite au démarrage à froid a un corps VIDE jusqu'à la synchro REST.

Deux fois nommé, deux fois différé (« Swift, non exerçable ici »). Le motif est réel et il ne
couvre pas la moitié TypeScript du défaut.

## La mesure — clé par clé, dans les DEUX sens

C'est l'apport de MÉTHODE de cette passe, et il va au-delà du suivi. Le payload push est un
contrat entre deux fichiers qu'aucun type ne relie ; le diff exhaustif rend **six** écarts :

| sens | clés | statut |
|---|---|---|
| lu par la NSE, jamais émis | `content`, `originalLanguage` | **clos par #3465** |
| lu par la NSE, jamais émis | `senderName` (la passerelle émet `senderDisplayName`) | **clos ici** |
| lu par la NSE, jamais émis | `isEncrypted` | ouvert, nommé |
| **émis POUR la NSE, jamais lu** | `createdAt`, `messageType` (« GW5 — persistance NSE ») | **clos ici** |

> **Un helper à un appelant est un inventaire (leçon 271) ; un CHAMP à zéro lecteur est une
> intention.** La moitié « émis, jamais lu » n'était nommée par aucun des deux suivis, ni par
> #3465.

## La conception : celle de #3465, et pourquoi la mienne a été abandonnée

Les deux passes ont buté sur la même question — **quel texte la NSE a-t-elle le droit
d'enregistrer ?** — et y ont répondu différemment.

| | #3465 (retenue) | cette passe (abandonnée) |
|---|---|---|
| ce qui voyage | `content` = l'**ORIGINAL**, `originalLanguage` son étiquette | le texte **SERVI** (déjà traduit) |
| clé sur le fil | les noms que la NSE lit **déjà** | une clé neuve, dont la présence autorisait l'écriture |
| changement client | **aucun** | réécriture de `prePersistMessage` |

**#3465 a raison, et la raison est le modèle de données** : `MessageRecord.content` EST le champ
d'origine. Écrire le texte servi dedans produit un enregistrement cohérent mais FAUX sur sa
propre sémantique.

Mon objection — « émettre `content` rouvre la fuite du cycle 123 » — **était fausse**, et #3465
le démontre : le couple n'est posé que sous la même base `message-content` + verrou
`notificationLocKey`, sous `showPreview`, et il est retiré à la seconde coupe du budget APNs.
La bonne question n'était pas « ce champ peut-il fuir ? » mais « **sous quelle garde ?** », et
la garde existait déjà.

## Plan

- [x] Fusion MANUELLE de `origin/main`, conception de #3465 reprise en entier.
- [x] `prePersistedMessageFields()` — le prédicat de #3465, posé EN LIGNE dans
      `createMessageNotification`, devient un SITE partagé.
- [x] **La JUMELLE** : les TROIS éventails poussent un `messageId`, donc les trois
      pré-enregistrent une bulle. Réponse et mention émettent désormais le couple depuis
      `MessagePrismSource.originalLanguage`, déjà relue — **aucune lecture de plus**.
- [x] NSE : `senderDisplayName` (la clé réellement émise), horodatage SERVEUR, `messageType`
      du fil ; N4 (le mime) reste prioritaire pour le rendu média.
- [x] Témoins réécrits sur les noms de fil de #3465.

## Revue

### Gates

| gate | résultat |
|---|---|
| répertoire `notifications/` + `messaging/` | **32 suites, 619 témoins** (dont les deux suites de #3465) |
| suite gateway complète | voir ci-dessous |
| `services/gateway` `tsc --noEmit` | 0 erreur |
| `packages/shared` build (`tsc`) | 0 erreur |
| mutation « câblage des jumelles retiré » | **6 témoins tombent** |
| mutation « garde de `prePersistedMessageFields` retirée » | **7 témoins tombent** (3 des miens, 4 de #3465) |
| Swift | non compilable ici — gardé par la CI (`Build app (app + cibles de test)`) |

La seconde mutation est la mesure qui compte pour le refactor : **la garde de #3465, déplacée
dans le helper partagé, fait toujours tomber SES témoins.** Un refactor qui déplace une règle
doit prouver que la règle tombe encore depuis son nouveau site.

### Détail

- `tasks/realtime-sync-audit-2026-08-24-cycle124-bis.md`
- `tasks/lessons.md` § 274 (rédigée 272, renumérotée deux fois — cf. la note dans la leçon)

### Suivi MESURÉ (non hérité)

- `isEncrypted` reste lue et jamais émise — piège armé, pas panne.
- Les éventails RÉPONSE et MENTION ne poussent ni `createdAt` ni `messageType` : leur bulle
  reste ordonnée par l'horloge du device. Combler exige d'élargir `MessagePrismSource` — lot à
  part.
- La bannière d'un vocal joint toujours le fichier ORIGINAL (hérité du cycle 123).
