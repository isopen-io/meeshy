# Cycle 210 — un témoin qui n'attestait que la présence de son voisin (#20272)

*Routine « amélioration continue du temps réel », 2026-11-21. Lot livré depuis
la tête de `dev` `c57460f50`, qui contient le cycle 209 (#20264, `9c10ed5b5`).*

## Ce que le cycle a corrigé

`apps/web/src/routes/thread-sheets.test.tsx` § « la date de la fiche suit la
langue d'INTERFACE, jamais le Prisme du lecteur (#10817) » épingle
`document.documentElement.lang = 'en'` et affirme un rendu anglais. Son
`beforeAll` ne chargeait que les catalogues **`fr`**.

| commande | avant | après |
|---|---|---|
| `bun test src/routes/thread-sheets.test.tsx` (SEUL) | 32 verts, **1 rouge** | **33 verts, 0 rouge** |

Le rouge n'était pas une assertion mais une exception du catalogue
(`Catalogue d'interface « en » lu avant d'être chargé`) : le registre des
catalogues est un état de MODULE, `bun test` partage le processus entre
fichiers, et le témoin passait parce qu'un VOISIN
(`src/components/message-detail-sheet.test.tsx`) avait chargé « en » avant lui.

Correctif : **la langue épinglée voyage avec son catalogue, dans le même bloc**
— une ligne, `await loadInterfaceCatalog('en')`, dans le témoin qui épingle.

## Ce que la mesure a tranché, et ce qu'elle a refusé

**La classe a UN membre, et c'est l'isolement qui le dit.** Les **61** fichiers
de `apps/web` qui épinglent `documentElement.lang` ont été joués UN PAR UN : un
seul rouge, celui-ci. La lecture ne pouvait pas le dire — un `beforeAll` en
`fr` à côté d'un `lang = 'en'` n'est un défaut que si le témoin REND quelque
chose qui traduit.

**Le remède élégant a été refusé sur cette mesure.** Un helper « épingler la
langue + charger son catalogue + restaurer » adopté dans 1 site sur 61
ajouterait une seconde façon de faire sans retirer la première ; aucun helper de
ce genre n'existe dans `src/test-support/`, les 61 fichiers roulant le leur. Le
coût d'un helper se juge sur la taille MESURÉE de la classe.

**Le second catalogue n'a pas été ajouté, parce qu'aucun témoin ne le demande.**
`MessageDetailSheet` lit AUSSI `translateMessagePieces` (rangées Modifier,
Épingler, Supprimer). Mesuré : sans `loadMessagePiecesCatalog('en')`, les 33
témoins passent seuls — ces rangées ne sont pas rendues ici. La ligne n'a donc
pas été écrite ; le commentaire du témoin dit ce qu'un témoin futur devra
charger s'il les rend en « en ».

## Observation non reproduite, dite plutôt que rangée

`src/components/composer-sources.test.tsx` a rendu `1 fail` pendant le balayage
d'isolement, et quatre verts de suite au rejeu (`17 pass / 0 fail` ×4). Aucune
cause nommable, donc aucune issue : une intermittence qu'on ne sait pas
reproduire se DIT.

## Ce que le cycle précédent a laissé en issues

- **#20283** — le gate de perf des effets d'appel : « aucune tâche longue
  pendant un glissé » est le seul invariant que le gate garde DUR sans GPU, et
  il est lui aussi sensible à l'hôte (une tâche de 60 ms à 24 images/s et 20 %
  perdues sur un runner à rendu logiciel ; vert localement et vert à la
  tentative 2 du même run).
- **#20285** — sous bun **1.4.4**, la garde des `act()` abandonnés ne garde
  plus : son témoin rend `0 pass / 5 fail` au lieu de `3 pass / 2 fail`, là où
  la CI (bun 1.3.14) le rend vert, `src/test-support/` et `bunfig.toml`
  inchangés des deux côtés. À connaître avant de bumper `BUN_VERSION` : le bump
  ramènerait la cascade #9481 — et ce témoin-là le dira.

## Gates

| gate | résultat |
|---|---|
| `bun test src/routes/thread-sheets.test.tsx` (seul) | 33 verts / 0 rouge |
| `bun test src/routes/` | voir le commentaire de livraison |
| `tsc --noEmit` (web) | voir le commentaire de livraison |
