# Interdire l'espace dans les usernames — verrou, nettoyage, rappel

**Date** : 2026-08-18
**Statut** : design validé, implémentation à faire

## Problème rapporté

« Le nom d'utilisateur lors de la création de compte permet de mettre l'espace. »

## Ce que l'audit a réellement trouvé

Le backend **rejette déjà** l'espace. Vérifié en live contre le gateway de production
(`docker exec meeshy-gateway`, appel interne sur `localhost:3000`) :

```
POST /api/v1/auth/register  {"username":"space test", …}
→ 400 {"code":"VALIDATION_ERROR",
       "violations":[{"path":"username",
                      "message":"Username invalide (lettres, chiffres, - et _ uniquement)"}]}
```

État des quatre couches au 2026-08-18 :

| Couche | Espace bloqué ? | Mécanisme |
|---|---|---|
| Web — `register-form/UsernameField.tsx` et `wizard-steps/UsernameStep.tsx` | oui, **filtré à la frappe** | `.replace(/[^a-zA-Z0-9_-]/g,'')` |
| Gateway — `AuthSchemas.register`, `updateUsernameSchema` (Zod) | oui | `/^[a-zA-Z0-9_-]+$/` |
| **iOS** — `RegistrationViewModel.isUsernameValidLocally` | **non à la frappe** | gate seulement : bouton grisé, aucun message |
| **Android** — `SignupFieldValidation.isUsernameValidLocally` | **non à la frappe** | idem, muet |

Deux défauts connexes découverts dans la même zone :

1. **Divergence Unicode client/serveur.** iOS utilise `CharacterSet.alphanumerics`, Android
   `isLetterOrDigit()` — tous deux **Unicode**. `josé` passe le gate client puis se fait
   refuser par le serveur, qui est **ASCII**. Le commentaire de `RegistrationViewModel.swift`
   affirme pourtant « miroir exact de `AuthSchemas.register` ».
2. **JSON Schema Ajv muet.** `registerRequestSchema.properties.username` et le body de
   `PATCH /users/me/username` n'ont **aucun `pattern`** — seul le Zod derrière rattrape.
   L'OpenAPI publié ment donc sur le contrat.

## État des données en production

247 utilisateurs, **exactement 2** avec un espace, tous deux créés le 2025-10-19,
antérieurs au verrou Zod. Aucun autre username non conforme au pattern.

| `_id` | username | identité | email | dernière activité |
|---|---|---|---|---|
| `68f47b5e2d4f2ca375df2576` | `la lionne noire` | La Lionne Noire Mbilla | verrainembilla@gmail.com | 2025-11-21 |
| `68f47e702d4f2ca375df2583` | `vanel momo` | Momo Vanel | tsapmovanelrikel@gmail.com | 2025-10-19 |

Les deux sont `isActive: true`, `role: USER`, `systemLanguage: 'fr'`, et **aucun n'a
vérifié son adresse e-mail** (`emailVerifiedAt` absent).

Aucune collision : `lalionnenoire`, `vanelmomo`, `la_lionne_noire`, `vanel_momo`,
`lalionne` sont tous libres (recherche insensible à la casse).

**Renommage retenu — suppression pure** :

```
la lionne noire  →  lalionnenoire   (13 car.)
vanel momo       →  vanelmomo       ( 9 car.)
```

### Ce qu'un renommage ne casse pas

- **Mentions** : `Mention.mentionedUserId` porte un `User.id`, jamais le handle.
- **Connexion** : `AuthService` accepte username **ou** email **ou** téléphone comme
  identifiant — ces deux personnes ne seront pas verrouillées dehors.
- **Cache auth** : `authUserCacheKey` a un TTL de 60 s, il se répare seul.
- **JWT en cours** : le token porte `username`, mais seul `userId` fait autorité ;
  le token expire de toute façon en 24 h.

## Conception

### 1. Source de vérité unique pour le pattern

Le dépôt a déjà ce précédent exact pour les prénoms : `personNamePatternSource` est exporté
comme **chaîne** depuis `packages/shared/types/api-schemas.ts`, consommée telle quelle par Ajv
(`pattern`) et compilée en `RegExp` par Zod, pour que les deux couches rendent le même verdict.

On applique la même mécanique :

