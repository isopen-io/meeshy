# Cycle 70-bis — le seul site de la famille que le compilateur ne contraint pas

**Date** : 2026-08-18
**Branche** : `claude/keen-hamilton-d62bbs`
**Périmètre** : gateway (`__tests__/unit/routes/anonymous.test.ts` — **témoin seul**,
aucune ligne de production)
**Clients touchés** : aucun

---

## 1. D'où vient ce cycle

Deux sessions concurrentes ont instruit la MÊME famille au même moment — « une
conversation close n'admet plus personne » — et la première a mergé (#3207).
La seconde (#3208) était un doublon complet : elle a été **fermée sans merge**,
parce que rejouer son diff par-dessus un correctif déjà vert ne produit que des
conflits.

Ce cycle-ci ne livre donc que ce que la comparaison des deux a fait apparaître,
et qui manque à `main` : **une garde de test, et rien d'autre.**

---

## 2. L'écart

`resolveConversationEntry` exige désormais son paramètre `conversation`, ce qui
fait échouer la COMPILATION de toute porte — présente ou future — qui ne
répondrait pas à la question. C'est la meilleure moitié de #3207.

**La porte anonyme est hors de cette protection** : elle n'appelle pas l'unité
(pas de `User.id` à arbitrer) et appelle `isConversationClosed` directement, sur
la relation qu'elle charge déjà. Sa correction tient donc à deux colonnes d'un
`select`, que rien n'obligeait à demander.

Les trois témoins de clôture livrés par #3207 sur cette porte portent tous sur la
**réponse** qu'on souffle au double, jamais sur la **requête** : le double rend le
`conversation` qu'on lui dicte, `select` ou pas. Ils ne peuvent pas voir une
régression du `select`.

---

## 3. Ce que le typage couvre déjà — et ce qu'il laisse passer

Vérifié par mutation, pas supposé :

| mutation du `select` | compile ? | témoins de #3207 | ce que ça coûte en production |
|---|---|---|---|
| retirer les DEUX colonnes | **non** — TS2559 | — | rien, tsc l'arrête |
| retirer `closedAt` seul | **oui** | **verts** | une conversation `closedAt` sans `isActive: false` redevient joignable |
| retirer `isActive` seul | **oui** | **verts** | **les fils fermés par l'ancien `leave.ts` redeviennent joignables** |

`isConversationClosed` refuse une ligne qui n'a **aucune** propriété commune avec
`ConversationTerminalStateRow` — d'où l'échec de compilation sur le retrait
total. Une colonne sur deux suffit à satisfaire le typage, et c'est exactement
la forme qui casse la lecture double-colonne.

La troisième ligne est celle qui compte : les conversations fermées par l'ancien
`leave.ts` (avant cycle 67) portent `isActive: false` et **aucun** `closedAt`, et
rien ne les rétro-remplit. C'est la population que la lecture double-colonne
existe pour couvrir, et un `select` amputé de `isActive` la rend entièrement à la
porte anonyme — en silence.

---

## 4. La garde

Un témoin, qui assert la REQUÊTE :

```ts
const select = prisma.conversationShareLink.findFirst.mock.calls[0][0]
  ?.include?.conversation?.select
expect(select).toMatchObject({ isActive: true, closedAt: true })
```

**ROUGE prouvé** sous la mutation « `isActive` retiré du `select` » : les **24**
autres témoins du fichier restent VERTS, seul celui-ci tombe. C'est la mesure qui
distingue un témoin d'une décoration (`services/gateway/CLAUDE.md`).

---

## 5. Vérification

| Gate | Résultat |
|------|----------|
| `tsc --noEmit` gateway | ✅ 0 erreur |
| Suites des portes d'entrée (5 fichiers) | ✅ 79/79 |
| Suite gateway complète | ✅ **747 suites / 18 106 témoins** |
| Production | **aucune ligne modifiée** |

---

## 6. Observations portées à l'équipe, non rouvertes

#3207 est mergée et verte ; ces deux points sont des choix de conception, pas des
défauts, et ils ne se rouvrent pas unilatéralement.

1. **`closed` y précède `banned` et `already-member`.** Conséquence : un membre
   ACTIF qui rouvre son propre lien de partage vers un fil clos reçoit un 410 au
   lieu de son ack 200. Défendable — `GET /conversations` ne sert plus ce fil de
   toute façon, donc aucun chemin ne s'en trouve perdu.
2. **Une conversation close n'a plus de porte, mais garde ses liens.** Aucune
   route de clôture ne désactive les `ConversationShareLink` du fil qu'elle
   ferme. #3207 rend la porte inoffensive sans ranger le lien — décision produit,
   déjà nommée dans son § « ce qui n'a PAS été fait ».

---

## 7. Pistes pour le cycle 71

1. **La famille « garde d'ÉCRITURE sans jumelle d'ENTRÉE/LECTURE » n'est pas
   épuisée.** Vérifié par balayage sur `main` : `ReactionHandler`, l'édition de
   message (`routes/messages.ts`) et la création de lien de partage
   (`routes/links/creation.ts`) contrôlent tous `Participant.isActive` et **jamais**
   `Conversation.isActive`/`closedAt`. On peut donc encore réagir, éditer, et
   fabriquer un lien de partage neuf sur un fil terminé.
2. **Un `select` qui alimente un prédicat partagé est un contrat**, et la porte
   anonyme n'était pas le seul site du genre. Les autres appelants
   d'`isConversationClosed` sur relation chargée méritent la même garde de requête.
