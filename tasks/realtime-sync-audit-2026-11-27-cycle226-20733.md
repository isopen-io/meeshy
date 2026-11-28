# Cycle 226 — le cache des salles séparées évince, il ne se vide plus (#20733)

**Date** : 2026-11-27 · **Branche** : `claude/exciting-planck-bh5fer` · **Issue** : #20733 (constat 2 de #20415)

## Le défaut

`separatedRooms.ts` — le cache PARTAGÉ qui dit, pour un ensemble de sujets, quelles
rooms personnelles une diffusion doit TAIRE — tenait `MAX_ENTRIES = 512` et, à
l'insertion qui atteint le plafond :

```ts
if (cache.size >= MAX_ENTRIES) cache.clear();
```

Un **vidage**, pas une éviction. Les 511 entrées innocentes partaient avec la
512e, dont les clés STABLES des **sept diffusions de CONTENU** de #20216 —
celles pour lesquelles ce cache a été écrit, et dont la justification est écrite
sur place : la traduction d'un commentaire diffuse une fois PAR LANGUE CIBLE,
chaque résultat arrivant séparément du pipeline, donc le même couple de sujets
revient sans boucle où passer le résultat.

Un seul appelant à clés VOLATILES suffisait à l'éviscérer en boucle. #20337 a
retiré celui qu'on connaissait (le roster de réaction, passé en `cached: false`),
donc l'urgence était partie — **le mécanisme, lui, restait, et le prochain
appelant à clés volatiles n'aurait eu aucun site où rougir.**

## La politique, et pourquoi ce n'est PAS une LRU

L'issue #20415 écrivait « une éviction LRU (ou au moins par ancienneté) ». Les
deux ne sont pas équivalentes ici, et le lot prend la seconde — par mesure, pas
par économie :

1. **Les périmées d'abord.** Elles ne serviront plus personne : les retirer ne
   coûte à personne. Le balayage complet ne se paie qu'AU plafond, jamais sur le
   chemin de lecture.
2. **Puis la plus ANCIENNEMENT ÉCRITE**, dans l'ordre d'insertion que `Map`
   garantit.

**Une LRU par récence serait moins bonne, et elle aurait coûté plus cher** :

- **un hit ne PROLONGE pas l'entrée**, et ne doit pas — ce serait une fenêtre
  d'expiration glissante, donc #20216 rouvert tant qu'un couple reste chaud. La
  fraîcheur de ce cache ne tient pas au TTL mais à l'INVALIDATION
  (`invalidateSeparationAround`, appelée par les deux seuls écrivains de
  `blockedUserIds`) ; le TTL est un second filet, et un filet qui glisse n'en est
  plus un ;
- **le TTL étant uniforme, l'ordre d'insertion EST l'ordre d'expiration** : la
  plus anciennement écrite est celle dont il reste le moins de vie, donc celle
  dont l'éviction perd le moins. La récence ne le garantit pas — une entrée
  souvent lue mais sur le point d'expirer serait gardée à la place d'une entrée
  fraîche ;
- et une LRU coûterait un `delete` + `set` **sur le chemin de lecture**, qui est
  le chemin chaud.

## Ce que le lot NE répare pas, et qui est écrit

Aucune politique à capacité 512 ne sert un ensemble de travail de 513 clés
relues en boucle : chaque relecture d'une clé sortie en fait sortir la suivante.
C'est vrai de la FIFO comme de la LRU. L'éviction ne promet donc **pas** un taux
de hit — elle promet que la pression coûte UNE entrée par insertion au lieu de
512.

Un témoin le dit à voix haute
(« un balayage séquentiel plus large que le cache reste tout en défauts — et
c'est assumé »), parce qu'un silence se lit comme une garantie. Le seul remède à
un ensemble de travail trop grand reste de ne pas peupler le cache depuis un
chemin à clés volatiles (`cached: false`, #20337) — et de MESURER.

## La mesure que #20415 demandait, et pourquoi `size` ne suffit pas

« une mesure du taux de remplissage réel en production » : une lecture
instantanée de `size` ne prouve rien — un cache à 300 entrées peut avoir atteint
le plafond mille fois dans la minute. `separationCacheStats()` rend donc
`{ size, max, evictions }`, et **`evictions === 0` est l'affirmation utile** : le
plafond n'a jamais été atteint depuis le démarrage. Sous pression, un
`logger.warn` au plus une fois par minute le dit dans les journaux de
production — une entrée par rafale, pas une par éviction.

## Preuve

- **Le ROUGE est prouvé** : sous le `cache.clear()` revenu, trois des cinq
  témoins tombent (`size: 1, evictions: 0` au lieu de `512, 1` ; l'entrée vivante
  relue après un balayage de périmées ; le plafond). Les deux qui restent verts
  le sont par construction — l'un documente une limite INCHANGÉE, l'autre garde
  la propriété de fraîcheur que ce lot ne touche pas.
- `npx jest src/socketio` : **195 suites, 3 047 témoins verts**, dont les six
  suites de séparation (#20216, #20236, #20337, #20338, #20429, #20430).
- `npx tsc --noEmit -p tsconfig.json` : 0 erreur.

## Ce que ce lot n'a pas touché

Les deux autres constats de #20415 restent OUVERTS, et pour deux raisons
différentes qu'il faut distinguer :

- **constat 1 — l'oracle `count > userIds.length`** : c'est une décision de
  produit (assumer l'écart par écrit, ou servir `count = userIds.length` sur le
  chemin sync, ce que #20337 a écarté parce que le même commentaire divergerait
  d'un lecteur à l'autre). Elle ne se tranche pas dans un cycle d'audit.
- **constat 3 — l'exclusion pilotée par un tiers** : sa sortie est #20410 (un
  roster coupé de la charge retire le troisième sujet, donc l'exclusion entière).
  Le borner ici serait un correctif qui se périme.
