# Plan — Itération 252 : retirer le `TranslationCache` Redis mort (homonyme)

## Objectives

Retirer `src/services/TranslationCache.ts` — une classe `TranslationCache` Redis
jamais câblée, homonyme du LRU mémoire `message-translation/TranslationCache` qui
est le seul cache de traduction que la production exécute — et son test de
1212 lignes qui l'exerce sans pouvoir tomber.

## Affected modules

- `services/gateway/src/services/TranslationCache.ts` — SUPPRIMÉ.
- `services/gateway/src/__tests__/unit/services/TranslationCache.test.ts` —
  SUPPRIMÉ (exerce uniquement la classe supprimée).
- Docs : analyse + ce plan.

## Implementation phases

1. **Preuve du code mort** — `grep -rn "services/TranslationCache"` : seul le
   test référence le chemin ; aucun import de production, aucun `require(`/`import(`
   dynamique, aucun barrel. ✅ fait.
2. **Preuve du chemin vivant** — `MessageTranslationService` instancie et
   interroge `message-translation/TranslationCache` (LRU mémoire), pas la classe
   Redis. ✅ fait.
3. **Retrait** des deux fichiers (`git rm`). ✅ fait.
4. **Validation** — `tsc --noEmit` gateway (exit 0, fait), puis
   `bun run test:coverage` complète (seuils tenus).

## Dependencies

Aucune. Additif négatif (suppression pure). `CacheStore`/`getCacheStore`
(unique import du fichier mort) reste utilisé ailleurs — intact.

## Estimated risks

Très faible : suppression de code jamais exécuté + son témoin-décoration. Seul
point à mesurer : l'effet sur la couverture globale (retrait de lignes couvertes
du numérateur et du dénominateur) — négligeable sur un dépôt de centaines de
fichiers, et vérifié par une exécution complète avant publication.

## Rollback strategy

`git revert` du commit unique restaure les deux fichiers. Aucun état persistant,
aucune migration, aucun contrat de fil.

## Validation criteria

- [x] `tsc --noEmit` gateway exit 0.
- [x] Aucune référence résiduelle au chemin supprimé.
- [ ] `bun run test:coverage` verte, seuils 87/80/86/83 tenus.
- [x] Chemin vivant (`message-translation/TranslationCache`,
      `MessageTranslationService`) inchangé.

## Completion status

Implémenté ; validation couverture en cours.

## Progress tracking

- Analyse : `docs/routine/analyses/2026-08-23-iteration-252-analyse.md`.
- Audit langue (orthogonal) : suivis vivants en vol (PR #3375, #3368, #3352).

## Future improvements

Règle de méthode reconduite (itération 250) : avant de canonicaliser / corriger
un site signalé par un balayage, vérifier qu'il a un appelant de production. Un
défaut sur du code mort se résout par suppression. Corollaire d'homonymie
(harnais gateway, « Cette entité a-t-elle une JUMELLE ? ») : deux types de même
nom dans des répertoires frères sont un piège de maintenance à consolider dès
qu'il est repéré.