```ts
// packages/shared/types/api-schemas.ts
export const usernamePatternSource = "^[a-zA-Z0-9_-]+$";
```

La littérale `/^[a-zA-Z0-9_-]+$/` est aujourd'hui **recopiée à 7 endroits**, et manque aux
2 sites Ajv. Tous consomment désormais la source unique :

| Site | Avant | Après |
|---|---|---|
| `shared/utils/validation.ts` — `AuthSchemas.register` (Zod) | littérale | compilée depuis la source |
| `shared/utils/validation.ts` — `updateUsernameSchema` (Zod) | littérale | compilée depuis la source |
| `shared/utils/validation.ts` — `CommonSchemas.username` (Zod) | littérale | compilée depuis la source |
| `shared/types/validation.ts` — `usernameSchema` (Zod) | littérale | compilée depuis la source |
| `shared/types/validation/admin-user.ts` — création admin (Zod) | littérale | compilée depuis la source |
| `shared/types/validation/admin-user.ts` — update admin (Zod) | littérale | compilée depuis la source |
| `gateway/utils/normalize.ts` — `normalizeUsername` | littérale | compilée depuis la source |
| `registerRequestSchema` (Ajv) | **aucun `pattern`** | `pattern: usernamePatternSource` |
| body `PATCH /users/me/username` (Ajv) | **aucun `pattern`** | `pattern: usernamePatternSource` |

Le pattern est **ancré** (`^…$`) : `pattern` en JSON Schema est une recherche partielle, et
sans ancres Ajv accepterait toute chaîne *contenant* une sous-chaîne valide alors que le Zod
(ancré par construction) la refuserait. Même raison que pour `personNamePatternSource`.

#### Hors scope, délibérément

- **Les longueurs restent divergentes.** Trois règles coexistent : 2–16 (`register`,
  `updateUsername`, clients), 3–30 (`CommonSchemas`, admin), 3–32 (`usernameSchema`). C'est
  une vraie incohérence, mais elle est orthogonale au bug rapporté ; l'unifier changerait le
  contrat d'inscription. À traiter séparément.
- **Les sites de parsing de mentions ne bougent pas.** `mention-parser.ts`, `types/mention.ts`,
  `MentionService.ts`, `middleware/rate-limiter.ts` citent le charset username en commentaire
  mais ont déjà leur propre SSOT (`MENTION_HANDLE_CHARS`). Le charset ne changeant pas ici,
  rien à propager.

### 2. iOS et Android : filtrage à la frappe et fix Unicode

**Cause racine du silence, côté iOS** : la vue rend déjà un `viewModel.usernameError`
(`apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift:206`), mais le sink de
debounce de `RegistrationViewModel.setupValidationDebounce` fait exactement l'inverse de ce
qu'il faudrait — sur violation de format il **remet `usernameError` à `nil`** avant de
renoncer à la sonde de disponibilité. Le champ est donc structurellement muet précisément
quand il aurait quelque chose à dire.

Trois changements symétriques de chaque côté :

- **Jeu de caractères ASCII explicite**, miroir réel du serveur, à la place de
  `CharacterSet.alphanumerics` (iOS) / `isLetterOrDigit()` (Android).
