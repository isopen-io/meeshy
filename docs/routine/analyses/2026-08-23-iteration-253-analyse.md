# Analyse — Itération 253 : `CaptchaService`, mort et doublon de la vérification vivante

## Current state

Le gateway porte une classe **`CaptchaService`**
(`src/services/CaptchaService.ts`, 192 lignes) qui vérifie un jeton hCaptcha
(`POST https://hcaptcha.com/siteverify`), avec en prime un cache anti-rejeu de
jetons (`Map` + `setInterval` de nettoyage). Elle est accompagnée de **deux**
suites qui l'exercent intégralement :
`__tests__/unit/services/CaptchaService.test.ts` (238 lignes) et
`CaptchaService.extra.test.ts` (89 lignes).

Le SEUL endroit de production qui vérifie réellement un captcha — le reset de
mot de passe — **ne l'utilise pas**. `PasswordResetService` porte sa propre
vérification hCaptcha **en ligne** :

```
src/services/PasswordResetService.ts
  :83   const isCaptchaValid = await this.verifyCaptcha(captchaToken, ipAddress);
  :479  private async verifyCaptcha(token, ipAddress): Promise<boolean> { … }
  :488  'https://hcaptcha.com/siteverify'
```

## Problems identified

`CaptchaService` est du **code mort ET un doublon**, exactement au sens que les
itérations 250 (`_findUsersForLanguage`) et 252 (`TranslationCache` Redis) ont
établi :

```
$ grep -rn "CaptchaService" --include=*.ts services packages apps scripts tests \
    | grep -v "src/services/CaptchaService.ts"
… (uniquement les deux fichiers *.test.ts) …
```

- **Zéro import de production** dans tout le monorepo — les seuls importeurs sont
  ses deux propres tests.
- **Aucun chargement dynamique** (`require(`/`import(` sur ce chemin : néant).
- **Aucun barrel** ne la ré-exporte (`services/` n'a pas d'`index.ts`).
- La vérification hCaptcha VIVANTE est réécrite en ligne dans
  `PasswordResetService.verifyCaptcha` — même endpoint, même contrat booléen.

C'est le patron « superseded original » : une classe conçue pour porter la
vérification captcha, jamais câblée, doublée par une implémentation en ligne qui
l'a supplantée. Les références résiduelles hors code (RUNLOG de couverture, doc
d'archive `PASSWORD_RESET_COMPLETE.md`) le confirment — la classe fut un livrable
documenté, que le service consommateur n'a jamais branché.

Deux défauts en découlent, identiques à ceux nommés en 250/252 :

1. **Doublon trompeur.** Un lecteur qui cherche « la » vérification captcha a une
   chance sur deux d'ouvrir la classe que la production n'exécute jamais, et d'y
   « corriger » une logique sans effet — le harnais gateway le documente
   longuement (« Cette entité a-t-elle une JUMELLE ? »).
