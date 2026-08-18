# Interdire l'espace dans les usernames — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre l'espace impossible à saisir dans un username sur les quatre clients, faire dire la même chose aux couches Ajv et Zod, puis nettoyer les deux comptes legacy en production et leur envoyer un rappel de leur identifiant.

**Architecture :** Une seule chaîne `usernamePatternSource` exportée depuis `packages/shared/types/api-schemas.ts` devient la source de vérité — consommée telle quelle par Ajv (`pattern`) et compilée en `RegExp` par les six schémas Zod et par `normalizeUsername`. C'est exactement le mécanisme déjà en place pour `personNamePatternSource`. Les clients iOS et Android gagnent un filtrage à la frappe (parité web) et un jeu de caractères ASCII qui est enfin le vrai miroir du serveur. Le nettoyage des données est un script de migration en dry-run par défaut, dont la logique décisionnelle est une fonction pure testable hors base.

**Tech Stack :** TypeScript strict + Zod + Ajv (Fastify 5), vitest (`packages/shared`), jest (gateway), Swift/Combine (MeeshySDK/MeeshyUI) + XCTest, Kotlin/Compose (Android) + JUnit, MongoDB driver natif pour la migration.

**Spec de référence :** `docs/superpowers/specs/2026-08-18-username-no-spaces-design.md`

## Global Constraints

- **Gestionnaire de paquets : `bun` 1.3.14** (parité CI). Derrière un proxy, utiliser `bun install --ignore-scripts`.
- **Prérequis avant tout test gateway** (sinon ~17 suites échouent pour des raisons sans rapport) :
  `cd packages/shared && npx prisma generate --generator client && bun run build`
- **TDD non négociable** : RED → GREEN → REFACTOR. Aucun code de production sans test rouge d'abord.
- **Pas de `any`**, pas de commentaire qui paraphrase le code ; un commentaire n'existe que pour expliquer un *pourquoi* non déductible.
- **Le pattern est ancré** : `^[a-zA-Z0-9_-]+$`. `pattern` en JSON Schema est une recherche **partielle** — sans ancres, Ajv accepterait `"a b"`.
- **Longueurs hors scope.** Trois règles coexistent (2–16, 3–30, 3–32). Aucune tâche ne les touche.
- **Copie du mail : aucun mot de modification.** Le corps ne doit contenir ni « modifié », ni « changé », ni « nouveau », ni leurs équivalents dans les 6 langues. C'est une règle produit, verrouillée par test.
- **Git** : commits par chemin explicite, **jamais** `git add -A` (des sessions concurrentes ont du WIP non committé dans cet arbre). **Jamais** `git commit --amend`. **Pas** de trailer `Co-Authored-By`.
- **Les tâches 7 et 8 touchent la production.** La tâche 8 ne s'exécute pas sans feu vert humain explicite sur le rapport de la tâche 7.

## File Structure

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `packages/shared/types/api-schemas.ts` | **Déclare** `usernamePatternSource` ; l'applique au body Ajv d'inscription | 1 |
| `packages/shared/utils/validation.ts` | Compile `USERNAME_PATTERN` ; 3 schémas Zod (register, updateUsername, CommonSchemas) | 1 |
| `packages/shared/types/validation.ts` | `usernameSchema` (Zod) | 1 |
| `packages/shared/types/validation/admin-user.ts` | Création + update admin (Zod) | 1 |
| `packages/shared/__tests__/username-pattern.test.ts` | **Nouveau.** Garde comportementale : les 6 schémas Zod et la sémantique Ajv rendent le même verdict | 1 |
| `services/gateway/src/utils/normalize.ts` | `normalizeUsername` compile depuis la source | 2 |
| `services/gateway/src/routes/users/profile.ts` | Extrait `updateUsernameBodySchema` et lui pose le `pattern` | 2 |
| `services/gateway/src/__tests__/unit/routes/username-pattern-contract.test.ts` | **Nouveau.** Monte les vrais schémas dans un Fastify nu → verdict Ajv **réel** | 2 |
| `packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift` | Jeu ASCII, filtrage `didSet`, message de format | 3 |
| `packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings` | Clé `auth.registration.usernameFormat` | 3 |
| `packages/MeeshySDK/Tests/MeeshyUITests/RegistrationLocalValidationTests.swift` | Cas username ajoutés | 3 |
| `apps/android/core/model/.../auth/SignupAvailability.kt` | Jeu ASCII + `sanitizedUsername` | 4 |
| `apps/android/feature/auth/.../RegistrationViewModel.kt` | `onUsernameChange` filtre | 4 |
| `apps/android/feature/auth/.../RegistrationScreen.kt` + `res/values*/strings.xml` | Ligne d'aide permanente sous le champ (4 locales) | 4 |
| `apps/android/core/model/src/test/.../SignupAvailabilityTest.kt` | Cas username ajoutés | 4 |
| `services/gateway/src/services/EmailService.ts` | `sendUsernameReminderEmail` + traductions ×6 | 5 |
| `services/gateway/src/__tests__/unit/services/EmailService.test.ts` | Rendu du handle + garde de vocabulaire | 5 |
| `scripts/migrations/strip-spaces-from-usernames.ts` | **Nouveau.** `planRename` pure + exécution dry-run/apply | 6 |
| `scripts/migrations/__tests__/strip-spaces-from-usernames.test.ts` | **Nouveau.** Tests unitaires de `planRename` | 6 |

### Hors scope, délibérément

- **Les 5 copies du littéral côté web** (`use-field-validation.ts:54`, `use-register-form.ts:284`, `use-registration-validation.ts:48`, plus les deux `replace(…, '_')` dérivant un username d'un email dans `use-register-form.ts:156` et `use-registration-submit.ts:248`). Elles sont **déjà correctes** — elles rejettent l'espace. Les câbler sur `usernamePatternSource` ferait entrer les ~3 000 lignes de `api-schemas.ts` dans un bundle client Next.js pour une constante de 18 caractères, et aucun précédent web n'importe `personNamePatternSource`. Le charset ne changeant pas ici, il n'y a rien à propager. À revoir le jour où le charset bouge vraiment.
- **Les sites de parsing de mentions** (`mention-parser.ts`, `types/mention.ts`, `MentionService.ts`, `middleware/rate-limiter.ts`) : ils ont déjà leur propre SSOT `MENTION_HANDLE_CHARS`.

---

### Task 1: Source de vérité `usernamePatternSource` dans `packages/shared`

**Files:**
- Modify: `packages/shared/types/api-schemas.ts:2995-3007`
- Modify: `packages/shared/utils/validation.ts:8,20,169,394-400,418-422`
- Modify: `packages/shared/types/validation.ts:50-54`
- Modify: `packages/shared/types/validation/admin-user.ts:7,68`
- Test: `packages/shared/__tests__/username-pattern.test.ts` (nouveau)

**Interfaces:**
- Consomme : rien (première tâche).
- Produit : `export const usernamePatternSource: string` depuis `packages/shared/types/api-schemas.ts`, réexporté par `@meeshy/shared/types`. Valeur exacte : `"^[a-zA-Z0-9_-]+$"`. Les tâches 2, 3 et 4 s'y réfèrent (la 2 l'importe, les 3 et 4 le miroitent).

- [ ] **Step 1: Écrire le test rouge**

Créer `packages/shared/__tests__/username-pattern.test.ts` :

```ts
import {
  usernamePatternSource,
  registerRequestSchema,
} from '../types/api-schemas';
import { AuthSchemas, updateUsernameSchema, CommonSchemas } from '../utils/validation';
import { usernameSchema } from '../types/validation';
import {
  createUserValidationSchema,
  updateUserProfileValidationSchema,
} from '../types/validation/admin-user';

const REJECTED = ['la lionne noire', 'a b', ' ab', 'ab ', 'a\tb', 'josé', 'a.b', 'a@b'];
const ACCEPTED = ['abc', 'a_b-1', 'ABC123', '__', '--'];

describe('usernamePatternSource', () => {
  it('est ancré des deux côtés', () => {
    expect(usernamePatternSource.startsWith('^')).toBe(true);
    expect(usernamePatternSource.endsWith('$')).toBe(true);
  });

  // `pattern` en JSON Schema est une recherche ECMA-262 NON ancrée : Ajv fait
  // exactement `new RegExp(source).test(value)`. Reproduire cette sémantique ici
  // teste le vrai comportement d'Ajv sans tirer la dépendance dans ce paquet.
  // Le verdict d'Ajv RÉEL, monté dans Fastify, est vérifié côté gateway.
  const ajvSemantics = (value: string) => new RegExp(usernamePatternSource).test(value);

  it.each(REJECTED)('rejette %j', (value) => {
    expect(ajvSemantics(value)).toBe(false);
  });

  it.each(ACCEPTED)('accepte %j', (value) => {
    expect(ajvSemantics(value)).toBe(true);
  });
});

describe('registerRequestSchema (couche Ajv)', () => {
  it('porte le pattern sur username', () => {
    expect(registerRequestSchema.properties.username.pattern).toBe(usernamePatternSource);
  });
});

// Chaque schéma username exporté doit rendre le MÊME verdict que la couche Ajv.
// La garde porte sur le COMPORTEMENT, pas sur l'absence textuelle du littéral :
// un schéma qui réintroduirait sa propre copie divergente échouerait ici.
const zodUsernameGates: ReadonlyArray<readonly [string, (value: string) => boolean]> = [
  ['AuthSchemas.register', (v) => AuthSchemas.register.shape.username.safeParse(v).success],
  ['updateUsernameSchema', (v) => updateUsernameSchema.shape.newUsername.safeParse(v).success],
  ['CommonSchemas.username', (v) => CommonSchemas.username.safeParse(v).success],
  ['usernameSchema', (v) => usernameSchema.safeParse(v).success],
  ['admin create', (v) => createUserValidationSchema.shape.username.safeParse(v).success],
  ['admin update', (v) => updateUserProfileValidationSchema.shape.username.safeParse(v).success],
];

describe.each(zodUsernameGates)('schéma Zod %s', (_name, accepts) => {
  it.each(['la lionne noire', 'a b', 'josé'])('rejette %j', (value) => {
    expect(accepts(value)).toBe(false);
  });

  it('accepte un handle conforme assez long pour toutes les bornes', () => {
    expect(accepts('a_b-1234')).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
cd packages/shared && bunx vitest run __tests__/username-pattern.test.ts
```

