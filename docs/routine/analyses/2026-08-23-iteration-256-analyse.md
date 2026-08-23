# Analyse — Itération 256 : suppression d'un chemin d'auth mort à identifiants codés en dur

## Current state

`services/gateway/src/services/AuthTestService.ts` (204 lignes) exporte une classe
nommée `AuthService` — **homonyme** de la vraie `services/AuthService.ts` — qui
authentifie sept utilisateurs de test codés en dur (`alice_fr` … `maria_pt`,
tous mot de passe `password123`, dont `alice_fr` en `ADMIN`) et vérifie des
jetons via un base64 **non signé** (`verifyToken` = `JSON.parse(atob(token))`,
sans aucune vérification de signature).

Son UNIQUE consommateur de production est une fonction `@deprecated`, exportée et
sans appelant :

```
src/middleware/auth.ts:631  export async function authenticate(...)   // @deprecated
src/middleware/auth.ts:644    const { AuthService } = await import('../services/AuthTestService');
src/middleware/auth.ts:645    const decoded = AuthService.verifyToken(token);   // dev-only backdoor
```

`authenticate()` (l'export legacy de `middleware/auth.ts`) n'est importée nulle
part hors de son propre test — `grep` sur `import … authenticate … middleware/auth`
ne rend rien. Elle est distincte du décorateur `fastify.authenticate`, qui est
`createAuthMiddleware()` (`server.ts:707`) et que TOUTES les routes utilisent.

## Problems identified

1. **Chemin d'authentification mort à identifiants codés en dur.** Un base64 non
   signé forgé à la main (`{userId:'alice_fr_id',exp:…}`) déchiffré en clair,
   suivi d'une connexion en `ADMIN` — le tout gaté par `NODE_ENV==='development'`,
   mais atteignable seulement via une fonction que rien ne câble. Code mort à
   coloration sécurité : une porte fermée dont la serrure est en carton, à
   retirer plutôt qu'à garder.
2. **Homonyme (`AuthService`) qui masque la vraie classe.** Deux `AuthService`
   dans `src/services/`, l'une vivante, l'autre orpheline — exactement le piège
   de maintenance décrit au cycle 253 (« Cette entité a-t-elle une JUMELLE ? »).
3. **Une source de `any` et de couverture fantôme.** ~130 lignes de tests
   (`AuthTestService.test.ts` + trois `describe` dans `auth-extended.test.ts`)
   n'exercent que du code injoignable en production.

## Root causes

Vestige de bootstrap : un faux backend d'auth pour développer sans base, câblé
dans la fonction `authenticate()` d'origine. La migration vers l'auth unifiée
(`createUnifiedAuthMiddleware` → `fastify.authenticate`) a rendu `authenticate()`
`@deprecated` et sans appelant, mais ni la fonction ni son faux backend n'ont
été retirés.

## Business impact

Nul côté fonctionnel (chemin injoignable). Gain : suppression d'un idiome de
backdoor du dépôt, un homonyme trompeur en moins, et la couverture mesurée
uniquement sur du code exécuté.

## Technical impact

- −204 lignes (`AuthTestService.ts`), −~200 lignes de tests morts.
- −1 export `@deprecated` mort (`authenticate`), −1 import dynamique de service.
- `requireRole` / `requireEmailVerification` (sous le même marqueur
  `LEGACY COMPATIBILITY`, mais VIVANTS via `requireAdmin`/`requireModerator`/
  `requireAnalyst`) conservés intacts.

## Risk assessment

Très faible. Suppression pure de code mort :
- `authenticate()` : zéro importeur de production (vérifié par `grep`).
- `AuthTestService` : importé seulement par `authenticate()` (mort) et deux tests.
- `fastify.authenticate` (décorateur, chemin vivant) est `createAuthMiddleware()`,
  intouché.

## Proposed improvements

Supprimer `AuthTestService.ts`, son test, la fonction `authenticate()` legacy, et
les blocs de test qui l'exercent (mock + import + trois `describe`).

## Expected benefits

Chemin d'auth unique et vivant ; plus d'homonyme `AuthService` ; plus de backdoor
dormant ; couverture honnête.

## Implementation complexity

Faible : 2 suppressions de fichier, 1 retrait de fonction, 4 retraits dans un
fichier de test.

## Validation criteria

- `tsc --noEmit` gateway : exit 0.
- Aucune référence de code résiduelle à `AuthTestService` / `authenticate` legacy
  (hors docs historiques).
- `bun run test:coverage` : suite verte, seuils tenus.
- Chemin vivant `fastify.authenticate` (`createAuthMiddleware`) inchangé.

## Suivi — série dette de code mort

- 250 : `_findUsersForLanguage`
- 252 : `TranslationCache` Redis (homonyme mort)
- 253 : `CaptchaService` (doublon de `verifyCaptcha` en ligne)
- 254 : `SecurityMonitor` (doublon des `securityEvent.create` en ligne)
- **256 : `AuthTestService` + `authenticate()` legacy (backdoor dormant, homonyme mort)**
