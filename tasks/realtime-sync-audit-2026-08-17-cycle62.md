# Cycle 62 — le dispositif qui fabriquait des défauts verts est retiré

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

## 6. Vérification

| Gate | Résultat |
|------|----------|
| `socketio` gateway (jest, bun) | **93 suites / 2101 tests verts** |
| `_emitPresenceSnapshot` (ciblé) | 15/15 verts (10 existants + 5 nouveaux) |
| `presence.service.test.ts` web | **53/53 verts** sans la table inerte |
| ROUGE prouvé | 4 mutations, 5 témoins tombés, 0 dommage collatéral |
| `git diff` production | **vide** — aucun fichier de production touché |

Parité locale : `bun install --ignore-scripts`, `prisma generate --generator
client`, `packages/shared` reconstruit (le `moduleNameMapper` pointe sur `dist/`).

## 7. Écarté, et pourquoi

**Retirer les 23 autres fabriques `jest.mock('@meeshy/shared/*')` d'`apps/web`.**
Le balayage est fait (24 fichiers au total, celui-ci compris) et le mécanisme est
prouvé général, mais c'est un diff qui touche 23 fichiers de test dont chacun
demande sa propre exécution de contrôle. Livré comme piste bornée plutôt que comme
suppression de masse — voir piste n°1.

**Reconstruire la « Leçon 230 » manquante** (§8 découvertes). Son texte survit
verbatim dans `services/gateway/CLAUDE.md` § Critical Gotchas, mais le réécrire
sous un numéro que peut-être une autre branche occupe déjà produirait deux leçons
230 de textes différents. Signalé, pas inventé.

**Garder la copie « pour ses cas de cache de présence »**, comme son en-tête le
proposait. Écarté : ces cas sont exactement ceux que le harnais réel exécute
mieux, et une copie conservée « pour un sous-ensemble » reste une copie qui
dérive.

## 8. Découvert en chemin, NON traité

**La « Leçon 230 » n'existe pas dans `tasks/lessons.md`.** Elle y est citée depuis
**six** sites — `services/gateway/CLAUDE.md:257`,
`socketio/__tests__/MeeshySocketIOManager.test.ts:3496`,
`socketio/CallEventsHandler.ts:1812`,
`__tests__/unit/socketio/CallEventsHandler-signal-payloadless-crash.test.ts:15`,
`routes/conversations/messages.ts:516`,
`docs/superpowers/specs/2026-08-13-call-transcript-journal-design.md:244` — alors
que le carnet s'arrête à la 227. Rien n'est perdu opérationnellement (le contenu
est verbatim dans le CLAUDE.md du gateway), mais six commentaires de code
promettent une preuve introuvable. Même classe que ce cycle : une référence qui
atteste ce qui n'est pas là. La 222 est dans le même cas.

**`use-encryption.test.tsx` stubbe 10 méthodes de `SharedEncryptionService` et
n'en assert AUCUNE.** Vérifié : zéro occurrence de `expect(mock…)` sur ces
doubles. C'est donc de l'échafaudage mort, actif ou non — pas un témoin dont
l'inertie changerait le sens. Le seul candidat « comportemental » des 24 est ainsi
écarté : le dépouillement de la piste n°1 ne porte que du code mort.

## 9. Pistes pour le cycle 63 — repérées, NON livrées

1. **Les 23 fabriques `jest.mock('@meeshy/shared/*')` restantes d'`apps/web`**
   (§5, §7). Bornée : liste obtenue par
   `grep -rl "jest.mock('@meeshy/shared"`, mécanisme prouvé, aucun cas
   comportemental (§8). Recette de contrôle : retirer la fabrique, relancer la
   suite du fichier — verte ⇒ la fabrique était morte.
2. **La cause exacte de l'inertie** (§5.1) : clé de registre distincte, ou
   hoisting SWC après l'import. Départage possible en inspectant la sortie
   transformée d'un fichier minimal. Utile au-delà du ménage : elle dit si un
   module partagé peut être substitué du tout, et par quel chemin.
3. **La « Leçon 230 » fantôme, et la 222** (§8) — décider entre restaurer et
   retirer les six renvois.
4. **Le garde « aucun `invalidateQueries` sur un PRÉFIXE d'une clé de query
   infinite paginée par OFFSET »** (cycle 60 bis piste n°2) — intacte. Une seule
   exemption légitime.
5. **Identifier le flake de `packages/shared`** (cycle 61 bis piste n°2) — non
   reproduit ce cycle non plus.
6. **`conversation:unread-updated` sans `bridge` au reconnect** (cycle 61 bis) —
   décision de contrat.
7. **`conversations.infinite()` en pagination keyset** (cycles 59/60) — changement
   de contrat de route.
8. **La file hors-ligne par APPAREIL** (cycle 58 §7) — intacte, plusieurs cycles.
9. **`attachment:reaction-*` et `message:consumed` sans lecteur web** (cycle 57) —
   décision produit.
10. **Le code mort des trois hooks de préférences React Query** (cycle 55) —
    intacte.
11. **Les deux ÉVÉNEMENTS avant les deux FUSIONS côté iOS** (cycles 51/52/53) —
    intacte, bloquée sur l'absence de Xcode.
12. **`PUT /conversations/:id` accepte toujours de renommer un DM** — cosmétique.
13. **Les DEUX sockets web sont-elles la bonne architecture ?** (cycle 58) —
    intacte. Ce cycle ajoute à la classe générale sa variante la plus pure : non
    pas « deux mécanismes pour un job », mais **deux témoins du même contrat qui
    s'opposent**, l'un dans le harnais réel et l'autre dans une copie, sans que
    rien ne puisse le signaler puisque le second ne peut pas tomber.
