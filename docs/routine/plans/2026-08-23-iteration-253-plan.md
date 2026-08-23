# Plan — Itération 253 : retirer le `CaptchaService` mort (doublon de la vérif vivante)

## Objectives

Retirer `src/services/CaptchaService.ts` — une classe hCaptcha jamais câblée,
doublon de la vérification en ligne `PasswordResetService.verifyCaptcha` qui est
le seul chemin captcha que la production exécute — et ses deux tests (327 lignes)
qui l'exercent sans pouvoir tomber.

## Affected modules

- `services/gateway/src/services/CaptchaService.ts` — SUPPRIMÉ.
- `services/gateway/src/__tests__/unit/services/CaptchaService.test.ts` — SUPPRIMÉ.
- `services/gateway/src/__tests__/unit/services/CaptchaService.extra.test.ts` — SUPPRIMÉ.
- Docs : analyse + ce plan.

## Implementation phases

1. **Preuve du code mort** — `grep -rn "CaptchaService"` : seuls les deux tests
   référencent le symbole ; aucun import de production, aucun `require(`/`import(`
   dynamique, aucun barrel. ✅ fait.
2. **Preuve du chemin vivant** — `PasswordResetService.verifyCaptcha` (`:479`)
   vérifie hCaptcha en ligne, appelée en `:83`, auto-suffisante (`import axios`,
   `this.captchaSecret`). ✅ fait.
3. **Retrait** des trois fichiers (`git rm`). ✅ fait.
4. **Validation** — `tsc --noEmit` gateway (exit 0, fait), puis
   `bun run test:coverage` complète (seuils tenus).

## Dependencies

Aucune. Additif négatif (suppression pure). `axios`/`enhancedLogger` (imports du
fichier mort) restent utilisés partout ailleurs — intacts.

## Estimated risks

Très faible : suppression de code jamais exécuté + ses deux témoins-décoration.
Seul point à mesurer : l'effet sur la couverture globale (le fichier mort était
couvert à 100 %, on retire des lignes couvertes du numérateur ET du dénominateur)
— négligeable sur un dépôt de centaines de fichiers, vérifié par une exécution
complète avant publication.

## Rollback strategy

`git revert` du commit unique restaure les trois fichiers. Aucun état persistant,
aucune migration, aucun contrat de fil.

## Validation criteria

- [x] `tsc --noEmit` gateway exit 0.
- [x] Aucune référence de CODE résiduelle au chemin supprimé (docs/RUNLOG
      historiques mis à part).
- [ ] `bun run test:coverage` verte, seuils 87/80/86/83 tenus.
- [x] Chemin vivant (`PasswordResetService.verifyCaptcha`, site `:83`) inchangé.

## Completion status

Implémenté ; validation couverture en cours.

## Progress tracking

- Analyse : `docs/routine/analyses/2026-08-23-iteration-253-analyse.md`.
- Série dette de code mort : 250 (`_findUsersForLanguage`), 252
  (`TranslationCache` Redis), 253 (`CaptchaService`).

## Future improvements

Prochain candidat du même patron : `SecurityMonitor` (orphelin, supplanté par des
`prisma.securityEvent.create(...)` en ligne dans quatre modules). Instruire dans
un lot dédié pour rester mono-thème.
