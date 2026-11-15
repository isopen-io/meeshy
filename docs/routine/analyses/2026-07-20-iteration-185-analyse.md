# Iteration 185 — `AuthSchemas.verifyPhone.code` : `z.string().length(6)` sans regex numérique — divergence de contrat avec le jumeau `verifyEmail.code`, un code SMS alphanumérique franchit la frontière de confiance

## Protocole (démarrage)
`main` @ `81d9c6b` (derniers merges : #2210 android/auth CountryCatalog,
#2208 android/prisme device-locale 4e priorité, #2146 gateway deviceCountry
debounce borné + `limit=0` clamp — **itérations 183/184 mergées**). Branche
`claude/brave-archimedes-ztogqk` réinitialisée sur `origin/main`. Ce cycle
prend **185**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (`packages/shared` / gateway / web). Harnais **vitest de
`packages/shared`** opérationnel (`bun install` OK, 46 fichiers / 1374 tests
verts au baseline). Les fixes des itérations 184 (`language-utils` normalisation
casse, `CommonSchemas.language` `.max(5)→.max(6)`) sont **confirmés présents dans
`main`** (validation.ts:95, language-utils.ts:148). Priorité 1 (features
récentes) : les merges les plus récents sont Android/iOS (non testables ici).
Priorité 2/3 : revue des schémas de trust-boundary `packages/shared`. Le
**seul défaut net à haute confiance** est une divergence de contrat entre deux
schémas frères de vérification de code — cible de cette itération, déjà consignée
en backlog par l'itération 183.

## Current state
`packages/shared/utils/validation.ts` définit deux schémas Zod frères pour la
vérification d'un code à 6 chiffres à la frontière de confiance (REST
`magic-link.ts:408` → `authService.verifyPhone`) :

```ts
// :364 — verifyEmail (token OU code 6 chiffres depuis mobile)
code: z.string().length(6).regex(/^[0-9]{6}$/).optional(),

// :383 — verifyPhone
code: z.string().length(6),        // <-- PAS de regex numérique
```

`verifyEmail.code` impose explicitement la forme numérique via
`/^[0-9]{6}$/`. Son jumeau `verifyPhone.code` — sémantiquement identique (un
OTP SMS à 6 chiffres) — se contente de `.length(6)`, acceptant donc **n'importe
quelle chaîne de 6 caractères** (`'abcdef'`, `' 1234 '`, `'12-34'`).

`AuthSchemas.verifyPhone` est **câblé en production** : `magic-link.ts:408`
appelle `validateSchema(AuthSchemas.verifyPhone, request.body, 'verify-phone')`
puis transmet `code` à `AuthService.verifyPhone(phoneNumber, code)`
(`AuthService.ts:1055`), qui hash le code (`hashToken`) et le compare en base.

