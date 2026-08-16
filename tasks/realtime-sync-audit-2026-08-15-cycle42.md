# Cycle 42 — la préférence tenait à trois portes sur quatre

Piste ouverte à la fin du cycle 41, instruite ici. Elle annonçait un manque de
synchronisation ; l'instruction a trouvé, au même endroit, une **fuite de
confidentialité** que personne n'avait nommée.

## Ce que la piste annonçait

> `routes/messages.ts` (`POST /messages/:id/read`) émet un `type: 'read'` qui ne
> construit **pas** `actorReadSync` : il diffuse le résumé et rien d'autre.
> [...] Reste à établir si cette route est encore empruntée par un client avant
> de décider entre l'aligner et la retirer.

Les deux questions ont été instruites. La réponse à la seconde a changé la
portée de la première.

## Constat — quatre portes, trois formes, une seule règle

`read-status:updated` avait **quatre** émetteurs REST. Trois avaient convergé,
cycle après cycle, vers une forme commune. Le quatrième —
`POST /messages/:messageId/status` — n'y était jamais entré, et il lui manquait
trois pièces distinctes :

| Pièce manquante | Conséquence | Gravité |
|---|---|---|
| La préférence `showReadReceipts` n'est **jamais consultée** | Un utilisateur ayant retiré ses accusés diffuse quand même un événement NOMINATIF (`participantId`, `userId`, `type: 'read'`, horodaté) à toute la conversation | **Confidentialité** |
| `lastReadAt` / `unreadCount` ne partent nulle part | Les autres appareils de l'acteur ne recalent jamais leur curseur de lecture | Synchro |
| Aucun `conversation:unread-updated` | Leur badge non plus | Synchro |

La première n'était pas dans la piste. Elle a été trouvée en comparant les
quatre portes ligne à ligne, et c'est la plus grave des trois : **un réglage de
confidentialité qui tient à trois portes sur quatre n'est pas un réglage, c'est
un défaut de couverture** — il suffit d'entrer par la quatrième.

### Ce que la fuite exposait exactement

Il faut être précis, parce qu'une moitié du payload était déjà protégée :

- `summary` **retire déjà** les opt-out de ses compteurs, numérateur ET
  dénominateur (`MessageReadStatusService._loadReadReceiptOptOuts`). Cette
  moitié-là ne fuyait pas.
- Ce qui fuyait, c'est **l'identité de l'acteur** : `participantId`, `userId`,
  `type: 'read'`, `updatedAt`. C'est exactement ce que `showReadReceipts`
  protège — « j'ai lu ton message, à cet instant ». Les trois autres portes
  suppriment l'événement ENTIER dans ce cas ; celle-ci l'émettait intact.

Que le compteur soit assaini ne rachète rien : c'est le nom qui est la donnée.

## La question « aligner ou retirer », et pourquoi c'est aligner

Un sous-agent a balayé `apps/web`, `apps/ios`, `apps/android`,
`packages/MeeshySDK` et `tests/`. Résultat net : **aucun client n'appelle cette
route.** Tous marquent leurs lectures ailleurs — `mark-as-read` / `mark-read`
sur `conversations/*` pour les trois plateformes. Les seuls appelants restants
sont deux fichiers de tests gateway. La route porte d'ailleurs son propre
verdict depuis longtemps :

```
// TODO: Cette route utilise l'ancien système de MessageStatus
// Elle devrait être remplacée par /conversations/:conversationId/mark-as-read
```

La retirer était donc tentable. Elle ne l'a pas été, pour deux raisons :

1. **Le dépôt ne prouve pas l'absence d'appelant, il prouve l'absence d'appelant
   DANS LE DÉPÔT.** Les builds iOS et Android déjà installés ne se relisent pas
   dans `git`. Supprimer un point d'entrée REST public transforme un marquage de
   lecture en 404 SILENCIEUX pour ces installations — une régression invisible
   côté serveur et non réparable côté client.
2. **Le retrait d'une surface publique est une rupture de contrat, pas un
   à-côté.** Elle mérite sa dépréciation annoncée, pas d'être emportée au
   passage par un correctif de confidentialité.

La route est donc **alignée**, et le retrait reste ouvert comme travail à part
entière.

## Correctif — une seule forme, pas une quatrième copie correcte

Écrire une quatrième copie correcte aurait reproduit exactement le mécanisme qui
a produit le défaut. Les quatre copies ont été remplacées par **une unité
partagée**, `services/gateway/src/socketio/broadcastReadStatus.ts`, qui tient
ensemble les trois propriétés qu'aucune copie ne tenait toutes :

1. **La préférence décide de la DIFFUSION, jamais de la LECTURE.** Le curseur
   est avancé par l'appelant avant d'arriver ici. Taire l'accusé ne doit jamais
   faire perdre à l'acteur la trace de ce qu'il a lu — d'où le badge émis sur
   les **deux** branches de la préférence.
2. **Deux payloads pour deux audiences** (acquis du cycle 41, désormais tenu à
   un seul endroit) : `summary` à tout le monde, `lastReadAt` / `unreadCount` à
   la seule room personnelle de l'acteur, qui est exclu de l'éventail.
3. **Deux identités, deux rôles** (acquis du cycle 38) : `actorUserId`, le champ
   nullable du contrat, et `personalRoomKey = userId ?? participantId`, la clé
   de room qui ne l'est jamais.

