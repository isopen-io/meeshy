# Cycle 155 — un gate vert qui ne gardait pas le site fautif, et une traduction qui n'arrive jamais

*2026-11-13. Branche `claude/exciting-planck-rcsqai`, partie de `dev` à
`ddbe3cd6b1`, puis rapprochée de `fbda0d41f9` avant fusion.*

**Livré** : #18066 (le rouge bloquant de `dev`, fusionné par la PR #18067).
**Mesuré et consigné, non livré** : #18069 (défaut Android sévère) et #18070
(la cause de classe). La raison de ne pas livrer est écrite plus bas, et elle
est de l'outillage, pas de l'arbitrage.

---

## Lot A — `dev` était rouge, et le rouge était un vrai défaut

Le job bloquant « Qualité TS (bun) » tombait depuis #18054 sur :

```
src/lib/push/shell-push-runtime.ts(38,54): error TS2366:
Function lacks ending return statement and return type does not include 'undefined'.
```

#18052 avait ajouté `{ route: 'community' }` à `NotificationTarget`. **Quatre**
sites routent un tap de notification ; trois l'avaient reçu — le résolveur, le
jumeau classique `public/sw-push.js`, et iOS
(`RootNotificationNavigator.swift:120`). Le quatrième, non : `shellPushUrl`, le
mappage de la coque Capacitor.

Et le rouge n'était pas qu'un rouge. `shellPushUrl` est consommé en
`env.navigate(env.urlOf(...))` : un `switch` non exhaustif **rend `undefined`**,
il ne lève pas. Le tap était consommé, la bannière disparaissait, rien ne
s'ouvrait. La loi 4 à l'envers, sans symptôme à rapporter.

### Ce que le gate existant ne pouvait pas voir

`scripts/check-push-target-parity.mjs` est né d'un **jumeau déclaré** :
`sw-push.js` est un script classique qui ne peut pas importer `href`, donc sa
table vit en double, donc un outil interdit la dérive. Toute sa structure parle
de ce couple.

`shellPushUrl` n'est le jumeau de personne. C'est ce qui l'a tenu hors du champ
de l'outil.

> **Un gate indexé sur une RELATION (« A suit B ») ne balaie pas les sites qui
> n'ont pas de relation déclarée, même quand ils servent la même loi.**

### La moitié fine : ce que `tsc` garde, et ce qu'il ne garde pas

Le trou était partiellement tenu par le compilateur — c'est ce qui rend la
leçon utile. `tsc` attrape un membre d'union **sans `case`** (le TS2366). Il
n'attrape pas un `case` qui rend la **mauvaise** adresse :
`href('communityMembers', …)` compile, et mène le doigt ailleurs.

> **Un type exhaustif garde la COMPLÉTUDE d'une bijection, jamais sa JUSTESSE.**

La seconde moitié est exactement la dérive que le gate existe pour interdire, et
elle n'était gardée sur aucun des quatre sites.

### Le correctif

La table `ADRESSES` du gate est **exportée** — une table, trois consommateurs —
et le témoin de la coque la **rejoue** au lieu d'en recopier les attentes. Une
famille de destination ajoutée au critère de fin interroge désormais le
résolveur, le worker et la coque d'un coup.

**Vu rougir, les deux dérives** : sans le `case`, `undefined` ; avec un `case`
qui mène à `/communities/c1/members`, l'écart — ce que `tsc` laisse passer.

Gates : `tsc` vert (c'était le rouge de `dev`), gate de parité vert (13
destinations, 16 adresses), 382 témoins push/notifications verts. **« Qualité TS
(bun) » est repassé au vert sur `dev` au SHA `c7dece74`.**

---

## Lot B — le balayage qui a suivi, et ce qu'il a trouvé

Le lot A pose une question : *combien de sites servent cette loi ?* Appliquée
aux événements temps réel, elle a rendu deux résultats opposés.

### Les NOMS sont entièrement gardés — et c'est un résultat

255 noms au contrat, iOS 219, Android 202, web 174. **Zéro divergence** : aucun
écouteur mort, aucun littéral en dur dans la passerelle, aucun nom construit
dynamiquement, aucun désaccord tiret/underscore. Trois gates le tiennent et ils
sont verts. Il n'y avait rien à corriger, et le dire est utile : c'est la moitié
du problème qui est close.

### La FORME des charges n'est gardée par rien — et elle est cassée