## Problems identified
1. **Divergence de contrat entre schémas frères (correctness-of-contract).**
   Deux champs sémantiquement identiques (OTP 6 chiffres) sont validés
   différemment : `verifyEmail.code` rejette `'abcdef'`, `verifyPhone.code`
   l'accepte. Vérifié empiriquement : `AuthSchemas.verifyPhone.safeParse({
   phoneNumber:'+33612345678', code:'abcdef' }).success === true` (attendu
   `false`).
2. **Frontière de confiance affaiblie (defense-in-depth).** Un code SMS
   alphanumérique franchit la validation de schéma et consomme une **requête
   DB** (`prisma.user.findFirst` sur `phoneVerificationCode: hashedCode`) avant
   d'échouer au check d'égalité aval avec « Code invalide ». La validation aurait
   dû le rejeter en amont avec un `400 VALIDATION` — c'est précisément le rôle
   du regex sur le frère `verifyEmail`.
3. **Trou de couverture ayant masqué la divergence.**
   `__tests__/validation.test.ts` ne testait **aucun** des deux schémas de code
   de vérification (`verifyEmail`/`verifyPhone`). Ni la forme numérique, ni la
   parité entre les deux frères n'étaient verrouillées.

## Root causes
Les deux schémas ont été écrits séparément. `verifyEmail.code` a reçu la regex
numérique (probablement au moment de supporter le code 6 chiffres depuis mobile),
`verifyPhone.code` est resté sur la forme longueur-seule d'origine. Aucun helper
partagé (`sixDigitCode`) ne garantissait la forme commune par construction, donc
la divergence est passée inaperçue — même patron de dérive de miroir que les
itérations 181/183 (`deviceLocale`/`deviceCountry`).

## Business impact
Faible en runtime (le hash d'un code non-numérique ne matche jamais en base, donc
aucune vérification erronée n'aboutit — la defense-in-depth aval tient), réel en
robustesse et cohérence d'API : un client émettant un code malformé reçoit un
message aval générique (« Code invalide ») après une requête DB, au lieu d'un
`400 VALIDATION` immédiat et explicite en frontière — contrat incohérent avec le
flux e-mail sur le même écran de vérification OTP.

## Technical impact
- Contrat `AuthSchemas.verifyPhone.code` **aligné** sur `verifyEmail.code` :
  la forme numérique 6 chiffres devient l'unique gardien commun aux deux OTP.
- Zéro élargissement : `/^[0-9]{6}$/` combiné à `.length(6)` n'accepte que ce
  que le check d'égalité aval pouvait déjà valider (un code hashé numérique) —
  aucune entrée aujourd'hui acceptée-et-vérifiable ne change de verdict.

## Risk assessment
Très faible. Ajout d'un unique `.regex(/^[0-9]{6}$/)` (copie verbatim du frère
`verifyEmail`). Seules des chaînes 6-caractères **non-numériques** — qui
échouaient déjà à la vérification aval — deviennent rejetées en amont. Aucun
code numérique valide ne devient invalide. Aucun autre site : `grep` confirme
`validation.ts:383` unique porteur du motif `verifyPhone`.

## Proposed improvements (TDD)
- **RED** : +5 tests dans `__tests__/validation.test.ts` (bloc
  `AuthSchemas verification codes`) — `verifyEmail.code` accepte `'123456'` /
  rejette `'abcdef'` ; `verifyPhone.code` accepte `'123456'`, **rejette
  `'abcdef'`** (échoue sur `.length(6)` seul), rejette les mauvaises longueurs.
- **GREEN** : `validation.ts:383` `z.string().length(6)` →
  `z.string().length(6).regex(/^[0-9]{6}$/)` (parité stricte avec `:364`).
- **REFACTOR** : néant (changement minimal ; un helper `sixDigitCode` partagé
  serait la suite « propre » mais élargit la surface — consigné en backlog).

## Expected benefits
- Un contrat OTP cohérent (forme numérique) sur les DEUX frontières de
  vérification (e-mail ET téléphone).
- Rejet en amont des codes malformés (`400 VALIDATION`) au lieu d'une requête DB
  + message générique aval.
- Couverture verrouillant la parité e-mail ↔ téléphone (le trou qui a laissé
  passer la divergence).

## Implementation complexity
Triviale — 1 regex de production (parité avec le frère) + 5 tests de
non-régression.

## Validation criteria
- `packages/shared` : `vitest run __tests__/validation.test.ts` = tous verts
  (37 → 42), dont le bloc `AuthSchemas verification codes`.
- Suite complète `packages/shared` : **1374 → 1374+ tests verts**, 46 fichiers.
- `tsc --noEmit` (shared) : 0 erreur.
- `AuthSchemas.verifyPhone.safeParse({ code:'abcdef', … }).success === false`
  (était `true`) ; `'123456'` toujours `true`.

## Backlog (candidats consignés — non actionnés ici)
- **Helper `sixDigitCode` partagé** : extraire `z.string().length(6).regex(/^[0-9]{6}$/)`
  en une constante réutilisée par `verifyEmail`/`verifyPhone` (et tout futur OTP)
  pour garantir la parité par construction — évite une re-divergence. Élargit la
  surface (refactor multi-schéma) → itération dédiée.
- **`participantsFilters.limit` (`validation.ts:654`)** : `parseInt(val||'50',10)`
  sans clamp NaN/négatif. **Dead code** (aucune route ne le consomme) → faible
  valeur tant que non câblé ; unifier sur le patron pagination si un jour branché.
- **`CommonSchemas.language` casse/séparateur** : regex case-sensitive
  (rejette `EN`, `fr_FR`, `en-us`) sur `sendMessage`/`editMessage.originalLanguage`.
  `normalizeLanguageCode` (SSOT) les canonise ; loosen changerait la valeur
  persistée → décision produit + vérif intégration iOS (backlog itér. 183/184).
- **`normalizeLanguageCode` ISO 639-3** (collision 3→2 lettres) : nécessite une
  table 639-3→639-1, changement de SSOT du Prisme → analyse dédiée.
