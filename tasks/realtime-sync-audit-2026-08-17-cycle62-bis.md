# Cycle 62 bis — le dispositif qui fabriquait des défauts verts est retiré

> **Note d'intégration.** Une AUTRE exécution de la routine a livré un cycle 62
> pendant celui-ci (`claude/keen-hamilton-clgz4v`, PR #3186 — « la reconnexion
> effaçait le pont ✦ de TOUTES les lignes »). Ce journal est donc renuméroté
> *bis*, suivant la convention des cycles 54/56/57/60/61. Les deux sont
> indépendants — celui-là porte sur l'effacement du pont au reconnect
> (`apps/web/hooks/queries`), celui-ci sur le repli d'un fichier de test du
> gateway — et ont fusionné sans conflit de CODE.
>
> **Un seul recouvrement, et il est instructif : les deux cycles ont trouvé et
> corrigé le MÊME défaut collatéral**, `main` rouge sur le garde des surfaces de
> masquage (§ ci-dessous, et leur §7). Les deux diagnostics concordent —
> `reads: 2`, `applications: 1`, déclaration `IN_MEMORY_HIDING_SURFACES` — ce qui
> est la meilleure confirmation possible qu'il n'y avait pas de fuite. La
> résolution retient **le marqueur le plus strict des deux** :
> `hiddenMessageIds?.has(` et non `hiddenMessageIds`, parce que le nom seul est
> satisfait par la CONSTRUCTION de l'ensemble et survit à la suppression de son
> USAGE — mesuré ici. C'est le thème de ce cycle appliqué à sa propre correction.

> Piste n°1 du cycle 61 bis, livrée. Elle ne corrigeait pas un défaut : elle
> retirait un dispositif qui en FABRIQUE — un fichier de test qui recopiait le
> corps de deux méthodes de production et testait la copie.

## 1. D'où vient la piste

Du cycle 61 bis, qui l'a instruite en la subissant. Ce cycle-là a réparé
`_emitUnreadCountsSnapshot` (la pastille de reconnexion refusée aux invités de
lien partagé) et a constaté que **la suite censée garder cette méthode est restée
VERTE après le fix**, en attestant toujours l'ancien comportement — y compris son
témoin nommé « does NOT call `_emitUnreadCountsSnapshot` for anonymous users ».

Cause : `src/__tests__/unit/socketio/MeeshySocketIOManager.presenceSnapshot.test.ts`
ré-implémentait `_emitPresenceSnapshot` et `_emitUnreadCountsSnapshot` dans des
helpers `*Impl`, puis testait ces copies. Aucune de ses 13 assertions ne pouvait
passer au ROUGE quand la production changeait.

Le dépouillement était fait et la piste bornée : le balayage
`grep -rln "Impl = async function\|Impl = function\|Impl: async function"` sur
`services/gateway/src`, `apps/web` et `packages/shared` ne rendait **qu'un seul
fichier**, celui-ci.

## 2. Ce que la copie avait déjà démenti

Elle n'était pas seulement incapable de tomber : elle avait **déjà dérivé sur le
point le plus cher du contrat**, et dans le sens le plus dangereux.

La production place le drain de la file hors-ligne et l'instantané de pastille
**APRÈS** le `try/catch`, délibérément et avec le commentaire qui l'explique :
l'instantané de présence est cosmétique (« qui est en ligne »), le rejeu de la
file est destructif et c'est le SEUL déclencheur de reconnexion qui le fasse. Un
accroc Mongo transitoire sur la construction de l'instantané ne doit jamais
échouer le rejeu.

La copie plaçait les deux appels **DANS** son `try` :

```ts
// la copie
try {
  … construction de l'instantané …
  (this as any)._drainPendingMessages(userId, isAnonymous).catch(() => {});
  (this as any)._emitUnreadCountsSnapshot(socket, userId, isAnonymous).catch(() => {});
} catch (error) { logger.error('snapshot failed', error); }
```

Soit l'inverse exact de la régression que le fichier annonçait garder en tête de
son propre en-tête (« Drain on cache-hit (regression fix) »). Le harnais du vrai
manager, lui, porte le témoin juste — et vert — depuis un cycle antérieur
(`…still replays the offline delivery queue when the presence-snapshot build
throws`). Les deux coexistaient : un témoin qui prouve la règle, et une copie
qui prouvait son contraire, à deux répertoires d'écart.

Autres dérives mesurées dans la même copie : TTL de cache à 30 s contre 60 s en
production, et aucun appel à `_applyPresencePrefs` — la copie ignorait donc
entièrement la couche de préférences de confidentialité (masquage
`isOnline`/`lastActiveAt`) que la production applique sur les DEUX branches.

## 3. Ce qui est livré

**Le fichier est supprimé** (375 lignes), et ses 13 témoins sont rendus au harnais
du vrai manager après vérification, un par un, de ce qui y était déjà couvert.

Six témoins ajoutés à `src/socketio/__tests__/MeeshySocketIOManager.test.ts` —
ceux dont la copie portait le seul exemplaire :