2. **327 lignes de témoins-décoration.** Les deux suites exercent une classe que
   rien n'appelle : aucune de leurs assertions ne peut tomber sous une régression
   PRODUIT (§ « Tests — un témoin qui ne peut pas tomber n'est pas un témoin »).

## Root causes

Vestige de la construction initiale du reset de mot de passe : `CaptchaService`
a été écrit comme service dédié, puis `PasswordResetService` a incorporé sa
propre vérification en ligne (plus simple : un booléen, un bypass dev
`BYPASS_CAPTCHA`, pas de cache anti-rejeu) et n'a jamais câblé la classe.
Personne ne l'a signalée parce que, doublon d'un comportement vivant, elle se
fond dans les résultats de recherche du chemin réel.

## Business impact

Nul aujourd'hui : le reset de mot de passe vérifie bien son captcha via la
méthode en ligne. **Le risque est un piège de maintenance**, identique à 250/252 :
la prochaine personne qui doit durcir la vérification captcha (p. ex. ajouter un
score, une liste d'IP) peut ouvrir `CaptchaService`, l'améliorer, et voir ses
témoins verts confirmer un travail que la production n'exécute pas.

## Technical impact

Surface minimale, purement soustractive : suppression d'un service de 192 lignes
+ ses deux tests (327 lignes). Aucune signature publique, aucun contrat de fil,
aucun schéma, aucun import de production modifié (`tsc --noEmit` gateway : exit 0
après retrait). `axios` et `enhancedLogger`, seuls imports du fichier mort,
restent utilisés partout ailleurs — inchangés.

## Risk assessment

Très faible. On retire du code qu'aucun chemin d'exécution n'atteint et les deux
témoins qui l'exerçaient. Contre-preuve du chemin VIVANT :
`PasswordResetService.verifyCaptcha` (auto-suffisant — `import axios`,
`this.captchaSecret`) et son site d'appel `:83` restent inchangés ; la
vérification captcha continue d'être exercée là où elle vit réellement, par les
suites de `PasswordResetService`.

Effet sur la couverture : le fichier mort était couvert à 100 % (RUNLOG
gateway-manifest-gap2, 2026-06-28) ; on retire donc des lignes couvertes du
numérateur ET du dénominateur. L'effet global sur un dépôt de centaines de
fichiers est négligeable, et il est **mesuré** par une exécution complète de
`bun run test:coverage` avant publication (seuils 87/80/86/83). Publication
conditionnée à seuils tenus.

## Proposed improvements (implemented)

1. **Suppression** de `src/services/CaptchaService.ts` (classe hCaptcha morte).
2. **Suppression** de `CaptchaService.test.ts` + `CaptchaService.extra.test.ts`
   (327 lignes exerçant la classe morte).

Résolution par RETRAIT, pas par consolidation — même doctrine que 250/252 : un
défaut sur du code mort se retire, il ne se maintient pas. **On ne bascule PAS**
`PasswordResetService` vers `CaptchaService` : ce serait ressusciter du code mort
sur un chemin de sécurité vivant, y introduire un cache anti-rejeu à `setInterval`
absent du comportement actuel, et élargir la surface pour un seul consommateur —
la SSOT n'a de sens qu'à partir de deux copies VIVANTES, et il n'y en a qu'une.

## Expected benefits

- Un doublon trompeur de moins : « la » vérification captcha désigne désormais le
  seul site que la production exécute (`PasswordResetService.verifyCaptcha`).
- 519 lignes de code + tests mortes retirées du bundle et du compte de suites.
- Le lecteur qui cherche la vérification captcha est envoyé vers le seul site
  vivant, pas vers un leurre à cache anti-rejeu jamais instancié.

## Implementation complexity

Triviale : trois suppressions de fichiers, aucune addition de production.

## Validation criteria

- `tsc --noEmit` gateway : exit 0 (fait).
- Aucune référence de CODE résiduelle au chemin supprimé (`grep` : néant hors
  docs/RUNLOG historiques, immuables).
- `bun run test:coverage` : suite complète verte, seuils 87/80/86/83 tenus
  (en cours de mesure).
- Chemin vivant inchangé : `PasswordResetService.verifyCaptcha` + son site
  d'appel `:83` intacts.

## Future improvements

Règle de méthode reconduite (250 → 252 → 253) : avant de consolider / corriger
un site signalé par un balayage, vérifier qu'il a un appelant de production. Un
défaut sur du code mort se résout par suppression, jamais par canonicalisation.
Corollaire d'homonymie/doublon (« Cette entité a-t-elle une JUMELLE ? ») : deux
implémentations de la même opération, l'une vivante et l'autre orpheline, sont un
piège de maintenance à retirer dès qu'il est repéré.

Candidat frère restant, du même patron, à instruire à une itération ultérieure :
`SecurityMonitor` (`src/services/SecurityMonitor.ts`, 347 lignes + 404 de test) —
orphelin pur, supplanté par des `prisma.securityEvent.create(...)` en ligne dans
`SessionService`, `PhonePasswordResetService`, `PhoneTransferService` et
`jobs/unlock-accounts.ts`. Non traité ici pour garder le lot minimal et
mono-thème.