- **Filtrage à la frappe**, parité avec le web. Point d'étranglement unique : un `didSet` sur
  le `@Published var username` du ViewModel, qui attrape tous les écrivains (frappe, collage,
  restauration d'état) — avec garde de ré-entrance (`guard sanitized != username else { return }`),
  sans quoi la réassignation relance `didSet` en boucle.
- **Message d'erreur explicite** : la branche `else` du sink pose un message de format au lieu
  de `nil`, dès que le champ est non vide. Modèle du `nameFieldError` déjà présent.

Fichiers : `packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift` (+ la vue
`OnboardingStepViews.swift` si le rendu de l'erreur doit être ajusté) ;
`apps/android/core/model/…/auth/SignupAvailability.kt`,
`apps/android/feature/auth/…/RegistrationViewModel.kt` (`onUsernameChange`) et
`RegistrationScreen.kt` (+ `strings.xml`).

Le filtrage à la frappe est silencieux, comme sur le web ; la ligne d'aide sous le champ
énonce la règle en permanence, donc la disparition d'un caractère n'est pas mystérieuse.

Le gate `isUsernameValidLocally` est **conservé** en plus du filtrage : il reste la barrière
des chemins non-UI (suggestions serveur adoptées par tap, tests).

### 3. Script de migration

`scripts/migrations/strip-spaces-from-usernames.ts`, calqué sur `repair-mention-user-ids.ts` :
**dry-run par défaut**, `--apply` pour écrire, `--production` pour cibler la prod.

- Sélectionne `{ username: /\s/ }` — **pas** les deux `_id` en dur : reste correct si d'autres
  lignes apparaissent, et **idempotent** (2ᵉ passage : rien à faire).
- Calcule `username.replace(/\s+/g, '')`, puis **vérifie** : longueur 2–16, conforme à
  `usernamePatternSource`, aucune collision insensible à la casse (en excluant soi-même).
- Toute ligne qui échoue une vérification est **rapportée et sautée**, jamais devinée.
- **N'écrit PAS `usernameHistory`.** Le rate-limit de 30 jours de `PATCH /users/me/username`
  lit `usernameHistory[0].changedAt` : y déposer une entrée renverrait un 429 à ces deux
  personnes pendant un mois si elles voulaient renommer elles-mêmes. Le champ n'est exposé à
  aucun client (zéro occurrence dans web/iOS/Android/SDK). La trace d'audit est le rapport
  du script.
- **Aucune invalidation de cache** : TTL de 60 s sur `authUserCacheKey`.
- Sous `--apply`, envoie le mail de rappel à chaque compte renommé. Un échec d'envoi
  **n'annule pas** le renommage ; il est signalé ligne à ligne dans le rapport, à renvoyer
  manuellement le cas échéant.

La logique décisionnelle est extraite en fonction **pure** `planRename(users)` pour être
testable sans base de données.

### 4. Mail de rappel

`EmailService.sendUsernameReminderEmail({ to, name, username, language })`, sur le patron exact
des templates existants : `getUsernameReminderTranslations(lang)` + HTML + texte +
`sendEmail({ trackingType: 'username_reminder', trackingLang })`. Les deux comptes sont en `fr`.

Ton strictement « rappel ». Le message énonce un **fait vrai au présent** et n'évoque jamais
de modification :

> **Votre identifiant Meeshy**
> Bonjour La Lionne Noire, petit rappel : votre nom d'utilisateur Meeshy est **@lalionnenoire**.
> C'est avec lui — ou avec votre adresse e-mail — que vous vous connectez.

Un test de contenu verrouille la règle produit : le corps ne contient ni « modifié », ni
« changé », ni « nouveau ».

### 5. Tests

RED d'abord à chaque étage.

| Cible | Cas |
|---|---|
| `packages/shared` | Ajv et Zod rendent le **même** verdict sur `"a b"`, `"josé"`, `"a_b-1"` · **chaque** schéma username exporté (register, updateUsername, CommonSchemas, usernameSchema, admin ×2) rejette `"a b"` et `"josé"` — garde ancrée sur le **comportement**, pas sur l'absence textuelle de littérale |
| gateway | `POST /auth/register` et `PATCH /users/me/username` : 400 `VALIDATION_ERROR` avec violation sur `username` |
| script | `planRename` : collision ⇒ sautée · trop court après strip ⇒ sauté · déjà propre ⇒ intouché · idempotence |
| `EmailService` | rendu du handle dans HTML et texte · garde de vocabulaire (« modifié »/« changé »/« nouveau » absents) |
| iOS `RegistrationLocalValidationTests` | espace invalide · lettre accentuée invalide · sanitizer retire l'espace |
| Android `SignupAvailabilityTest` | mêmes trois cas |

## Ordre d'exécution

1. `packages/shared` : `usernamePatternSource` + tests
2. gateway : câblage Ajv/Zod sur les quatre sites + tests
3. iOS + Android : filtrage, fix ASCII, message + tests
4. `EmailService` : template + tests
5. script de migration + tests unitaires de `planRename`
6. **dry-run en lecture seule contre la production**, rapport présenté
7. `--apply` **uniquement après feu vert explicite** sur le rapport

L'étape 7 renomme deux comptes vivants et écrit à deux vraies boîtes mail : elle ne
s'exécute pas sans validation humaine du rapport de l'étape 6.