### Les quatre sites, après

| Site | Avant | Après |
|---|---|---|
| `message-read-status.ts` × 3 (`mark-as-read`, `mark-as-received`, `delivery-receipt`) | fonction locale de 130 lignes + garde de confidentialité recopiée au site d'appel + recalage manuel du badge sur la branche muette | appel de l'unité |
| `conversations/messages.ts` × 1 (fermeture `broadcastReadStatus`) | copie quasi identique, garde intégrée | appel de l'unité |
| `routes/messages.ts` × 1 | copie amputée des trois pièces | appel de l'unité |

Les deux fermetures et la fonction locale sont supprimées. Le fan-out
`emitToConversationParticipants` reste ce qu'il était : l'unité l'utilise.

### Un gain de latence, pas un coût

L'ancienne forme attendait la préférence, **puis** lançait les lectures. La
nouvelle lance la préférence et l'arriéré de l'acteur **en parallèle**, puis le
résumé et les participants une fois la préférence connue. La profondeur reste de
deux allers-retours, et le chemin chaud perd l'attente sérielle.

Contrepartie assumée et mesurable : sur la branche « accusés retirés » d'un
`read`, un `findUnique` indexé de plus est émis (le curseur est lu même quand la
diffusion sera tue). Il porte le `unreadCount` du badge, qui part sur cette
branche aussi — l'ancienne forme le relisait de toute façon, par un autre appel.

## Ce que ça coûte aux clients : rien

Le contrat de fil (`ReadStatusUpdatedEventData`) est **inchangé** — mêmes
champs, mêmes noms, mêmes audiences. Les trois plateformes n'ont rien à migrer.
Ce qui change est du comportement serveur sur une route qu'aucune d'elles
n'appelle, plus le regroupement interne des trois autres.

## Gates

- [x] 6 RED discriminants vus rouges avant correctif, 5 non-régressions vertes
      d'emblée dans le même fichier
- [x] `bunx tsc --noEmit` gateway : 0 erreur
- [x] Suite gateway complète : **726 suites, 17 771 tests, tout vert**
- [x] `broadcastReadStatus.ts` : 100 % lignes / branches / fonctions
- [x] `message-read-status.ts` : 100 % lignes après suppression de la copie
- [x] 2 doubles de test préexistants complétés — ce sont les DOUBLES qui étaient
      incomplets, pas le correctif qui régresse (détail ci-dessous)
- [x] CHANGELOG + README socketio + journal + leçon 277

### Les deux doubles réparés, et pourquoi ce ne sont pas des régressions

1. **`messages-extended.test.ts`** — son double `io` ne connaissait pas
   `.except()`. Le fan-out l'appelle depuis le cycle 41 ; sur ce double, la
   chaîne jetait un `TypeError` avalé par le `try/catch` de la route, et
   **aucune émission n'était observable**. Il lui manquait aussi
   `conversationReadCursor` et un `PrivacyPreferencesService` doublé. Le double
   décrivait un autre programme que celui qu'on livre.
2. **`read-status-anonymous-participant.test.ts`** — son premier `app` n'était
   pas décoré d'un `socketIOHandler`. L'unité abandonne avant de consulter la
   préférence quand aucun socket n'est joignable (il n'y aurait rien à taire) ;
   l'assertion « la préférence est demandée EN TANT QU'anonyme » exigeait donc
   qu'un `io` existe. L'invariant testé — la paire `(identité, isAnonymous)` —
   est intact et toujours vérifié.

## Écarté délibérément

**Retirer `POST /messages/:messageId/status`.** Voir plus haut : aucun appelant
dans le dépôt ne prouve aucun appelant sur le terrain, et le retrait d'une
surface publique mérite sa propre dépréciation.

**Faire porter la garde de confidentialité au site d'appel, comme avant.**
C'était la forme en place, et c'est celle qui a laissé passer le défaut :
recopiée trois fois, oubliée la quatrième. Une règle recopiée à chaque porte est
une règle qui finira par manquer à une porte.

**Toucher aux deux émetteurs SOCKET du même événement.** Voir la piste
ci-dessous : ils émettent des `received`, en lot, pour plusieurs destinataires à
la fois — la garde par acteur n'y a pas la même forme et exige son propre cycle.

## Piste pour le cycle suivant — repérée, NON livrée

Les deux émetteurs restants de `read-status:updated` — le drain hors ligne
(`MeeshySocketIOManager`, ~ligne 700) et `MessageHandler.autoDeliverToOnlineRecipients`
— **ne consultent pas `showReadReceipts`**, alors que les deux portes REST qui
émettent le même `type: 'received'` la consultent. C'est la même classe de
défaut que celui corrigé ici, sur l'autre transport.

Ce n'est pas un simple report du correctif : ces deux-là diffusent un accusé de
livraison **pour plusieurs destinataires à la fois**, dans un seul fan-out. La
préférence est par PERSONNE ; l'appliquer exigerait soit de découper le fan-out
par destinataire, soit d'admettre que la livraison automatique n'est pas une
divulgation soumise à ce réglage — ce qui est défendable, et qui est peut-être
la vraie réponse. **Établir laquelle des deux avant d'écrire quoi que ce soit**,
et regarder si `shouldShowReadReceipts` est censée gouverner les `received` du
tout : les portes REST le font, la documentation ne le dit nulle part.