Attendu : ÉCHEC. `usernamePatternSource` n'est pas exporté (erreur de résolution), et `registerRequestSchema.properties.username.pattern` vaut `undefined`.

- [ ] **Step 3: Déclarer la source unique**

Dans `packages/shared/types/api-schemas.ts`, juste après `personNamePatternSource` (ligne 2995) :

```ts
/**
 * Nom d'utilisateur : ASCII strict — lettres, chiffres, `-`, `_`. Aucun espace.
 *
 * Source unique partagée : consommée telle quelle par Ajv (`pattern` ci-dessous,
 * et body de `PATCH /users/me/username`) et compilée en RegExp par les schémas
 * Zod (`utils/validation.ts`, `types/validation.ts`, `types/validation/admin-user.ts`)
 * ainsi que par `normalizeUsername` (gateway/utils/normalize.ts), pour que toutes
 * les couches rendent le même verdict.
 *
 * Ancré (`^…$`) parce que `pattern` en JSON Schema est une recherche PARTIELLE :
 * sans ancres, Ajv accepterait `"la lionne noire"` (elle contient `"la"`) là où le
 * Zod, ancré par construction, la refuse. Même raison que `personNamePatternSource`.
 *
 * Miroirs clients : `RegistrationViewModel.isUsernameValidLocally` (iOS),
 * `SignupFieldValidation.isUsernameValidLocally` (Android). Le charset est ASCII
 * et NON Unicode : `josé` doit être refusé côté client comme côté serveur.
 */
export const usernamePatternSource = "^[a-zA-Z0-9_-]+$";
```

- [ ] **Step 4: Poser le `pattern` sur le body Ajv d'inscription**

Dans le même fichier, `registerRequestSchema.properties.username` :

```ts
    username: {
      type: 'string',
      minLength: 2,
      maxLength: 16,
      pattern: usernamePatternSource,
      description: 'Unique username (2-16 chars: letters, digits, - and _ only — no spaces)'
    },
```

- [ ] **Step 5: Compiler la source dans `utils/validation.ts`**

Ligne 8, étendre l'import existant :

```ts
import { personNamePatternSource, usernamePatternSource } from '../types/api-schemas.js';
```

Après `PERSON_NAME_PATTERN` (ligne 20) :

```ts
/**
 * Nom d'utilisateur. Compilé depuis la source unique `usernamePatternSource`
 * (types/api-schemas.ts) pour que la couche Ajv (body JSON schema Fastify) et la
 * couche Zod rendent le même verdict — notamment le refus de l'espace et des
 * lettres accentuées, que le charset ASCII exclut.
 */
const USERNAME_PATTERN = new RegExp(usernamePatternSource);
```

Puis remplacer les trois littérales par `USERNAME_PATTERN`, en gardant chaque message d'erreur tel quel :

```ts
// ~ligne 169 — CommonSchemas.username
  username: z.string().min(3, 'Username trop court').max(30, 'Username trop long')
    .regex(USERNAME_PATTERN, 'Username invalide'),

// ~ligne 397 — updateUsernameSchema
    .regex(USERNAME_PATTERN, 'Username invalide (lettres, chiffres, - et _ uniquement)'),

// ~ligne 421 — AuthSchemas.register
    .regex(USERNAME_PATTERN, 'Username invalide (lettres, chiffres, - et _ uniquement)'),
```

- [ ] **Step 6: Compiler la source dans `types/validation.ts`**

Après l'import de `zod` (ligne 6) :

```ts
import { usernamePatternSource } from './api-schemas.js';
```

Puis ligne 53 :

```ts
  .regex(new RegExp(usernamePatternSource), 'Le nom d\'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores')
```

- [ ] **Step 7: Compiler la source dans `types/validation/admin-user.ts`**

Après l'import de `zod` (ligne 1) :

```ts
import { usernamePatternSource } from '../api-schemas.js';

const USERNAME_PATTERN = new RegExp(usernamePatternSource);
```

Puis les deux sites :

```ts
// ligne 7 — createUserValidationSchema
  username: z.string().min(3).max(30).regex(USERNAME_PATTERN),

// ligne 68 — updateUserProfileValidationSchema
  username: z.string().min(3).max(30).regex(USERNAME_PATTERN).optional(),
```

- [ ] **Step 8: Lancer le test pour vérifier qu'il passe**

```bash
cd packages/shared && bunx vitest run __tests__/username-pattern.test.ts
```

Attendu : PASS, tous les cas.

- [ ] **Step 9: Vérifier la suite complète et la compilation**

```bash
cd packages/shared && bun run test && bun run type-check && bun run build
```

Attendu : suite verte, `tsc` sans erreur, `dist/` régénéré.

Le seuil de couverture de `packages/shared` est à 98 % de lignes sur `utils/**`. `USERNAME_PATTERN` est une ligne exécutable de plus, exercée par les nouveaux tests — le seuil doit tenir. Confirmer :

```bash
cd packages/shared && bun run test:coverage
```

Attendu : seuils respectés (branches 94, functions 93, lines 98, statements 98).

- [ ] **Step 10: Commit**

```bash
git add packages/shared/types/api-schemas.ts packages/shared/utils/validation.ts \
        packages/shared/types/validation.ts packages/shared/types/validation/admin-user.ts \
        packages/shared/__tests__/username-pattern.test.ts
git commit -m "feat(shared): usernamePatternSource devient la source unique, Ajv et Zod rendent enfin le même verdict"
```

---

### Task 2: Gateway — `normalizeUsername` et le body Ajv de `PATCH /users/me/username`

**Files:**
- Modify: `services/gateway/src/utils/normalize.ts:151-174`
- Modify: `services/gateway/src/routes/users/profile.ts:619-634`
- Test: `services/gateway/src/__tests__/unit/routes/username-pattern-contract.test.ts` (nouveau)

**Interfaces:**
- Consomme : `usernamePatternSource` de la tâche 1, via `@meeshy/shared/types`.
- Produit : `export const updateUsernameBodySchema` depuis `services/gateway/src/routes/users/profile.ts` — l'objet JSON Schema exact que la route monte, extrait précisément pour être montable dans un test.

**Pourquoi un fichier de test neuf.** `services/gateway/src/__tests__/unit/routes/auth-register.test.ts` **mocke** `@meeshy/shared/types` et remplace `registerRequestSchema` par `{ type: 'object', additionalProperties: true }`, et mocke `validateSchema` en passe-plat. Y ajouter un cas de pattern testerait le mock, pas Ajv. Le nouveau fichier monte les **vrais** schémas dans un Fastify nu : le 400 vient du vrai compilateur Ajv de Fastify.

- [ ] **Step 1: Écrire le test rouge**

Créer `services/gateway/src/__tests__/unit/routes/username-pattern-contract.test.ts` :

