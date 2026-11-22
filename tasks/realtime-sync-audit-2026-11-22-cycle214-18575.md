# Cycle 214 — observer n'est pas annoncer : `hasGap` ne couvre que les clients qui envoient leur curseur (#18575)

*Routine « amélioration continue du temps réel », sur la tête de `dev` `1daa0057c`
(qui porte le cycle 213).*

## Ce que le cycle 213 a rendu ambigu

Le cycle 213 a donné au web un observateur de `_seq` (#18601). La clause LOCKSTEP
et le `hasGap` de `GET /sync` énuméraient jusque-là « les clients qui portent le
curseur » — une seule liste pour DEUX propriétés distinctes :

| propriété | qui la tient | ce qu'elle donne |
|---|---|---|
| **OBSERVER** le curseur à la réception | iOS, Android, et le web depuis #18601 | la détection de trou EN SESSION |
| **ANNONCER** le curseur à `GET /sync` | iOS, Android — **pas le web** | la détection à la RECONNEXION (`hasGap`) |

`hasGap = seq !== undefined && seq < checkpointSeq - GAP_THRESHOLD` : un client
qui n'envoie pas `seq` n'est jamais couvert. Lire « le web observe » comme « le
web est couvert » serait donc faux — et c'est précisément le risque que #18575
demandait de rendre VÉRIFIABLE plutôt que d'écrire en prose.

## Ce que le lot écrit

- **Un second relevé** dans `seq-lockstep.ts` : `seqAnnouncingPlatforms()`, qui
  mesure des sources qui ANNONCE un curseur à `/sync`, et son inventaire
  `PLATFORMS_ANNOUNCING_SEQ` (`ios`, `android`), plus la raison ÉCRITE de
  l'absence du web — sa porte de rattrapage est `?updatedSince=`
  (`conversations-delta.ts`), une décision, pas un oubli.
- **Un témoin à deux sens** dans le cliquet : la mesure égale l'inventaire.
- **Les deux clauses renvoient à la mesure** au lieu de l'affirmer : celle de
  `hasGap` (`routes/sync/index.ts`) et celle d'`emitWithSeq`.

## La preuve de ROUGE, et ce qu'une mutation incomplète a appris

| mutation | ce qui tombe |
|---|---|
| l'inventaire prétend que le web annonce | « annoncent le curseur (mesuré) : android, ios » ≠ attendu |
| iOS cesse d'annoncer | « … : android » ≠ attendu |

**La seconde mutation a d'abord rendu VERT**, parce qu'elle ne neutralisait
qu'UN site : iOS en a **deux** (`ConversationSyncEngine+DeltaSync.swift` et
`ConversationSyncEngine+Chargement.swift`). Ce n'est pas un défaut du relevé —
c'est le relevé qui a appris au lot ce que le lot croyait savoir. La mutation
complète le fait tomber.

> Une mutation qui ne rend pas rouge accuse d'abord la MUTATION, pas le témoin :
> ici elle était incomplète, et sa complétion a révélé un second site
> d'annonce que personne n'avait énuméré.

## Le discriminant, et le piège qu'il évite

Une ANNONCE est un argument nommé `seq` dont la valeur lit un curseur
(`\bseq\s*[:=]\s*[^;\n]*\blastSeq\b`). La borne de mot sur `\bseq` est ce qui
empêche `lastSeq:` — une DÉCLARATION de propriété, dont le talkie du web porte
trois — d'être comptée comme un argument. Mesuré : 2 sites iOS, 1 Android, 0 web.
Un relevé qui mesure la popularité d'un mot plutôt qu'une propriété est le défaut
que le cycle 107 a payé.

## Deux prérequis d'environnement rencontrés, aucun défaut

- `packages/shared/dist` périmé : le `byIdJoinLink` que `dev` venait d'ajouter
  n'y était pas (5 rouges au cycle 213, résolus par `bun run build`).
- **Client Prisma périmé** : `joinLinkPausedAt` est au `schema.prisma` et pas
  dans `prisma/client` — `tsc` de la passerelle rougissait sur
  `routes/communities/join-link.ts`. `npx prisma generate --generator client`
  rend l'arbre propre. Les deux sont les prérequis que le `CLAUDE.md` racine
  documente, et la CI les fait elle-même.

## Gates

| gate | résultat |
|---|---|
| `vitest socket-seq-lockstep-gate` | **7 verts / 0 rouge**, et rouge sur les deux mutations |
| `tsc --noEmit` (`packages/shared`) | **0** |
| `tsc --noEmit` (passerelle, après `prisma generate`) | **0** |