| témoin | ce qu'il garde |
|---|---|
| `…on a WARM presence cache (the dominant fast-reconnect path)` | les deux appels de queue sont inconditionnels sur cache CHAUD — le cas dominant d'une reconnexion rapide (TTL 60 s) |
| `…on a warm cache for an anonymous reader too` | même chemin, pour la population rebranchée au cycle 61, clé `Participant.id` + `isAnonymous=true` |
| `…even when the reader has no active conversation` | zéro participant n'éteint pas la queue de méthode |
| `never lets a rejected drain become an unhandled rejection` | le `.catch` de la promesse DÉTACHÉE (Node 22 tue le process sans lui) |
| `never lets a rejected unread snapshot become an unhandled rejection` | idem, second appel |
| `…when the cursor read returns no count` | participants présents, calcul par curseur muet ⇒ rien à émettre |

Les sept autres étaient déjà couverts par le harnais réel (témoins du cycle 61
sur `_emitUnreadCountsSnapshot`, sections 24 et 34 sur `_emitPresenceSnapshot`) —
vérifié témoin par témoin avant suppression, pas au volume.

### 3.1 Le témoin que la copie ne POUVAIT pas porter

Un `.catch` sur promesse détachée ne se prouve pas par le retour de son appelant :
la promesse est abandonnée, donc l'appelant résout `undefined` qu'elle soit gardée
ou non. Le témoin « swallowed » de la copie attestait donc son `try/catch` — pas
le `.catch`, la seule des deux gardes qui compte ici (§ Critical Gotchas, `void
p`).

D'où `captureUnhandledRejections()` : on écoute `process.on('unhandledRejection')`
autour de l'appel, puis on franchit la phase « check » (`setImmediate`), moment où
Node tranche après le drainage de la file de microtâches.

## 4. Le ROUGE, prouvé témoin par témoin

Chaque témoin ajouté a été mis en face de la mutation qu'il NOMME, sur la
production, puis la production restaurée :

| mutation appliquée à `_emitPresenceSnapshot` | témoins tombés |
|---|---|
| `if (this.presenceSnapshotCache.has(userId)) return;` avant les deux appels | les 2 témoins de cache chaud (+ 1 témoin existant) |
| `if (participantRows.length === 0) return;` dans la branche cache-miss | le témoin « no active conversation » |
| `.catch` retiré de l'appel `_drainPendingMessages` | le témoin d'unhandled-rejection du drain |
| `.catch` retiré de l'appel `_emitUnreadCountsSnapshot` | le témoin d'unhandled-rejection de la pastille |

Aucune mutation n'a fait tomber un témoin qu'elle ne visait pas. `git diff` sur
`MeeshySocketIOManager.ts` est **vide** au terme de la campagne : la production
n'est pas touchée par ce cycle.

## 5. Deuxième livraison — la table inerte de `presence.service.test.ts`

Piste n°8 du carnet (cycle 56 §5), même famille : un dispositif qui se lit comme
une source de vérité et ne prouve rien.

`apps/web/__tests__/services/socketio/presence.service.test.ts` portait un
`jest.mock('@meeshy/shared/types/socketio-events', …)` recopiant **21 constantes**
du contrat partagé. Retiré, 53 témoins toujours verts.

### 5.1 Le mécanisme, mesuré — et la cause du cycle 56 n'est PAS établie

Le cycle 56 attribuait l'inertie à ceci : « la fabrique, enregistrée sous le
spécifieur non mappé, n'intercepte jamais le module réellement chargé ». Deux
expériences de ce cycle donnent un tableau plus précis, et cette explication-là
n'y survit pas telle quelle :

1. **L'inertie est réelle et générale.** Un fichier minimal de 8 lignes qui mocke
   `@meeshy/shared/types/socketio-events` puis en lit
   `SERVER_EVENTS.PRESENCE_SNAPSHOT` reçoit la valeur **COMPILÉE**
   (`'presence:snapshot'`), pas celle de sa fabrique. Reproduit sous `--no-cache`.
   Confirmé indépendamment sur le fichier réel : en remplaçant
   `PRESENCE_SNAPSHOT` par une chaîne absurde, aucun des 53 témoins ne tombe —
   alors que le service enregistre ses handlers PAR cette constante et que les
   témoins déclenchent par littéraux (`socket._trigger('presence:snapshot', …)`).
2. **Mais le spécifieur de `jest.mock` passe BIEN par le mapper.** Un
   `jest.mock('@meeshy/shared/encryption__unused', …)` échoue en
   `createNoMappedModuleFoundError` — le mapper a réécrit vers un chemin `dist`
   inexistant. L'enregistrement est donc résolu et mappé ; l'importateur reçoit
   quand même le module réel.

Les deux faits coexistent, ce qui exclut « enregistré sous le spécifieur non
mappé » comme cause. La cause exacte (clé de registre distincte du module chargé,
ou hoisting de la fabrique après l'import dans la transformation SWC) demande sa
propre instruction — piste n°2. Le fait OPÉRATIONNEL, lui, est établi et suffit à
la règle : **toute fabrique `jest.mock('@meeshy/shared/<sous-chemin>')` dans
`apps/web` est du code mort.**

Ce n'est pas une urgence de justesse — ces suites tournent contre le vrai contrat
compilé, la meilleure référence possible. C'est une urgence de LECTURE : une table
recopiée dérive, et se lit comme une autorité.