```ts
/**
 * Le contrat username est rendu par DEUX moteurs : Ajv (body JSON Schema
 * Fastify) et Zod (validateSchema). Ce fichier monte les schémas RÉELS dans une
 * instance Fastify nue — pas de mock — pour que le 400 provienne du vrai
 * compilateur Ajv. Les suites de route voisines mockent `@meeshy/shared/types`,
 * ce qui les rend structurellement aveugles à ce contrat.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { registerRequestSchema } from '@meeshy/shared/types';
import { AuthSchemas } from '@meeshy/shared/utils/validation';
import { updateUsernameBodySchema } from '../../../routes/users/profile';

const VALID_REGISTRATION = {
  username: 'alice',
  password: 'motdepasse123',
  firstName: 'Alice',
  lastName: 'Martin',
  email: 'alice@example.com',
};

describe('contrat username — couche Ajv', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Mêmes options Ajv que le vrai serveur (server.ts:203) : sans `strict: 'log'`
    // et le mot-clé `example`, Ajv REFUSE de compiler les schémas OpenAPI du dépôt
    // et `ready()` lève — le test échouerait pour une raison sans rapport avec le
    // contrat qu'il vérifie.
    app = Fastify({
      ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
    });
    app.post('/register', { schema: { body: registerRequestSchema } }, async () => ({ ok: true }));
    app.patch('/username', { schema: { body: updateUsernameBodySchema } }, async () => ({ ok: true }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['la lionne noire', 'vanel momo', 'a b', 'josé'])(
    'POST /register refuse le username %j',
    async (username) => {
      const res = await app.inject({
        method: 'POST',
        url: '/register',
        payload: { ...VALID_REGISTRATION, username },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain('username');
    },
  );

  it('POST /register accepte un username conforme', async () => {
    const res = await app.inject({ method: 'POST', url: '/register', payload: VALID_REGISTRATION });
    expect(res.statusCode).toBe(200);
  });

  it.each(['la lionne noire', 'a b', 'josé'])(
    'PATCH /users/me/username refuse le username %j',
    async (newUsername) => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/username',
        payload: { newUsername, currentPassword: 'motdepasse123' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain('newUsername');
    },
  );

  it('PATCH /users/me/username accepte un username conforme', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/username',
      payload: { newUsername: 'lalionnenoire', currentPassword: 'motdepasse123' },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('contrat username — couche Zod', () => {
  it.each(['la lionne noire', 'a b', 'josé'])('AuthSchemas.register refuse %j', (username) => {
    const result = AuthSchemas.register.safeParse({ ...VALID_REGISTRATION, username });
    expect(result.success).toBe(false);
  });
});

describe('normalizeUsername', () => {
  it('refuse un username porteur d\'un espace interne', async () => {
    const { normalizeUsername } = await import('../../../utils/normalize');
    expect(() => normalizeUsername('la lionne noire')).toThrow(/lettres, chiffres/);
  });

  it('refuse une lettre accentuée', async () => {
    const { normalizeUsername } = await import('../../../utils/normalize');
    expect(() => normalizeUsername('josé')).toThrow(/lettres, chiffres/);
  });

  it('conserve un username conforme, espaces de bord retirés', async () => {
    const { normalizeUsername } = await import('../../../utils/normalize');
    expect(normalizeUsername('  lalionnenoire  ')).toBe('lalionnenoire');
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/routes/username-pattern-contract.test.ts
```

Attendu : ÉCHEC à l'import — `updateUsernameBodySchema` n'est pas exporté par `routes/users/profile`.

- [ ] **Step 3: Extraire et durcir le body schema de `PATCH /users/me/username`**

Dans `services/gateway/src/routes/users/profile.ts`, étendre l'import existant (lignes 13-18) — le fichier importe déjà depuis le sous-chemin `api-schemas`, ne pas ajouter un second import :

```ts
import {
  userSchema,
  userMinimalSchema,
  updateUserRequestSchema,
  errorResponseSchema,
  usernamePatternSource
} from '@meeshy/shared/types/api-schemas';
```

Puis, au-dessus de `export async function updateUsername` (ligne 619) :

```ts
/**
 * Body de `PATCH /users/me/username`, extrait de la déclaration de route pour
 * être montable dans un test sans booter le service entier — le contrat Ajv est
 * ainsi vérifié par le vrai compilateur, pas par une copie du schéma.
 */
export const updateUsernameBodySchema = {
  type: 'object',
  required: ['newUsername', 'currentPassword'],
  properties: {
    newUsername: {
      type: 'string',
      minLength: 2,
      maxLength: 16,
      pattern: usernamePatternSource,
      description: 'New username (2-16 chars: letters, digits, - and _ only — no spaces)'
    },
    currentPassword: { type: 'string', minLength: 1, description: 'Current password for verification' }
  }
} as const;
```

Puis, dans la déclaration de route, remplacer le body inline :

```ts
      body: updateUsernameBodySchema,
```

- [ ] **Step 4: Compiler `normalizeUsername` depuis la source**

