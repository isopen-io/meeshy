# Iteration 174 — `looksLikePhoneNumber` : faux négatif sur le format local NANP `(555) 123-4567`

## Protocole (démarrage)
`main` @ `e0027ae` (dernier merge : PR #1899 — android/media ThumbHash encoder).
Branche `claude/brave-archimedes-80e9p5` réinitialisée sur `origin/main`.
PRs ouvertes laissées intactes : #1900 (android chat grouping, autre session),
#1897 (gateway reactions .catch, autre session) et #1842 (bump majeur
TypeScript 6→7 par dependabot, risqué). Ce cycle prend **174**.

Environnement : Linux, aucune toolchain Swift/Xcode → surface testable =
TypeScript (web/gateway/shared). Cible retenue par revue d'ingénierie de la
couche utilitaire pure gateway : `services/gateway/src/utils/normalize.ts` →
`looksLikePhoneNumber`.

## État actuel
`looksLikePhoneNumber(value)` est le classificateur qui décide si une chaîne
« ressemble à un numéro de téléphone ». Il garde l'entrée de `normalizePhoneNumber`
(ligne 128), lui-même appelé sur des chemins **utilisateur réels** :
- `AuthService.authenticate` (ligne 124) — login par téléphone (l'identifiant
  saisi est normalisé en E.164 pour matcher `User.phoneNumber`) ;
- `routes/auth/register.ts` (206), `routes/users/profile.ts` (146, 174),
  `routes/users/contact-change.ts` (506) — enregistrement / mise à jour du numéro.

## Problème identifié
La regex de forme téléphonique ancrait le **premier** caractère sur `[+\d]` :

```ts
const phonePattern = /^[+\d][\d\s\-().]*$/;
```

La parenthèse ouvrante était autorisée partout **sauf en position 0**. Or le
format local nord-américain (NANP) place l'indicatif régional entre parenthèses
**en tête** : `(555) 123-4567`. Un tel numéro était donc classé `false`.

Entrées concrètes → sortie erronée :
- `looksLikePhoneNumber('(555) 123-4567')` → **`false`** (attendu `true` : 10
  chiffres, ni email ni username).
- `looksLikePhoneNumber('(020) 7946 0958')` → **`false`** (numéro local GB
  valide, que libphonenumber parse en `+442079460958` `valid=true`).
- Conséquence : `normalizePhoneNumber('(020) 7946 0958', 'GB')` → **`''`** au
  lieu de `+442079460958`.

## Cause racine
L'ancre de position 0 avait été écrite pour rejeter les emails/usernames évidents.
Mais un username ne peut jamais commencer par `(` (`normalizeUsername` :
`/^[a-zA-Z0-9_-]+$/`) et un email contient `@` (déjà exclu ligne 29). L'ancre
`[+\d]` était donc **trop stricte** : elle rejetait un format téléphonique
légitime sans rien gagner en désambiguïsation email/username.

## Correctif (TDD)
- **RED** : 6 tests ajoutés dans `normalize.test.ts` (bloc `looksLikePhoneNumber`).
  Vérifié que l'ancienne regex rejette `(555) 123-4567` et `(020) 7946 0958`
  (les deux tests « true » échouent avant le fix).
- **GREEN** : ajout de `(` à la classe d'ancre de position 0 :
  `/^[+\d][\d\s\-().]*$/` → `/^[+\d(][\d\s\-().]*$/`. Un caractère, comportement
  inchangé pour toutes les entrées existantes.
- Tests de non-régression du périmètre d'ancre : un numéro démarrant par un
  séparateur (`-33…`, `) 555…`) reste `false` ; `(abc) def-ghij` (lettres) et
  `(12) 34` (< 6 chiffres) restent `false`.

## Impact
- **Correction** : le format local NANP `(555) 123-4567` — très courant — est
  désormais correctement classé comme téléphone ; les flux login / register /
  profile / contact-change qui passent le bon `defaultCountry` normalisent le
  numéro au lieu de le vider.
- **Cohérence** : `normalizePhoneNumber('(555) 123-4567')` (défaut FR) renvoie
  désormais `+335551234567` (formaté mais `isValid=false`), **strictement
  cohérent** avec le traitement actuel des autres entrées à 6+ chiffres non
  valides (`123456` → `+33123456` aujourd'hui) — aucune nouvelle classe de
  comportement introduite.
- **Périmètre** : un seul caractère de production + 6 tests. Zéro impact sur les
  autres consommateurs (register/profile/contact-change/AuthService mockent
  `normalizePhoneNumber` dans leurs tests).

## Vérification
- `services/gateway` — `jest utils/normalize.test` : **131/131 verts** (125
  existants + 6 nouveaux). RED prouvé (ancienne regex rejette les nouveaux cas).
- Comportement libphonenumber confirmé hors ligne (GB `(020) 7946 0958` →
  `+442079460958` valid=true ; US/FR fictifs `555` → format E.164 valid=false).

## Risques / rollback
Risque négligeable : élargissement d'un caractère d'une regex de classification
pure, couvert par tests. Rollback = revert du commit.

## Critères de validation
- [x] `looksLikePhoneNumber('(555) 123-4567') === true`
- [x] Anti-régression : emails/usernames/séparateurs-en-tête restent `false`
- [x] Suite `normalize.test` verte (131/131)
- [ ] CI gateway verte (post-push)
