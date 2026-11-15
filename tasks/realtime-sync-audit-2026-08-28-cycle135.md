# Cycle 135 — `lastSyncedAt` mesurait « une passe s'est terminée », pas « des données ont été lues »

**Issue** : #4217 (ouverte par le suivi MESURÉ du cycle 134).
**Branche** : `claude/keen-hamilton-p95vxq`.
**Surface** : `apps/web` — le DOUBLE Zustand des préférences que les bulles de
messagerie rendent, et son rattrapage de reconnexion livré au cycle 134.

## Le défaut

`initialize()` posait :

```ts
await get().syncAll();
set({ isInitialized: true, lastSyncedAt: new Date().toISOString() });
```

`syncAll()` ne peut pas échouer : chacun de ses quatre `GET` porte son PROPRE
`try/catch` qui absorbe la panne et résout `void`. Une passe où **aucune**
lecture n'a abouti posait donc l'horodatage exactement comme une passe réussie —
et `partialize` le PERSISTAIT, si bien qu'au chargement suivant le champ restauré
déclarait une fraîcheur qui n'avait jamais existé.

Conséquence sur le mécanisme du cycle 134 : sa clause « aucune passe
d'hydratation » lit `lastSyncedAt === null`. Un onglet ouvert **hors ligne** par
un utilisateur qui revient rendait ses valeurs persistées, déclarait une
hydratation qui n'avait rien lu, et le rattrapage ne pouvait pas le distinguer
d'un démarrage nominal. Le bloc doublé restait périmé jusqu'à un décrochage —
qui, pour un onglet qui vient seulement de trouver le réseau, peut ne jamais
venir.

**Le commentaire du site de câblage disait déjà le contraire du code.**
`StoreInitializer` documentait : « sa clause lit `lastSyncedAt`, que seule une
hydratation RÉUSSIE renseigne — un onglet ouvert hors ligne se rattrape donc à sa
première connexion ». L'intention était écrite, juste, et à la bonne place. Rien
ne l'appliquait.

## Le correctif

**1. Les cinq lectures rendent le succès plutôt que de l'absorber.**
`sync*` : `Promise<void>` → `Promise<boolean>` — `true` ⇒ des données SERVEUR ont
été lues ET appliquées. `false` couvre indistinctement les quatre façons de
n'avoir rien lu (pas de jeton, réseau tombé, statut non-2xx, enveloppe sans
données). L'absorption LOCALE reste : la dernière valeur connue demeure affichée,
une panne réseau n'étant pas la preuve que l'utilisateur a changé d'avis. Ce qui
change est qu'elle se REMONTE.

**2. `syncAll` agrège en `some`, jamais en `every`.** Une lecture qui aboutit a
rempli le store, et c'est ce que l'horodatage doit dire. Exiger les quatre ferait
dépendre l'horodatage du point de terminaison le plus fragile —
`/me/preferences/privacy` a été absent pendant toute une période, son `catch` en
garde encore la trace — et l'aurait alors supprimé à VIE : le rattrapage serait
devenu dû à CHAQUE connexion, pour zéro fraîcheur de plus. Un correctif de
justesse qui installe une requête perpétuelle n'en est pas un.

**3. `initialize()` n'horodate que sur une lecture aboutie**, laisse la valeur
précédente sinon, et DIT l'échec (`error`, sans lecteur de production — c'est un
diagnostic, pas une bannière).

**4. `lastSyncedAt` cesse d'être persisté.** C'est la moitié du défaut qu'aucun
retour de fonction ne pouvait corriger. Le champ répond à UNE question — « cette
SESSION a-t-elle lu des préférences ? » — parce que c'est celle que son unique
lecteur pose. Persisté, il en répondait une seconde (« quand a-t-on lu la
dernière fois ? ») en faisant croire à la première.

Retirer le champ de `partialize` ne suffit PAS : la fusion par défaut de
`persist` repose l'état persisté PAR-DESSUS l'état initial, donc un blob écrit
par la v1 réinjecterait son horodatage à chaque chargement jusqu'à la première
écriture — précisément sur l'onglet hors ligne, qui n'écrit rien. D'où la
**migration v2**, et le passage d'une sortie anticipée à des étapes CHAÎNÉES,
chacune gardée par la version qui l'a introduite.