Dans `services/gateway/src/utils/normalize.ts`, ajouter en tête (après l'import de `libphonenumber-js`) :

```ts
import { usernamePatternSource } from '@meeshy/shared/types';
```

Après le `logger` (ligne 8) :

```ts
const USERNAME_PATTERN = new RegExp(usernamePatternSource);
```

Puis, dans `normalizeUsername`, remplacer la déclaration locale (lignes 167-168) :

```ts
  // Validation des caractères — compilée depuis `usernamePatternSource`
  // (packages/shared/types/api-schemas.ts) pour que ce chemin serveur rende le
  // même verdict que les couches Ajv et Zod.
  if (!USERNAME_PATTERN.test(trimmed)) {
    throw new Error('Le nom d\'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores');
  }
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/routes/username-pattern-contract.test.ts
```

Attendu : PASS, tous les cas.

- [ ] **Step 6: Vérifier la non-régression des suites voisines**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/routes/auth-register.test.ts \
  src/__tests__/unit/routes/users/profile.test.ts \
  src/__tests__/unit/utils
```

Attendu : vert. Ces suites mockent le schéma partagé, donc le nouveau `pattern` ne les atteint pas ; un rouge ici signalerait un vrai couplage à investiguer, pas à contourner.

- [ ] **Step 7: Commit**

```bash
git add services/gateway/src/utils/normalize.ts \
        services/gateway/src/routes/users/profile.ts \
        services/gateway/src/__tests__/unit/routes/username-pattern-contract.test.ts
git commit -m "feat(gateway): le body Ajv de changement d'username porte enfin le pattern, normalizeUsername compile depuis la source"
```

---

### Task 3: iOS — filtrage à la frappe, jeu ASCII, message de format

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift:92,226-238,276-281`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/RegistrationLocalValidationTests.swift`

**Interfaces:**
- Consomme : la valeur de `usernamePatternSource` (tâche 1) comme spécification — miroitée en Swift, pas importée.
- Produit : `RegistrationViewModel.sanitizedUsername(_:) -> String` (statique, **internal**) et `isUsernameValidLocally(_:) -> Bool` (**internal**, plus `private`). L'accès `internal` est requis : `@testable import` expose `internal`, jamais `private` — c'est pourquoi le test actuel n'exerce que `isNameValidLocally`, qui est `public`.

**Contexte — pourquoi le champ est muet aujourd'hui.** `OnboardingStepViews.swift:206` rend déjà `errorMessage: viewModel.usernameError`. Mais le sink de debounce (`RegistrationViewModel.swift:230-235`) fait exactement l'inverse de ce qu'il faudrait : sur violation de format il remet `usernameError` à `nil`. Le champ est donc structurellement silencieux précisément quand il aurait quelque chose à dire. La vue n'a pas besoin d'être touchée.

- [ ] **Step 1: Écrire les tests rouges**

Ajouter à `packages/MeeshySDK/Tests/MeeshyUITests/RegistrationLocalValidationTests.swift`, avant la dernière accolade fermante :

```swift
    // MARK: - Username (miroir ASCII de usernamePatternSource)

    func test_isUsernameValidLocally_plainHandle_isValid() {
        XCTAssertTrue(makeViewModel().isUsernameValidLocally("alice"))
    }

    func test_isUsernameValidLocally_dashesAndUnderscores_areValid() {
        XCTAssertTrue(makeViewModel().isUsernameValidLocally("a_b-1"))
    }

    func test_isUsernameValidLocally_internalSpace_isInvalid() {
        // Le bug rapporté : « la lionne noire » passait le gate côté client.
        XCTAssertFalse(makeViewModel().isUsernameValidLocally("la lionne noire"))
    }

    func test_isUsernameValidLocally_accentedLetter_isInvalid() {
        // CharacterSet.alphanumerics est UNICODE : il acceptait `josé`, que le
        // serveur (ASCII) refuse — d'où un « Données invalides » à la soumission.
        XCTAssertFalse(makeViewModel().isUsernameValidLocally("josé"))
    }

    func test_sanitizedUsername_stripsSpaces() {
        XCTAssertEqual(RegistrationViewModel.sanitizedUsername("la lionne noire"), "lalionnenoire")
    }

    func test_sanitizedUsername_stripsAccentsAndPunctuation() {
        XCTAssertEqual(RegistrationViewModel.sanitizedUsername("josé.m@il"), "josmil")
    }

    func test_sanitizedUsername_keepsConformingHandleUntouched() {
        XCTAssertEqual(RegistrationViewModel.sanitizedUsername("a_b-1"), "a_b-1")
    }

    func test_sanitizedUsername_capsAtSixteenCharacters() {
        XCTAssertEqual(RegistrationViewModel.sanitizedUsername(String(repeating: "a", count: 40)).count, 16)
    }

    func test_username_assignmentFiltersInPlace() {
        // Point d'étranglement unique : frappe, collage et restauration d'état
        // passent tous par l'affectation de `username`.
        let vm = makeViewModel()
        vm.username = "la lionne noire"
        XCTAssertEqual(vm.username, "lalionnenoire")
    }
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
cd packages/MeeshySDK && swift test --filter RegistrationLocalValidationTests
```

Attendu : ÉCHEC de compilation — `isUsernameValidLocally` est `private` (inaccessible même sous `@testable`), et `sanitizedUsername` n'existe pas.

- [ ] **Step 3: Poser le jeu ASCII et le sanitizer**

Dans `packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift`, remplacer `isUsernameValidLocally` (lignes 276-281) par :

```swift
    /// Miroir ASCII strict de `usernamePatternSource` (`^[a-zA-Z0-9_-]+$`,
    /// packages/shared/types/api-schemas.ts). Déclaré caractère par caractère et
    /// NON via `CharacterSet.alphanumerics`, qui est Unicode : il acceptait `josé`
    /// que le serveur refuse, et le compte se faisait rejeter à la soumission.
    static let usernameAllowed = CharacterSet(charactersIn:
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-")

    /// Longueur maximale acceptée par `registerRequestSchema.username`.
    static let usernameMaxLength = 16

    /// Retire tout caractère hors charset et borne la longueur. Silencieux, comme
    /// le filtrage web (`UsernameField.tsx`) : la ligne d'aide sous le champ
    /// énonce la règle en permanence, donc la disparition d'un caractère n'est
    /// pas mystérieuse.
    static func sanitizedUsername(_ value: String) -> String {
        let kept = value.unicodeScalars.filter { usernameAllowed.contains($0) }
        return String(String.UnicodeScalarView(kept.prefix(usernameMaxLength)))
    }

    func isUsernameValidLocally(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2, trimmed.count <= Self.usernameMaxLength else { return false }
        return CharacterSet(charactersIn: trimmed).isSubset(of: Self.usernameAllowed)
    }
```

- [ ] **Step 4: Filtrer à l'affectation**

Ligne 92, remplacer la déclaration du champ :

```swift
    /// Le `didSet` est le point d'étranglement UNIQUE : il attrape la frappe, le
    /// collage, l'adoption d'une suggestion et la restauration d'état. La garde de
    /// ré-entrance est obligatoire — sans elle, la réassignation relance `didSet`
    /// en boucle.
    @Published public var username = "" {
        didSet {
            let sanitized = Self.sanitizedUsername(username)
            guard sanitized != username else { return }
            username = sanitized
        }
    }
```

- [ ] **Step 5: Faire parler le sink**

Lignes 226-238, remplacer le sink username :

```swift
        $username
            .debounce(for: .seconds(1), scheduler: RunLoop.main)
            .removeDuplicates()
            .sink { [weak self] value in
                guard let self else { return }
                guard self.isUsernameValidLocally(value) else {
                    self.usernameAvailable = nil
                    self.usernameSuggestions = []
                    // Le champ était muet ici : il posait `nil` et renonçait, si
                    // bien qu'un pseudo trop court n'affichait jamais pourquoi le
                    // bouton restait gris.
                    self.usernameError = value.isEmpty ? nil : String(
                        localized: "auth.registration.usernameFormat",
                        defaultValue: "2 à 16 caractères : lettres, chiffres, - et _",
                        bundle: .module
                    )
                    return
                }
                self.checkUsernameAvailability(value)
            }
            .store(in: &cancellables)
```

- [ ] **Step 6: Ajouter la clé au catalogue**

Dans `packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings`, ajouter dans l'objet `strings`, à sa place alphabétique juste avant `auth.registration.usernameTaken`, l'entrée suivante. Les sept langues sont celles que porte déjà `usernameTaken` (`ar`, `de`, `en`, `es`, `fr`, `it`, `pt-BR`) :

```json
    "auth.registration.usernameFormat" : {
      "extractionState" : "extracted_with_value",
      "localizations" : {
        "ar" : {
          "stringUnit" : { "state" : "translated", "value" : "من 2 إلى 16 حرفًا: أحرف وأرقام و- و_" }
        },
        "de" : {
          "stringUnit" : { "state" : "translated", "value" : "2 bis 16 Zeichen: Buchstaben, Ziffern, - und _" }
        },
        "en" : {
          "stringUnit" : { "state" : "translated", "value" : "2 to 16 characters: letters, digits, - and _" }
        },
        "es" : {
          "stringUnit" : { "state" : "translated", "value" : "De 2 a 16 caracteres: letras, números, - y _" }
        },
        "fr" : {
          "stringUnit" : { "state" : "translated", "value" : "2 à 16 caractères : lettres, chiffres, - et _" }
        },
        "it" : {
          "stringUnit" : { "state" : "translated", "value" : "Da 2 a 16 caratteri: lettere, numeri, - e _" }
        },
        "pt-BR" : {
          "stringUnit" : { "state" : "translated", "value" : "De 2 a 16 caracteres: letras, números, - e _" }
        }
      }
    },
```

La valeur française porte tous ses accents. Le cliquet français ne détecte **pas** les clés dépourvues d'accent — il ne rattraperait pas une valeur écrite « 2 a 16 caracteres ». L'entrée voisine `usernameTaken` en est justement un exemple (« Ce pseudo est deja pris! », état `new`) : ne pas la prendre pour modèle sur ce point.

- [ ] **Step 7: Lancer les tests pour vérifier qu'ils passent**

```bash
cd packages/MeeshySDK && swift test --filter RegistrationLocalValidationTests
```

Attendu : PASS, tous les cas.

- [ ] **Step 8: Vérifier que l'app compile**

```bash
./apps/ios/meeshy.sh build
```

Attendu : BUILD SUCCEEDED. La vue `OnboardingStepViews.swift` n'est pas modifiée — elle rend déjà `viewModel.usernameError`.

- [ ] **Step 9: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings \
        packages/MeeshySDK/Tests/MeeshyUITests/RegistrationLocalValidationTests.swift
git commit -m "fix(ios/auth): l'espace n'est plus saisissable dans le pseudo, et le champ dit enfin pourquoi il refuse"
```

---

### Task 4: Android — filtrage à la frappe, jeu ASCII, ligne d'aide

**Files:**
- Modify: `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/SignupAvailability.kt:25,42-46`
- Modify: `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/RegistrationViewModel.kt:228-231`
- Modify: `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/RegistrationScreen.kt:340-347`
- Modify: `apps/android/feature/auth/src/main/res/values/strings.xml` + `values-fr` + `values-es` + `values-pt`
- Test: `apps/android/core/model/src/test/kotlin/me/meeshy/sdk/model/auth/SignupAvailabilityTest.kt`

**Interfaces:**
- Consomme : la valeur de `usernamePatternSource` (tâche 1) comme spécification ; symétrie de comportement avec `RegistrationViewModel.sanitizedUsername` (tâche 3).
- Produit : `SignupFieldValidation.sanitizedUsername(value: String): String`, même contrat que la version iOS (filtre hors-charset, borne à `USERNAME_MAX_LENGTH`).

- [ ] **Step 1: Écrire les tests rouges**

Ajouter à `apps/android/core/model/src/test/kotlin/me/meeshy/sdk/model/auth/SignupAvailabilityTest.kt`, dans la classe existante. Le fichier assertionne via **Truth** (`com.google.common.truth.Truth.assertThat`, déjà importé) — pas via `org.junit.Assert` ; aucun import à ajouter :

```kotlin
    @Test
    fun `isUsernameValidLocally rejects internal space`() {
        assertThat(SignupFieldValidation.isUsernameValidLocally("la lionne noire")).isFalse()
    }

    @Test
    fun `isUsernameValidLocally rejects accented letter`() {
        // isLetterOrDigit() est UNICODE : il acceptait `josé`, que le serveur
        // (ASCII) refuse — l'inscription échouait à la soumission.
        assertThat(SignupFieldValidation.isUsernameValidLocally("josé")).isFalse()
    }

    @Test
    fun `isUsernameValidLocally accepts dashes and underscores`() {
        assertThat(SignupFieldValidation.isUsernameValidLocally("a_b-1")).isTrue()
    }

    @Test
    fun `sanitizedUsername strips spaces`() {
        assertThat(SignupFieldValidation.sanitizedUsername("la lionne noire")).isEqualTo("lalionnenoire")
    }

    @Test
    fun `sanitizedUsername strips accents and punctuation`() {
        assertThat(SignupFieldValidation.sanitizedUsername("josé.m@il")).isEqualTo("josmil")
    }

    @Test
    fun `sanitizedUsername keeps a conforming handle untouched`() {
        assertThat(SignupFieldValidation.sanitizedUsername("a_b-1")).isEqualTo("a_b-1")
    }

    @Test
    fun `sanitizedUsername caps at the max length`() {
        assertThat(SignupFieldValidation.sanitizedUsername("a".repeat(40)).length)
            .isEqualTo(SignupFieldValidation.USERNAME_MAX_LENGTH)
    }
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
cd apps/android && ./gradlew :core:model:testDebugUnitTest --tests '*SignupAvailabilityTest*'
```

Attendu : ÉCHEC de compilation (`sanitizedUsername` n'existe pas) et échec de `josé`, encore accepté.

- [ ] **Step 3: Poser le jeu ASCII et le sanitizer**

Dans `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/SignupAvailability.kt`, remplacer `usernameExtraAllowed` (ligne 25) et `isUsernameValidLocally` (lignes 42-46) :

```kotlin
    private val usernameExtraAllowed: Set<Char> = setOf('_', '-')

    /**
     * Miroir ASCII strict de `usernamePatternSource` (`^[a-zA-Z0-9_-]+$`,
     * packages/shared/types/api-schemas.ts). Volontairement NON `isLetterOrDigit()`,
     * qui est Unicode : il acceptait `josé` que le serveur refuse, et l'inscription
     * échouait à la soumission.
     */
    private fun isUsernameChar(c: Char): Boolean =
        c in 'a'..'z' || c in 'A'..'Z' || c in '0'..'9' || c in usernameExtraAllowed

    /**
     * Retire tout caractère hors charset et borne la longueur. Silencieux, comme
     * le filtrage web et iOS : la ligne d'aide sous le champ énonce la règle en
     * permanence.
     */
    fun sanitizedUsername(value: String): String =
        value.filter(::isUsernameChar).take(USERNAME_MAX_LENGTH)

    /**
     * True when the trimmed username is 2..16 chars and every character is an
     * ASCII letter, an ASCII digit, or one of `_ -`.
     */
    fun isUsernameValidLocally(value: String): Boolean {
        val trimmed = value.trim()
        if (trimmed.length < USERNAME_MIN_LENGTH || trimmed.length > USERNAME_MAX_LENGTH) return false
        return trimmed.all(::isUsernameChar)
    }
```

Ajouter également, dans le KDoc de tête du fichier (après la ligne « SOTA note: … every branch is JVM-testable. »), la précision qui manque désormais :

```kotlin
 * Le charset username est ASCII, pas Unicode : c'est le miroir de
 * `usernamePatternSource` (`^[a-zA-Z0-9_-]+$`, packages/shared/types/api-schemas.ts),
 * PAS de `Char.isLetterOrDigit()`. Un pseudo accentué doit être refusé ici comme
 * il l'est côté serveur.
```

- [ ] **Step 4: Filtrer dans `onUsernameChange`**

Dans `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/RegistrationViewModel.kt`, lignes 228-231 :

```kotlin
    fun onUsernameChange(value: String) {
        // Point d'étranglement unique : le champ Compose est piloté par l'état, donc
        // filtrer ici renvoie la valeur épurée au `OutlinedTextField` — frappe et
        // collage passent tous deux par là.
        val sanitized = SignupFieldValidation.sanitizedUsername(value)
        usernameInput.value = sanitized
        editFields { it.copy(username = sanitized, usernameAvailable = null, usernameSuggestions = emptyList()) }
    }
```

Ajouter `import me.meeshy.sdk.model.auth.SignupFieldValidation` en tête du fichier s'il n'y est pas déjà.

- [ ] **Step 5: Afficher la règle en permanence**

Dans `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/RegistrationScreen.kt`, au champ username (lignes 340-347) :

```kotlin
        OutlinedTextField(
            value = state.fields.username,
            onValueChange = viewModel::onUsernameChange,
            label = { Text(stringResource(R.string.registration_username_label)) },
            supportingText = { Text(stringResource(R.string.registration_username_hint)) },
            singleLine = true,
            enabled = !state.isSubmitting,
            modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.md),
        )
```

- [ ] **Step 6: Ajouter la chaîne dans les quatre locales**

`apps/android/feature/auth/src/main/res/values/strings.xml` (après la ligne 21) :

```xml
    <string name="registration_username_hint">2–16 characters: letters, digits, - and _</string>
```

`values-fr/strings.xml` :

```xml
    <string name="registration_username_hint">2 à 16 caractères : lettres, chiffres, - et _</string>
```

`values-es/strings.xml` :

```xml
    <string name="registration_username_hint">2 a 16 caracteres: letras, numeros, - y _</string>
```

`values-pt/strings.xml` :

```xml
    <string name="registration_username_hint">2 a 16 caracteres: letras, numeros, - e _</string>
```

- [ ] **Step 7: Lancer les tests pour vérifier qu'ils passent**

```bash
cd apps/android && ./gradlew :core:model:testDebugUnitTest --tests '*SignupAvailabilityTest*'
```

Attendu : PASS, tous les cas.

- [ ] **Step 8: Vérifier que le module auth compile**

```bash
cd apps/android && ./gradlew :feature:auth:assembleDebug
```

Attendu : BUILD SUCCESSFUL.

- [ ] **Step 9: Commit**

```bash
git add apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/SignupAvailability.kt \
        apps/android/core/model/src/test/kotlin/me/meeshy/sdk/model/auth/SignupAvailabilityTest.kt \
        apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/RegistrationViewModel.kt \
        apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/RegistrationScreen.kt \
        apps/android/feature/auth/src/main/res/values/strings.xml \
        apps/android/feature/auth/src/main/res/values-fr/strings.xml \
        apps/android/feature/auth/src/main/res/values-es/strings.xml \
        apps/android/feature/auth/src/main/res/values-pt/strings.xml
git commit -m "fix(android/auth): l'espace n'est plus saisissable dans le pseudo, le charset devient ASCII comme le serveur"
```

---

### Task 5: `EmailService.sendUsernameReminderEmail`

**Files:**
- Modify: `services/gateway/src/services/EmailService.ts` (type après ligne 195 ; méthode + traductions après `sendAccountDeletionReminderEmail`, ligne 1561)
- Test: `services/gateway/src/__tests__/unit/services/EmailService.test.ts`

**Interfaces:**
- Consomme : rien des tâches précédentes.
- Produit : `EmailService.sendUsernameReminderEmail(data: UsernameReminderEmailData): Promise<EmailResult>` avec `UsernameReminderEmailData = { to: string; name: string; username: string; language?: string }`. La tâche 6 l'appelle.

**Règle produit verrouillée.** Le message énonce un fait vrai au présent et n'évoque **jamais** de modification. C'est une exigence explicite de l'utilisateur : le mail est un rappel, pas une notification de changement.

- [ ] **Step 1: Écrire les tests rouges**

Ajouter à `services/gateway/src/__tests__/unit/services/EmailService.test.ts`, en réutilisant le helper `getEmailServiceWithEnv` déjà présent en tête de fichier :

```ts
describe('sendUsernameReminderEmail', () => {
  const BREVO_ENV = { BREVO_API_KEY: 'test-key', EMAIL_FROM: 'no-reply@meeshy.me', EMAIL_FROM_NAME: 'Meeshy' };

  async function sendAndCapture(language: string) {
    mockAxiosPost.mockReset();
    mockAxiosPost.mockResolvedValue({ data: { messageId: 'msg-1' } });
    const { EmailService } = await getEmailServiceWithEnv(BREVO_ENV);
    await new EmailService().sendUsernameReminderEmail({
      to: 'verrainembilla@gmail.com',
      name: 'La Lionne Noire',
      username: 'lalionnenoire',
      language,
    });
    const payload = mockAxiosPost.mock.calls[0][1] as { subject: string; htmlContent: string; textContent: string };
    return payload;
  }

  it('rend le handle dans le HTML et dans le texte', async () => {
    const payload = await sendAndCapture('fr');
    expect(payload.htmlContent).toContain('@lalionnenoire');
    expect(payload.textContent).toContain('@lalionnenoire');
  });

  it('adresse la personne par son nom', async () => {
    const payload = await sendAndCapture('fr');
    expect(payload.textContent).toContain('La Lionne Noire');
  });

  // Règle produit : c'est un RAPPEL. Aucun vocabulaire de modification, dans
  // aucune langue — sans quoi le mail révélerait le renommage.
  const FORBIDDEN: Record<string, readonly string[]> = {
    fr: ['modifi', 'chang', 'nouveau', 'nouvelle', 'mis à jour'],
    en: ['chang', 'updat', 'new '],
    es: ['cambi', 'modific', 'nuevo'],
    pt: ['alter', 'modific', 'novo'],
    it: ['modific', 'cambi', 'nuovo'],
    de: ['geändert', 'aktualisiert', 'neue'],
  };

  it.each(Object.keys(FORBIDDEN))('n\'évoque aucune modification en %s', async (lang) => {
    const payload = await sendAndCapture(lang);
    const body = `${payload.subject}\n${payload.textContent}`.toLowerCase();
    for (const word of FORBIDDEN[lang]) {
      expect(body).not.toContain(word.toLowerCase());
    }
  });

  it('retombe sur l\'anglais pour une langue inconnue', async () => {
    const payload = await sendAndCapture('xx');
    expect(payload.htmlContent).toContain('@lalionnenoire');
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/EmailService.test.ts -t 'sendUsernameReminderEmail'
```

Attendu : ÉCHEC — `sendUsernameReminderEmail is not a function`.

- [ ] **Step 3: Déclarer le type de données**

Dans `services/gateway/src/services/EmailService.ts`, après `AccountDeletionReminderEmailData` (ligne 195) :

```ts
export interface UsernameReminderEmailData {
  to: string;
  name: string;
  username: string;
  language?: string;
}
```

- [ ] **Step 4: Écrire la table de traductions**

Après `getAccountDeletionReminderTranslations`, ajouter :

```ts
  /**
   * Copie strictement « rappel ». Chaque libellé énonce un fait vrai au présent ;
   * aucune formulation n'évoque une modification — c'est une règle produit, pas
   * une préférence de style, verrouillée par test dans EmailService.test.ts.
   */
  private getUsernameReminderTranslations(language: string): Record<string, string> {
    const translations: Record<string, Record<string, string>> = {
      fr: {
        subject: 'Votre identifiant Meeshy',
        title: 'Votre identifiant',
        subtitle: 'Petit rappel',
        greeting: 'Bonjour',
        intro: 'Petit rappel : votre nom d\'utilisateur Meeshy est',
        loginNote: 'C\'est avec lui — ou avec votre adresse e-mail — que vous vous connectez.',
        footer: 'L\'équipe Meeshy',
      },
      en: {
        subject: 'Your Meeshy username',
        title: 'Your username',
        subtitle: 'A quick reminder',
        greeting: 'Hello',
        intro: 'A quick reminder: your Meeshy username is',
        loginNote: 'You sign in with it — or with your email address.',
        footer: 'The Meeshy Team',
      },
      es: {
        subject: 'Tu identificador de Meeshy',
        title: 'Tu identificador',
        subtitle: 'Un recordatorio',
        greeting: 'Hola',
        intro: 'Un recordatorio: tu nombre de usuario en Meeshy es',
        loginNote: 'Con él — o con tu correo electrónico — inicias sesión.',
        footer: 'El equipo de Meeshy',
      },
      pt: {
        subject: 'O seu identificador Meeshy',
        title: 'O seu identificador',
        subtitle: 'Um lembrete',
        greeting: 'Olá',
        intro: 'Um lembrete: o seu nome de utilizador Meeshy é',
        loginNote: 'É com ele — ou com o seu e-mail — que inicia sessão.',
        footer: 'A equipa Meeshy',
      },
      it: {
        subject: 'Il tuo identificativo Meeshy',
        title: 'Il tuo identificativo',
        subtitle: 'Un promemoria',
        greeting: 'Ciao',
        intro: 'Un promemoria: il tuo nome utente Meeshy è',
        loginNote: 'Accedi con questo — oppure con il tuo indirizzo e-mail.',
        footer: 'Il team Meeshy',
      },
      de: {
        subject: 'Ihr Meeshy-Benutzername',
        title: 'Ihr Benutzername',
        subtitle: 'Eine kurze Erinnerung',
        greeting: 'Hallo',
        intro: 'Eine kurze Erinnerung: Ihr Meeshy-Benutzername lautet',
        loginNote: 'Damit — oder mit Ihrer E-Mail-Adresse — melden Sie sich an.',
        footer: 'Ihr Meeshy-Team',
      },
    };
    return translations[language] || translations.en;
  }
```

- [ ] **Step 5: Écrire la méthode d'envoi**

Juste avant `getUsernameReminderTranslations` :

```ts
  async sendUsernameReminderEmail(data: UsernameReminderEmailData): Promise<EmailResult> {
    const lang = data.language || 'en';
    const content = this.getUsernameReminderTranslations(lang);
    const handle = `@${this.escapeHtml(data.username)}`;

    const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${content.subject}</title>
  <style>${this.getBaseStyles()}</style>
</head>
<body>
  <div class="container">
    <div class="header" style="background:linear-gradient(135deg,#6366f1 0%,#4f46e5 100%);border-radius:12px 12px 0 0">
      <a href="${this.frontendUrl}" style="text-decoration:none">
        <img src="${this.brandLogoUrl}" alt="Meeshy" style="height:50px;width:auto;margin-bottom:15px" onerror="this.style.display='none'">
      </a>
      <h1 style="margin:0;font-size:28px;font-weight:700;color:white">${content.title}</h1>
      <p style="margin:10px 0 0;opacity:0.9;font-size:14px">${content.subtitle}</p>
    </div>

    <div class="content" style="padding:40px 30px;border-radius:0 0 12px 12px">
      <p>${content.greeting} <strong class="link-text">${this.escapeHtml(data.name)}</strong>,</p>
      <p>${content.intro} <strong class="link-text">${handle}</strong>.</p>
      <p style="font-size:14px">${content.loginNote}</p>
      <p style="font-size:14px;margin-top:25px">${content.footer}</p>
    </div>

    <div class="footer">
      <a href="${this.frontendUrl}" style="text-decoration:none">
        <img src="${this.brandLogoUrl}" alt="Meeshy" style="height:30px;width:auto;opacity:0.6" onerror="this.style.display='none'">
      </a>
      ${this.getFooterContentHtml(lang)}
    </div>
  </div>
</body>
</html>`;

    const text = `${content.title}\n\n${content.greeting} ${data.name},\n\n${content.intro} @${data.username}.\n\n${content.loginNote}\n\n${content.footer}\n\n${this.getFooterContentText(lang)}`;

    return this.sendEmail({ to: data.to, subject: content.subject, html, text, trackingType: 'username_reminder', trackingLang: lang });
  }
```

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

```bash
cd services/gateway && bun run test -- src/__tests__/unit/services/EmailService.test.ts
```

Attendu : PASS — les nouveaux cas et l'ensemble de la suite existante.

- [ ] **Step 7: Commit**

```bash
git add services/gateway/src/services/EmailService.ts \
        services/gateway/src/__tests__/unit/services/EmailService.test.ts
git commit -m "feat(gateway/email): mail de rappel d'identifiant, sans un mot sur une quelconque modification"
```

---

### Task 6: Script de migration `strip-spaces-from-usernames.ts`

**Files:**
- Create: `scripts/migrations/strip-spaces-from-usernames.ts`
- Test: `scripts/migrations/__tests__/strip-spaces-from-usernames.test.ts`

**Interfaces:**
- Consomme : la **valeur** de `usernamePatternSource` (tâche 1), miroitée localement — voir l'encadré ci-dessous ; `sendUsernameReminderEmail` (tâche 5) au moment de l'exécution `--apply`, par import dynamique.
- Produit : `planRename(users: readonly UserRow[]): RenamePlan`, fonction **pure** exportée, et `USERNAME_PATTERN_SOURCE`, la copie miroir, exportée pour la garde de dérive. Où

```ts
type UserRow = { _id: string; username: string; email: string | null; firstName: string | null; systemLanguage: string | null };
type Rename = { id: string; from: string; to: string; email: string | null; name: string; language: string };
type Skip = { id: string; username: string; reason: 'too-short' | 'too-long' | 'still-invalid' | 'collision' };
type RenamePlan = { renames: readonly Rename[]; skips: readonly Skip[] };
```

`planRename` reçoit **toutes** les lignes (celles avec espace et les autres), ce qui lui permet de détecter les collisions insensibles à la casse sans requête supplémentaire.

**Trois décisions verrouillées, à ne pas « améliorer » :**
1. **Ne PAS écrire `usernameHistory`.** Le rate-limit de 30 jours de `PATCH /users/me/username` lit `usernameHistory[0].changedAt` : y déposer une entrée renverrait un 429 à ces deux personnes pendant un mois si elles voulaient se renommer elles-mêmes. Le champ n'est exposé à aucun client. La trace d'audit, c'est le rapport du script.
2. **Ne PAS invalider le cache auth.** `authUserCacheKey` a un TTL de 60 s ; il se répare seul.
3. **Ne PAS importer `@meeshy/shared` dans le script.** `scripts/` n'a ni `package.json` ni `node_modules` propres : la résolution remonte à la racine, où `@meeshy/shared` **n'existe pas** (bun 1.3 installe en mode isolé, les liens de workspace vivent dans `<workspace>/node_modules`). Vérifié : `require.resolve('@meeshy/shared/types', { paths: ['.'] })` → `MODULE_NOT_FOUND`, alors que `mongodb` et `dotenv` résolvent bien. Le pattern est donc **miroité** dans le script — précédent établi par `reclassify-nonqualifying-reels-to-post.ts` (« Prédicat : MIROIR de … »). Pour que ce miroir ne dérive pas en silence, son test **lit `api-schemas.ts` sur le disque** et compare les deux littérales : la garde est réelle, pas tautologique.

`EmailService`, lui, est chargé par **import dynamique** (`await import('../../services/gateway/src/services/EmailService.js')`), sur le modèle de `scripts/backfill-thumbhash.ts:47`. La résolution d'un module part du répertoire du fichier **importé**, pas du script d'entrée : `EmailService.ts` trouve donc son propre `@meeshy/shared/utils/language-normalize` dans `services/gateway/node_modules`. C'est précisément pour ça qu'un import dynamique fonctionne là où un import statique depuis `scripts/` échouerait.

**Runner de tests.** `scripts/` n'a **aucun** runner (ni jest ni vitest ne le couvrent). La convention du dépôt — `scripts/__tests__/embedded-reactions-to-rows.test.ts` — est un fichier auto-exécutable sur `node:assert/strict` avec un harnais minimal, lancé directement par `tsx`. Le test ci-dessous la suit.

- [ ] **Step 1: Écrire les tests rouges**

Créer `scripts/migrations/__tests__/strip-spaces-from-usernames.test.ts` :

```ts
/**
 * Tests unitaires de planRename().
 *
 * Run:
 *   npx tsx scripts/migrations/__tests__/strip-spaces-from-usernames.test.ts
 *
 * Utilise `node:assert` — aucun runner externe : `scripts/` n'est couvert ni par
 * jest ni par vitest. Même harnais que scripts/__tests__/embedded-reactions-to-rows.test.ts.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { planRename, USERNAME_PATTERN_SOURCE, type UserRow } from '../strip-spaces-from-usernames.js';

// ---------------------------------------------------------------------------
// Minimal test harness
// ---------------------------------------------------------------------------

type TestFn = () => void;
const tests: Array<{ name: string; fn: TestFn }> = [];

function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

function runAll(): void {
  let passed = 0;
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      fn();
      console.log(`  [PASS] ${name}`);
      passed += 1;
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err instanceof Error ? err.message : String(err)}`);
      failed += 1;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const row = (over: Partial<UserRow> & Pick<UserRow, '_id' | 'username'>): UserRow => ({
  email: 'a@b.co',
  firstName: 'A',
  systemLanguage: 'fr',
  ...over,
});

// ---------------------------------------------------------------------------
// Garde de dérive : le miroir doit rester égal à la source
// ---------------------------------------------------------------------------

test('USERNAME_PATTERN_SOURCE est identique à la source partagée', () => {
  const sharedPath = path.resolve(__dirname, '../../../packages/shared/types/api-schemas.ts');
  const source = readFileSync(sharedPath, 'utf8');
  const match = source.match(/export const usernamePatternSource = "(.+?)";/);
  assert.ok(match, 'usernamePatternSource introuvable dans api-schemas.ts');
  assert.equal(USERNAME_PATTERN_SOURCE, match[1]);
});

// ---------------------------------------------------------------------------
// planRename
// ---------------------------------------------------------------------------

test('retire les espaces d\'un username récupérable', () => {
  const plan = planRename([row({ _id: '1', username: 'la lionne noire', firstName: 'La Lionne Noire' })]);
  assert.equal(plan.skips.length, 0);
  assert.deepEqual(plan.renames, [
    { id: '1', from: 'la lionne noire', to: 'lalionnenoire', email: 'a@b.co', name: 'La Lionne Noire', language: 'fr' },
  ]);
});

test('ne touche pas un username déjà propre', () => {
  const plan = planRename([row({ _id: '1', username: 'alice' })]);
  assert.equal(plan.renames.length, 0);
  assert.equal(plan.skips.length, 0);
});

test('est idempotent : rejouer sur le résultat ne produit plus rien', () => {
  const first = planRename([row({ _id: '1', username: 'vanel momo' })]);
  const second = planRename([row({ _id: '1', username: first.renames[0].to })]);
  assert.equal(second.renames.length, 0);
  assert.equal(second.skips.length, 0);
});

test('saute une collision insensible à la casse au lieu de deviner', () => {
  const plan = planRename([
    row({ _id: '1', username: 'vanel momo' }),
    row({ _id: '2', username: 'VanelMomo' }),
  ]);
  assert.equal(plan.renames.length, 0);
  assert.deepEqual(plan.skips, [{ id: '1', username: 'vanel momo', reason: 'collision' }]);
});

test('ne se compte pas comme sa propre collision', () => {
  const plan = planRename([row({ _id: '1', username: 'a lice' })]);
  assert.deepEqual(plan.renames.map((r) => r.to), ['alice']);
});

test('saute un username trop court après suppression', () => {
  const plan = planRename([row({ _id: '1', username: 'a ' })]);
  assert.equal(plan.renames.length, 0);
  assert.deepEqual(plan.skips, [{ id: '1', username: 'a ', reason: 'too-short' }]);
});

test('saute un username trop long après suppression', () => {
  const long = `${'a'.repeat(10)} ${'b'.repeat(10)}`;
  const plan = planRename([row({ _id: '1', username: long })]);
  assert.deepEqual(plan.skips, [{ id: '1', username: long, reason: 'too-long' }]);
});

test('saute un username qui reste non conforme après suppression', () => {
  const plan = planRename([row({ _id: '1', username: 'jos é.m' })]);
  assert.equal(plan.renames.length, 0);
  assert.deepEqual(plan.skips, [{ id: '1', username: 'jos é.m', reason: 'still-invalid' }]);
});

test('retombe sur le username comme nom d\'adresse quand firstName manque', () => {
  const plan = planRename([row({ _id: '1', username: 'vanel momo', firstName: null })]);
  assert.equal(plan.renames[0].name, 'vanel momo');
});

test('retombe sur fr quand systemLanguage manque', () => {
  const plan = planRename([row({ _id: '1', username: 'vanel momo', systemLanguage: null })]);
  assert.equal(plan.renames[0].language, 'fr');
});

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('Running strip-spaces-from-usernames tests...\n');
runAll();
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
npx tsx scripts/migrations/__tests__/strip-spaces-from-usernames.test.ts
```

Attendu : ÉCHEC — le module `../strip-spaces-from-usernames.js` n'existe pas.

- [ ] **Step 3: Écrire le script**

Créer `scripts/migrations/strip-spaces-from-usernames.ts` :

```ts
// Retire les espaces des usernames legacy et rappelle leur identifiant aux
// personnes concernées.
//
// Pourquoi
// --------
// Le verrou Zod `^[a-zA-Z0-9_-]+$` est arrivé APRÈS l'inscription de quelques
// comptes ; deux d'entre eux portent un espace (`la lionne noire`,
// `vanel momo`). Un username avec espace casse la saisie d'une mention `@handle`
// et n'est plus reproductible par aucun chemin d'inscription.
//
// Comment une ligne est classée
// -----------------------------
// Toute ligne dont le username contient un caractère d'espacement est candidate.
// Le candidat est `username.replace(/\s+/g, '')`. Il n'est retenu que s'il
// satisfait TOUTES les vérifications : longueur 2–16, conforme à
// `usernamePatternSource`, et libre — aucun autre compte ne le porte, casse
// ignorée. Toute ligne qui échoue une vérification est RAPPORTÉE et SAUTÉE, jamais
// devinée. Le script est idempotent : au second passage, plus aucune ligne ne
// contient d'espace.
//
// Ce que le script n'écrit PAS
// ----------------------------
// `usernameHistory` reste intact. Le rate-limit de 30 jours de
// `PATCH /users/me/username` lit `usernameHistory[0].changedAt` : y déposer une
// entrée renverrait un 429 à ces personnes pendant un mois si elles voulaient se
// renommer elles-mêmes. Le champ n'est exposé à aucun client — la trace d'audit
// est le rapport ci-dessous.
//
// Le cache auth n'est pas invalidé : `authUserCacheKey` a un TTL de 60 s.
//
// Écriture explicite
// -----------------
// Le script NE MODIFIE RIEN par défaut : il faut `--apply`. Un `--dry-run` oublié
// sur un script qui écrit par défaut est irréversible ; l'inverse ne coûte qu'un
// second lancement.
//
// Usage:
//   npx tsx scripts/migrations/strip-spaces-from-usernames.ts [--apply] [--production]
//
// Default: inspecte et rapporte sans écrire, sur MONGODB_URL depuis .env
// --apply:      applique les renommages ET envoie le mail de rappel
// --production: utilise MONGODB_PRODUCTION_URL

import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv'
import path from 'node:path'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

/**
 * MIROIR de `usernamePatternSource` (packages/shared/types/api-schemas.ts).
 * Recopié et non importé : `scripts/` n'a pas de node_modules propre et
 * `@meeshy/shared` n'est pas résolvable depuis la racine (bun installe les
 * workspaces en mode isolé). La garde de dérive vit dans le test, qui lit
 * `api-schemas.ts` sur le disque et compare les deux littérales.
 */
export const USERNAME_PATTERN_SOURCE = '^[a-zA-Z0-9_-]+$'

const USERNAME_PATTERN = new RegExp(USERNAME_PATTERN_SOURCE)
const USERNAME_MIN_LENGTH = 2
const USERNAME_MAX_LENGTH = 16

export type UserRow = {
  _id: string
  username: string
  email: string | null
  firstName: string | null
  systemLanguage: string | null
}

export type Rename = {
  id: string
  from: string
  to: string
  email: string | null
  name: string
  language: string
}

export type Skip = {
  id: string
  username: string
  reason: 'too-short' | 'too-long' | 'still-invalid' | 'collision'
}

export type RenamePlan = {
  renames: readonly Rename[]
  skips: readonly Skip[]
}

/**
 * Décide, pour un jeu complet d'utilisateurs, lesquels renommer et lesquels
 * sauter. Pure : aucune I/O, donc testable sans base. Reçoit TOUTES les lignes —
 * les candidates comme les autres — pour détecter les collisions sans requête
 * supplémentaire.
 */
export function planRename(users: readonly UserRow[]): RenamePlan {
  const takenByOthers = new Map<string, Set<string>>()
  for (const user of users) {
    const key = user.username.toLowerCase()
    const owners = takenByOthers.get(key) ?? new Set<string>()
    owners.add(user._id)
    takenByOthers.set(key, owners)
  }

  const renames: Rename[] = []
  const skips: Skip[] = []
  const seenIds = new Set<string>()

  for (const user of users) {
    if (!/\s/.test(user.username)) continue
    if (seenIds.has(user._id)) continue
    seenIds.add(user._id)

    const candidate = user.username.replace(/\s+/g, '')

    if (candidate.length < USERNAME_MIN_LENGTH) {
      skips.push({ id: user._id, username: user.username, reason: 'too-short' })
      continue
    }
    if (candidate.length > USERNAME_MAX_LENGTH) {
      skips.push({ id: user._id, username: user.username, reason: 'too-long' })
      continue
    }
    if (!USERNAME_PATTERN.test(candidate)) {
      skips.push({ id: user._id, username: user.username, reason: 'still-invalid' })
      continue
    }

    const owners = takenByOthers.get(candidate.toLowerCase())
    const heldBySomeoneElse = owners !== undefined && [...owners].some((id) => id !== user._id)
    if (heldBySomeoneElse) {
      skips.push({ id: user._id, username: user.username, reason: 'collision' })
      continue
    }

    renames.push({
      id: user._id,
      from: user.username,
      to: candidate,
      email: user.email,
      name: user.firstName ?? user.username,
      language: user.systemLanguage ?? 'fr',
    })
  }

  return { renames, skips }
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

async function main() {
  const APPLY = process.argv.includes('--apply')
  const PRODUCTION = process.argv.includes('--production')

  const MONGODB_URL = PRODUCTION
    ? process.env.MONGODB_PRODUCTION_URL
    : process.env.MONGODB_URL || process.env.DATABASE_URL

  if (!MONGODB_URL) {
    console.error('No MongoDB URL found. Set MONGODB_URL or DATABASE_URL in .env')
    process.exit(1)
  }

  const client = new MongoClient(MONGODB_URL)
  await client.connect()
  log(`Connected (${PRODUCTION ? 'PRODUCTION' : 'local'}, ${APPLY ? 'APPLY' : 'DRY-RUN'})`)

  try {
    const collection = client.db().collection('User')
    const docs = await collection
      .find({}, { projection: { username: 1, email: 1, firstName: 1, systemLanguage: 1 } })
      .toArray()

    const users: UserRow[] = docs.map((doc) => ({
      _id: String(doc._id),
      username: String(doc.username ?? ''),
      email: (doc.email as string | undefined) ?? null,
      firstName: (doc.firstName as string | undefined) ?? null,
      systemLanguage: (doc.systemLanguage as string | undefined) ?? null,
    }))

    const plan = planRename(users)

    log(`${users.length} comptes inspectés — ${plan.renames.length} à renommer, ${plan.skips.length} sautés`)
    for (const rename of plan.renames) {
      log(`  RENAME ${rename.id}  "${rename.from}" → "${rename.to}"  (${rename.email ?? 'aucun e-mail'}, ${rename.language})`)
    }
    for (const skip of plan.skips) {
      log(`  SKIP   ${skip.id}  "${skip.username}"  motif=${skip.reason}`)
    }

    if (!APPLY) {
      log('DRY-RUN — rien n\'a été écrit. Relancer avec --apply pour appliquer.')
      return
    }

    // Import dynamique : la résolution part du répertoire du fichier IMPORTÉ,
    // si bien qu'EmailService trouve son `@meeshy/shared` dans
    // services/gateway/node_modules. Un import statique depuis scripts/ échouerait.
    const { EmailService } = await import('../../services/gateway/src/services/EmailService.js')
    const emailService = new EmailService()

    for (const rename of plan.renames) {
      await collection.updateOne({ _id: new ObjectId(rename.id) }, { $set: { username: rename.to } })
      log(`  APPLIED ${rename.id}  "${rename.from}" → "${rename.to}"`)

      if (!rename.email) {
        log(`  MAIL SKIPPED ${rename.id} — aucune adresse e-mail`)
        continue
      }

      // Un échec d'envoi n'annule PAS le renommage : la base est déjà cohérente,
      // et le mail est un rappel, pas une confirmation. Il est signalé ici pour
      // renvoi manuel.
      try {
        const result = await emailService.sendUsernameReminderEmail({
          to: rename.email,
          name: rename.name,
          username: rename.to,
          language: rename.language,
        })
        log(`  MAIL ${result.success ? 'SENT' : 'FAILED'} ${rename.id} → ${rename.email}`)
      } catch (error) {
        log(`  MAIL FAILED ${rename.id} → ${rename.email} : ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  } finally {
    await client.close()
    log('Disconnected')
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

```bash
npx tsx scripts/migrations/__tests__/strip-spaces-from-usernames.test.ts
```

Attendu : `11 passed, 0 failed`.

- [ ] **Step 5: Vérifier que le script se charge sans se connecter**

```bash
npx tsx -e "import('./scripts/migrations/strip-spaces-from-usernames.js').then(m => console.log('planRename:', typeof m.planRename))"
```

Attendu : `planRename: function`, sans tentative de connexion Mongo — la garde `require.main === module` protège l'import.

- [ ] **Step 6: Commit**

```bash
git add scripts/migrations/strip-spaces-from-usernames.ts \
        scripts/migrations/__tests__/strip-spaces-from-usernames.test.ts
git commit -m "feat(scripts): migration de nettoyage des usernames à espace, dry-run par défaut"
```

---

### Task 7: Dry-run en lecture seule contre la production

**Files:** aucun. Cette tâche n'écrit rien.

**Interfaces:**
- Consomme : le script de la tâche 6.
- Produit : un rapport présenté à l'utilisateur, sur lequel porte le feu vert de la tâche 8.

- [ ] **Step 1: Vérifier que l'URL de production est configurée**

```bash
grep -c MONGODB_PRODUCTION_URL .env
```

Attendu : `1`. Si `0`, s'arrêter et demander l'URL à l'utilisateur — ne pas la deviner, ne pas la reconstruire, ne pas basculer sur `MONGODB_URL`.

- [ ] **Step 2: Lancer le dry-run**

```bash
npx tsx scripts/migrations/strip-spaces-from-usernames.ts --production
```

Attendu, d'après l'état constaté le 2026-08-18 :

```
N comptes inspectés — 2 à renommer, 0 sautés
  RENAME 68f47b5e2d4f2ca375df2576  "la lionne noire" → "lalionnenoire"  (verrainembilla@gmail.com, fr)
  RENAME 68f47e702d4f2ca375df2583  "vanel momo" → "vanelmomo"  (tsapmovanelrikel@gmail.com, fr)
DRY-RUN — rien n'a été écrit.
```

- [ ] **Step 3: Présenter le rapport et s'arrêter**

Restituer la sortie intégrale à l'utilisateur et **attendre son feu vert explicite**.

Si le rapport diffère de l'attendu ci-dessus — plus de deux lignes, une ligne sautée, un e-mail manquant — le présenter tel quel **sans rien corriger** et demander l'arbitrage. Un écart signifie que les données ont bougé depuis l'audit ; ce n'est pas au script de trancher.

---

### Task 8: Application en production — **feu vert humain requis**

**Files:** aucun. Cette tâche modifie deux comptes vivants et écrit à deux vraies boîtes mail.

**Interfaces:**
- Consomme : le feu vert explicite de la tâche 7.

**Ne pas exécuter cette tâche sans une autorisation explicite de l'utilisateur portant sur le rapport de la tâche 7.** Un `--apply` lancé « pour voir » envoie de vrais e-mails à de vraies personnes ; c'est irréversible.

- [ ] **Step 1: Appliquer**

```bash
npx tsx scripts/migrations/strip-spaces-from-usernames.ts --production --apply
```

Attendu : deux lignes `APPLIED` et deux lignes `MAIL SENT`.

- [ ] **Step 2: Vérifier l'idempotence en relançant le dry-run**

```bash
npx tsx scripts/migrations/strip-spaces-from-usernames.ts --production
```

Attendu : `0 à renommer, 0 sautés`. Aucune ligne ne contient plus d'espace.

- [ ] **Step 3: Vérifier que les comptes renommés se connectent**

```bash
curl -s https://gate.meeshy.me/api/v1/auth/check-availability?username=lalionnenoire | head -c 200
echo
curl -s https://gate.meeshy.me/api/v1/auth/check-availability?username=vanelmomo | head -c 200
```

Attendu : `usernameAvailable: false` pour les deux — les handles sont désormais portés.

- [ ] **Step 4: Restituer le résultat**

Rapporter à l'utilisateur : les deux renommages effectués, l'état d'envoi de chaque mail, et le résultat du dry-run de confirmation. Si un envoi a échoué, le dire explicitement avec le message d'erreur — le renommage, lui, a bien eu lieu.
