## Leçon 285 — un gate posé sur le frère IMMÉDIAT ne garde pas l'opération d'à côté, et le commentaire qui l'énonce se lit comme s'il valait pour les deux (2026-08-24, cycle 125)

Deux appels CONSÉCUTIFS, dans la même méthode, sur le même `userInfo` :

```swift
prePersistMessage(from: bestAttemptContent.userInfo)   // écrit en base
postDeliveryReceipt(from: bestAttemptContent.userInfo) // envoie un accusé
```

Le second porte un gate de type, et son commentaire nomme exactement le cas
exclu :

> Push types that mean "a new message was delivered to this recipient".
> **Reactions and social events also carry a messageId, but they do not
> constitute message delivery, so they are excluded.**

Le premier n'en a jamais eu. Il écrivait donc une ligne `MessageRecord` pour
TOUT push portant `messageId` + `conversationId` + `senderId` — dont
`message_reaction`, dont le `messageId` désigne le message RÉAGI (celui que le
destinataire a le plus souvent ÉCRIT) et le `senderId` le RÉACTEUR. `localId`
étant la clé primaire et `save()` un UPSERT, recevoir une réaction hors
application **vidait le texte du message en base, lui réassignait son auteur, le
rehorodatait à l'instant du push et jetait ses pièces jointes, ses réactions et
sa citation.**

> **Un invariant écrit chez le voisin conforme ne garde que le voisin** (cycles
> 83, 85, 97). La variante de ce cycle est la plus retorse : les deux sites sont
> ADJACENTS. On lit le gate en lisant le défaut, et cette proximité même fait
> qu'on le lit comme une propriété de la MÉTHODE plutôt que d'un seul appel.
> La distance n'est ni ce qui protège ni ce qui expose (cycle 98) — mais
> l'adjacence, elle, ANESTHÉSIE.

### Le discriminant juste n'est pas le type, c'est la NATURE de l'écriture

Refermer le gate de type ne suffisait pas, et s'en contenter aurait été le pari
que le cycle 124 dénonce (« une garde qui n'a qu'un verrou n'a pas de garde »).
`user_mentioned` appartient légitimement à la famille « un message arrive » —
SAUF sur le chemin d'ÉDITION, où `notifyNewlyMentioned` en produit une pour un
message EXISTANT.

Le second verrou ne parle donc pas du type mais de ce que l'écriture EST : une
bulle pré-enregistrée est un **PLACEHOLDER** pour la fenêtre qui précède la
synchro REST.

> **Un placeholder ne remplace jamais une donnée canonique. L'écriture est un
> INSERT, jamais un UPSERT** — et c'est vrai quel que soit le type qui l'amène,
> donc vrai des types qu'on n'a pas encore énumérés. Une garde qui tient sur
> une ÉNUMÉRATION est en retard par construction (cf. l'`include` du
> `tsconfig`, cycle 105 bis) ; une garde qui tient sur la NATURE de l'opération
> ne l'est pas.

### « Qui AFFICHE ce que le serveur résout ? » a une jumelle

Le cycle 122 a demandé qui AFFICHE ce que le serveur résout. Le même fil pose
la question symétrique, et elle se mesure aussi vite :

> **Qui LIT ce que le serveur envoie POUR lui ?**

GW5 pose `createdAt` et `messageType` sur le fil push en les nommant « champs de
persistance NSE ». Mesuré : `grep` de ces deux noms sur tout
`apps/ios/MeeshyNotificationExtension/` rend **zéro** occurrence. La bulle était
horodatée à l'instant de la REMISE (donc rangée au bas de la conversation dès
qu'un push arrivait en retard) et typée depuis le seul MIME de la pièce jointe
(donc `text` pour un `location`, et pour tout push où la pièce jointe ne voyage
pas — `showPreview: false`).

Un champ nommé pour son lecteur se lit comme un champ lu. Il n'y a rien à
trouver : la clé est là, bien nommée, bien remplie, et personne ne l'ouvre.
C'est la forme du cycle 96 (`signedPreKey.signature` transportée par quatre
couches et vérifiée par aucune) appliquée à un contrat de payload.

### Une clé de payload est un contrat à DEUX bouts, et le lire de mémoire produit les deux erreurs symétriques

| cycle | le fil | la NSE | effet |
|---|---|---|---|
| 124 | ne porte PAS `content` / `originalLanguage` | les lit | bulle vide, étiquetée « en » |
| 125 | porte `senderDisplayName` / `senderUsername` / `senderAvatar` | lit `senderName` | bulle ANONYME |

Dans les deux cas la LECTURE compile, ne lève pas, et rend un repli plausible.
Et dans le cas 125, la lecture JUSTE vit **cent lignes plus bas dans le même
fichier** (`applyCommunicationIntent`).

> Devant tout `userInfo["…"]` / `data["…"]`, la question n'est pas « ce champ
> a-t-il un sens ? » mais **« qui l'ÉMET, sous ce nom exact ? »**. Les deux
> bouts d'un contrat de payload ne se vérifient que l'un CONTRE l'autre — et
> c'est cher : deux cycles consécutifs ont trouvé leur défaut principal là.

### Corollaire de forme : ce qui se décide sans la base sort de la base

`prePersistMessage` n'était testable par rien — il vit dans une cible
`app-extension`, hors de `@testable import Meeshy`, et il ouvre un `DatabasePool`.
Les quatre défauts étaient donc, tous les quatre, dans du code que le dépôt
n'avait aucun moyen d'interroger.

La décision entière (type, identités, E2EE, horodatage, type de média, noms
d'expéditeur, langue) est partie dans `NotificationPayloadHelpers` — Foundation
seul, déjà compilé DANS `MeeshyTests` — avec `now` passée en PARAMÈTRE : la
seule impureté devient une entrée. Le site d'écriture ne garde plus que le
verrou qui ne peut pas se décider hors de la base (« cette ligne existe-t-elle
déjà ? »).

> **Un code que rien ne peut interroger accumule les défauts silencieusement,
> et la mesure de sa dette est le nombre de défauts qu'on y trouve du premier
> coup.** Ici : quatre.

### Et un payload push est un `Record<string, string>` : l'absence y voyage comme `''`

`createNotification` pose `|| ''` sur presque toutes ses clés. Lire
`userInfo["originalLanguage"] as? String ?? "en"` prend donc la chaîne VIDE pour
une valeur, et l'écrit dans une colonne NOT NULL. Distinguer « absent » de
« vide » une fois, à la lecture (`nonEmptyString`), est ce qui évite d'avoir à
y penser à chaque champ — même famille que « `[]` par défaut décide à la place
du consommateur » (cycle 116), un étage plus bas.