**5. `isDue` gagne la clause `isInitialized`.** Sans persistance, `lastSyncedAt`
est null au montage de TOUT onglet, y compris nominal : une connexion socket qui
arrive avant qu'`initialize()` ne pose `isLoading` aurait payé deux `GET` que la
passe initiale s'apprêtait à faire. La clause dit « la passe initiale a rendu son
verdict, et il est vide ». Aucun état ajouté — `isInitialized` existe, n'est pas
persisté, et est posé sur TOUTES les branches de sortie d'`initialize()`.

## Ce que l'adversarial re-read a attrapé (avant la CI)

Le passage d'une sortie anticipée (`if (version >= COURANTE) return state`) à des
étapes gardées (`if (from < 1) …`) INVERSE le traitement d'une version ABSENTE.
`persist` transmet `undefined` pour un blob antérieur au versionnage :
`undefined >= 1` est `false` (l'ancien code migrait donc), mais `undefined < 1`
est `false` AUSSI (le nouveau aurait tout sauté). Les deux comparaisons rendent
`false`, et c'est ce qui rend l'inversion invisible à la relecture. La version est
donc normalisée AVANT le test (`typeof version === 'number' && isFinite ? version
: 0`) — **une version absente est la plus ANCIENNE, jamais la plus récente** — et
les étapes vivent dans une table `MIGRATIONS` (`{ to, apply }`) parcourue en
`reduce` : ajouter une v3 est une ligne, et sa garde de version ne peut pas être
oubliée. Témoin dédié : un blob SANS version traverse les deux étapes.

## Gates

| gate | résultat |
|---|---|
| `__tests__/stores/user-preferences-store.test.ts` (+24, 81 au total) | `initialize` n'horodate rien quand rien n'est lu ; laisse l'horodatage PRÉCÉDENT intact ; horodate dès qu'UNE lecture aboutit ; les 4 lectures × 5 branches du contrat (données appliquées / sans jeton / non-2xx / enveloppe vide / réseau tombé) ; `syncAll` en `some` |
| `__tests__/stores/user-preferences-story-visibility.test.ts` (+4, 10 au total) | la v2 retire un `lastSyncedAt` hérité de la v1 ; le retire aussi d'un blob v0 dont la story migre ; **un blob SANS version est traité comme le plus ancien** ; un blob à la version courante est intact |
| `__tests__/lib/preference-rehydration.test.ts` (+2, 10 au total) | l'onglet ouvert HORS LIGNE se rattrape à sa première connexion ; **rien n'est relu tant que la passe initiale n'a pas rendu son verdict** ; le témoin « en vol » est resserré (isInitialized posé, donc seul `isLoading` le retient) |
| `npx jest __tests__/stores __tests__/lib hooks/queries/__tests__` | **86 suites, 1737 témoins verts** (1707 au cycle 134) |
| `bun run test:coverage` (apps/web, la commande de la CI) | **806 suites, 14825 témoins verts**, 21 sautés — la suite web ENTIÈRE, sous `bun` comme la CI (14795 au cycle 134 : +30 témoins) |
| `scripts/check-type-debt.sh` (étape BLOQUANTE de la CI) | `✓ 1194 erreurs de types — la dette n'a pas bougé.` |
| `scripts/check-law-literals.sh` (étape BLOQUANTE de la CI) | `✓ No law literals found in skin files` |
| gateway / iOS / Android | **non modifiés** — aucun contrat de fil touché, le défaut est entièrement côté client web |

## Suivi MESURÉ

- **`syncAll()` lit `/me/preferences/privacy` DEUX fois** au démarrage
  (`syncEncryption` puis `syncPrivacy`), et le rattrapage hérite du même doublon.
  Relevé au cycle 133, non touché au 134, non touché ici : les deux sont deux
  PROJECTIONS de la même ligne, et les fusionner change le contrat des deux
  lectures ainsi que celui de `MIRRORED_CATEGORIES`. Défaut de performance
  préexistant, lot à part.
- **Le bloc `notifications` du store n'a aucun consommateur en production**
  (mesuré au cycle 133 : l'écran `/notifications/preferences` tient son propre
  état local). `syncAll` le lit pourtant à chaque hydratation. Soit il gagne un
  lecteur, soit il sort de la passe — dans les deux cas c'est une décision, pas
  un correctif.
- **`error` n'a aucun lecteur de production.** `initialize()` le pose désormais
  sur l'échec, ce qui est juste, mais personne ne l'affiche : un utilisateur dont
  l'hydratation a entièrement échoué voit des valeurs persistées sans aucun
  signe. La dimension 8 (états dessinés) n'est pas mûre sur cet écran.
