# Analyse — Itération 252 : un second `TranslationCache`, mort, homonyme du vivant

## Current state

Le gateway porte **DEUX classes nommées `TranslationCache`**, dans deux
répertoires frères :

| fichier | design | câblé en production ? |
|---|---|---|
| `src/services/message-translation/TranslationCache.ts` | LRU **mémoire** (`Map`), clé `messageId_source_target`, static `generateKey` | **OUI** — `MessageTranslationService` l'instancie (`new TranslationCache(1000)`) et l'interroge à deux sites (`:554`, `:3123`) |
| `src/services/TranslationCache.ts` | cache **Redis** (`CacheStore` + sha256), similarité par n-grammes, TTL, stats | **NON** — aucun import de production |

La seconde (racine `services/`) est accompagnée d'un test de **1212 lignes**
(`__tests__/unit/services/TranslationCache.test.ts`) qui l'exerce intégralement.

## Problems identified

`src/services/TranslationCache.ts` est du **code mort**, exactement au sens que
l'itération 250 (PR #3368) vient d'établir pour `_findUsersForLanguage` :

```
$ grep -rn "services/TranslationCache" --include="*.ts" . | grep -v message-translation
services/gateway/src/__tests__/unit/services/TranslationCache.test.ts:107: import … '../../../services/TranslationCache'
```

- **Zéro import de production** dans tout le monorepo (le seul consommateur est
  son propre test).
- **Aucun chargement dynamique** (`require(`/`import(` sur ce chemin : néant).
- **Aucun barrel** ne la ré-exporte (`services/index.ts` n'existe pas ; la
  ré-export `message-translation/index.ts` pointe l'AUTRE classe).
- Le vrai cache de traduction, celui que `MessageTranslationService` interroge,
  est `message-translation/TranslationCache` — un LRU mémoire au design tout
  autre (pas de Redis, pas de similarité).

Deux défauts en découlent :

1. **Homonymie trompeuse (défaut principal).** Deux types `TranslationCache`
   dans des répertoires frères : un lecteur qui ouvre « le » `TranslationCache`
   a une chance sur deux de lire une implémentation que la production n'exécute
   jamais. C'est précisément la classe de piège que le harnais du gateway
   documente longuement — « Cette entité a-t-elle une JUMELLE ? » et « Un fichier
   `X.ts` à côté d'un répertoire `X/` : lequel est chargé ? » : deux exemplaires
   du même nom dérivent en silence, et un correctif appliqué au mauvais n'a aucun
   effet.
2. **1212 lignes de témoins-décoration.** Le test exerce une classe que rien
   n'appelle : aucune de ses assertions ne peut tomber sous une régression
   PRODUIT (§ « Tests — un témoin qui ne peut pas tomber n'est pas un témoin »).
   Ils attestent une implémentation morte, et suggèrent faussement qu'un cache
   Redis de traduction est couvert et maintenu.

## Root causes

Vestige d'une approche antérieure (cache Redis persistant avec recherche de
similarité) remplacée par un LRU mémoire (`message-translation/TranslationCache`,
plus simple et suffisant : les traductions sont déjà persistées dans
`Message.translations`, le cache n'est qu'un évite-DB chaud). L'ancienne classe
n'a jamais été retirée quand la nouvelle l'a supplantée ; son test a survécu avec
elle. Personne ne l'a signalée parce que, homonyme, elle se fond dans les
résultats de recherche du cache VIVANT.

## Business impact

Nul aujourd'hui : le cache vivant fonctionne. **Le risque est un piège de
maintenance**, identique à celui nommé par l'itération 250 : la prochaine
personne qui doit toucher au cache de traduction peut ouvrir le mauvais fichier,
« corriger » une implémentation morte, et voir ses trois cents lignes de témoins
verts confirmer un travail sans effet. Le coût est aussi un bruit de couverture :
1212 lignes de test gonflent le compte de suites sur du code non exécuté.

## Technical impact

Surface minimale, purement soustractive : suppression d'un fichier de service de
246 lignes + son test de 1212 lignes. Aucune signature publique, aucun contrat de
fil, aucun schéma, aucun import de production modifié (`tsc --noEmit` gateway :
exit 0 après retrait). `CacheStore`/`getCacheStore`, seul import du fichier mort,
reste utilisé ailleurs — inchangé.

## Risk assessment

Très faible. On retire du code qu'aucun chemin d'exécution n'atteint et le seul
témoin qui l'exerçait. Contre-preuve du chemin VIVANT :
`message-translation/TranslationCache` et les deux sites d'appel de
`MessageTranslationService` restent inchangés ; le cache de traduction continue
d'être exercé là où il vit réellement.

Effet sur la couverture : le fichier mort était bien couvert par son test ; on
retire donc des lignes couvertes du numérateur ET du dénominateur. L'effet global
sur un dépôt de centaines de fichiers est négligeable, et il est **mesuré** par
une exécution complète de `bun run test:coverage` avant publication (seuils
87/80/86/83). Publication conditionnée à seuils tenus.

## Proposed improvements (implemented)

1. **Suppression** de `src/services/TranslationCache.ts` (classe Redis morte).
2. **Suppression** de `src/__tests__/unit/services/TranslationCache.test.ts`
   (1212 lignes exerçant la classe morte).

Résolution par RETRAIT, pas par correction — même doctrine que l'itération 250 :
un défaut sur du code mort se retire, il ne se maintient pas. On ne canonicalise
pas, on ne refactore pas une implémentation que la production n'exécute jamais.

## Expected benefits

- Un homonyme trompeur de moins : « le » `TranslationCache` désigne désormais une
  seule classe, celle que la production utilise.
- 1458 lignes de code + test mortes retirées du bundle et du compte de suites.
- Le lecteur qui cherche le cache de traduction est envoyé vers le seul site
  vivant (`message-translation/TranslationCache`), pas vers un leurre Redis.

## Implementation complexity

Triviale : deux suppressions de fichiers, aucune addition de production.

## Validation criteria

- `tsc --noEmit` gateway : exit 0 (fait).
- Aucune référence résiduelle au chemin supprimé (`grep` : néant hors le test
  supprimé).
- `bun run test:coverage` : suite complète verte, seuils 87/80/86/83 tenus
  (en cours de mesure).
- Chemin vivant inchangé : `MessageTranslationService` + `TranslationCache` de
  `message-translation/` intacts.

## Future improvements (audit langue 247/249, restant à instruire)

Cette itération ne touche PAS à l'audit langue — dont les suivis vivants sont en
vol (PR #3375 web, PR #3368 gateway socket, PR #3352 lien partagé). Elle ferme un
axe orthogonal (dette de code mort / homonymie) exposé en instruisant le site
`TranslationCache:148` de l'audit langue : la comparaison brute
`entry.targetLanguage === targetLang` qu'il portait n'était PAS un défaut à
corriger — elle vivait dans du code mort, à retirer (méthode de l'itération 250
appliquée à la lettre : vérifier l'appelant AVANT de canonicaliser).

Restent, pour l'audit langue :
1. **Web (jest web, lot dédié)** — en vol, PR #3375.
2. **Backfill base** des codes tagués — décision produit + fenêtre de migration.

Leçon de méthode confirmée : un site de comparaison de langue signalé par un
balayage se vérifie d'abord contre son APPELANT. Ici le site n'en avait aucun ;
le corriger aurait fabriqué du code mort « juste ». Le retrait est la seule
réponse correcte.
