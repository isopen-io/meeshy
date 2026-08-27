# Itération 278 — Le cache GeoIP est BORNÉ et son expiration enfin PLANIFIÉE (fuite mémoire fermée)

## État actuel

`services/gateway/src/services/GeoIPService.ts` maintient un cache mémoire
`geoCache: Map<string, { data, expiry }>` alimenté à CHAQUE requête portant un
contexte de requête (`getRequestContext` → `lookupGeoIp`) : connexion,
inscription, lien magique, transfert de numéro. Le TTL est de 5 minutes.

Deux faits, mesurés à la lecture du code :

1. **L'expiration n'est appliquée qu'À LA LECTURE, jamais au balayage.**
   `lookupGeoIp` ignore une entrée dont `expiry <= now`, mais ne la SUPPRIME
   pas. Une entrée expirée reste donc en mémoire tant que la MÊME IP ne revient
   pas la réécrire.
2. **`cleanGeoCache()` — la fonction qui purge les entrées expirées — n'était
   appelée NULLE PART en production.** Son doc-comment disait « call
   periodically » ; l'unique appelant hors production était la suite de tests.
   L'infrastructure de jobs de fond (`BackgroundJobsManager`, cinq jobs planifiés)
   ne la connaissait pas.

Conséquence : la carte grandit avec le **nombre d'IP DISTINCTES vues depuis le
démarrage du processus** — une par client, jamais rendue. Sur un processus
long-vécu exposé à Internet, c'est une fuite mémoire non bornée (dimension 3 :
optimisation mémoire — « aucune rétention, caches non bornés »).

## Problèmes identifiés

- **Fuite non bornée** : rétention d'une entrée par IP distincte, sans plafond
  et sans purge planifiée.
- **Capacité manquante non câblée** : le purgeur EXISTAIT, testé, mais n'avait
  aucun ordonnanceur — une incohérence, pas une fonctionnalité à écrire.
- **Aucun plancher de mémoire même avec purge** : une purge périodique seule ne
  borne pas une rafale d'IP distinctes ENTRE deux purges, ni le cas où toutes
  les entrées sont encore fraîches.

## Causes racines

- `cleanGeoCache` a été écrit avec l'intention « à appeler périodiquement » mais
  le câblage à `BackgroundJobsManager` n'a jamais suivi — la même classe que la
  « scission de module inachevée » : une capacité complète et injoignable.
- Le cache n'a jamais porté de plafond : l'expiration paresseuse (skip-on-read)
  donne l'ILLUSION d'un cache borné (il ne SERT jamais de périmé) tout en
  RETENANT tout ce qui est périmé.

## Impact métier

Croissance mémoire lente et continue du processus gateway proportionnelle à la
diversité du trafic (clients mobiles nomades, réseaux d'entreprise, scanners).
À terme : pression GC, éviction du cache de plus utile, voire OOM du conteneur
sur un déploiement de longue durée. Aucune perte de correction fonctionnelle —
purement une régression de ressource, du type que le `CLAUDE.md` qualifie de
BUG (une lenteur/rétention n'est pas de la dette).

## Impact technique

Minimal et localisé au gateway :
- `GeoIPService.ts` : plafond `MAX_GEO_CACHE_ENTRIES` + éviction FIFO O(1) au
  point d'écriture (`rememberGeo`), `geoCacheSize()` d'observabilité,
  `cleanGeoCache()` rend désormais le nombre d'entrées retirées.
- Nouveau job `geo-cache-cleanup.ts` (patron identique aux jobs existants :
  `start`/`stop`/`runNow`, intervalle 10 min = 2× TTL, `unref`, purgeur injecté
  pour la testabilité).
- `BackgroundJobsManager` : le job rejoint `startAll`/`stopAll`/`runAll`/`getJobs`.
Aucun contrat client, aucune forme de réponse, aucune migration.

## Évaluation du risque

- **Éviction** : FIFO au plafond seulement (10 000 entrées) — l'entrée la plus
  ancienne est aussi la plus proche de son TTL, donc la moins utile. Nul effet
  sur le comportement nominal (au régime normal, le cache reste sous le plafond,
  drainé par le job).
- **Purge planifiée** : ne retire QUE les entrées expirées (invariant inchangé
  de `cleanGeoCache`), donc ne peut jamais servir une donnée fraîche moins
  souvent.
- **Retour de `cleanGeoCache`** : passage de `void` à `number` — rétro-compatible
  (les appelants existants l'utilisent en instruction).

## Améliorations livrées

1. Plafond dur + éviction FIFO O(1) : le cache ne dépasse JAMAIS
   `MAX_GEO_CACHE_ENTRIES`, quelle que soit la diversité du trafic.
2. `GeoCacheCleanupJob` planifié (10 min) et câblé à `BackgroundJobsManager` :
   les entrées expirées sont RENDUES, plus seulement ignorées.
3. `geoCacheSize()` + `cleanGeoCache(): number` pour l'observabilité et pour
   permettre d'attester le plafond directement.

## Bénéfices attendus

- Mémoire du gateway bornée par construction sur cette surface.
- Une future dérive (retrait de l'éviction, désordonnancement du job) fait
  rougir sa suite en CI.
- Cohérence : la purge rejoint les cinq autres jobs de fond au lieu d'être une
  capacité orpheline.

## Complexité d'implémentation

Faible. TDD RED→GREEN : deux suites neuves (`GeoIPService.bound.test.ts` — 4
tests, `geo-cache-cleanup.test.ts` — 13 tests), un fichier de production neuf,
deux fichiers de production touchés, une suite de manager étendue.

## Critères de validation

- Suites neuves vertes : `GeoIPService.bound.test.ts` (4), `geo-cache-cleanup.test.ts` (13).
- Non-régression : 221/221 tests verts sur `__tests__/unit/jobs` +
  `__tests__/unit/services/GeoIPService` (15 suites).
- `tsc --noEmit` du gateway à 0 erreur.
- Contre-épreuve PROUVÉE : sous une mutation de `rememberGeo` en `set` non borné
  (éviction retirée), l'invariant `geoCacheSize() <= MAX` du test de plafond
  tombe en nommant exactement le défaut (rétention non bornée).

## Suivi / dimensions restantes (issues distinctes, non empilées ici)

Hérité du suivi de l'itération 277 (durcissement sécurité), non traité ici :
- **Réaction TOCTOU** : cap de 5 non atomique (count→assert→create), 5 sites.
- **Éviction de la map anti-spam mentions** par ordre d'INSERTION plutôt que par
  ancienneté d'ACTIVITÉ — même famille « cache/borne mémoire » que la présente,
  candidat naturel à l'itération suivante.