`message:translation` ne se décode **jamais** sur Android (#18069).

| | contrat et émetteur | miroir Kotlin |
|---|---|---|
| forme | `{ messageId, translations: [ … ] }` | `messageId`, `conversationId`, `targetLanguage`, `translatedContent` à plat |
| site | `translation.ts:33-37`, `buildTranslationEvent.ts:76-92` | `SocketEvents.kt:113-120` |

Les trois champs sont non-nullables et sans défaut ; `conversationId` n'existe
nulle part dans la charge. `ignoreUnknownKeys = true` tolère les clés **en
trop**, jamais les **manquantes** ⇒ `MissingFieldException` à chaque événement,
avalée par `SocketInboundRoute.guarded` dans une ligne Timber qui ne nomme ni la
charge ni le message.

Les deux seuls écrivains temps réel de traduction consomment cet événement. Le
lecteur anglophone sur Android voit donc la bulle dans la langue de l'auteur, et
elle ne change jamais — jusqu'à un refetch REST. **Le Prisme Linguistique, le
principe fondateur du produit, devient fonction d'un rechargement.** La file
hors ligne tombe avec, puisqu'elle rejoue la même charge.

iOS et web portent la forme imbriquée : c'est Android qui diverge, seul.

### C'est le jumeau EXACT d'un incident que le dépôt a déjà documenté

`services/gateway/CLAUDE.md` (§ ~456) raconte `participant:role-updated` —
`newRole` émis, `role` exigé, « aucun changement de rang n'a jamais atteint le
trombinoscope Android, et le témoin était vert ». Celui-là est réparé. Celui-ci
ne l'est pas, et les témoins Android sont verts pour la **même** raison : ils
construisent l'événement dans le langage du client et sautent le décodeur.

> **La prose portait déjà la bonne règle.** C'est le troisième cas de ce cycle —
> avec `firebase-messaging-sw.js` et le doc-comment du gate de parité — où une
> règle juste, écrite, relue, n'a arrêté personne. Une règle en prose ne couvre
> que ce que son outil exprime.

Le gate manquant est #18070 : un champ REQUIS dans un miroir client est une
exigence que le contrat ne connaît pas. Le contrat dit ce qui est ÉMIS ; le
miroir décide ce qui est EXIGÉ ; rien ne compare les deux. Deux pièges sont déjà
armés sur le même mécanisme (`ReactionUpdateEvent.userId`,
`AttachmentUpdatedEvent.attachmentId` : requis côté Kotlin, optionnels au
contrat), et le domaine social n'a pas été confronté à ses émetteurs.

---

## Pourquoi #18069 n'est pas livré par ce cycle

**`android.yml` n'a ni `workflow_dispatch` ni déclencheur `pull_request`** : il
ne tourne que sur `push` vers `main` et `dev`. Un lot Android n'est donc
prouvable qu'une fois FUSIONNÉ. Cette session tourne dans un conteneur cloud où
`dl.google.com` est refusé par le proxy : elle ne compile pas Android, et
`:core:model` seul ne suffit pas (les consommateurs vivent dans `sdk-core` et
`feature/chat`).

Livrer le correctif ici reviendrait à pousser du Kotlin non compilé dans `dev`
pendant un gel dont le critère de fin est précisément « `dev` vert » — c'est ce
qui a coûté le revert de K19 le matin même (`ed239b3fe`). Le défaut est donc
**mesuré, daté, et inscrit en issue avec sa forme de correctif vérifiée contre
iOS**, pas livré à moitié. Le dépôt a une règle pour chaque moitié : on ne
laisse pas un piège armé au motif que personne n'a marché dessus (cycle 84), et
on n'annonce pas une panne qu'on n'a pas mesurée (cycle 103). Celle-ci est
mesurée ; elle attend une session qui peut la prouver.

---

## Suivis ouverts

| # | ce que c'est | état |
|---|---|---|
| #18066 | le rouge de `dev`, la coque et la table rejouée | **fermée** par #18067 |
| #18069 | `message:translation` ne décode jamais sur Android | ouverte — demande une session avec le SDK Android |
| #18070 | aucun gate sur la FORME des charges socket | ouverte — se pose dans `packages/shared/__tests__/ci/`, donc prouvable sans Android |

Leçon du cycle : `tasks/lessons/2026-11-13-un-gate-qui-rejoue-une-table-ne-garde-que-les-sites-qu-il-interroge.md`.
