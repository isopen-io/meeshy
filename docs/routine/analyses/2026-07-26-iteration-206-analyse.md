# Iteration 206 — La validation d'email de la gateway (`SecuritySanitizer.sanitizeEmail`) converge sur le SSOT RFC 5322 partagé

## Protocole (démarrage)
`main` @ `e90afd62` (dernier merge : #2331 android/conversations category-picker).
Branche `claude/brave-archimedes-lw419s` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). `bun install` OK. `packages/shared/dist` construit
via `bun run build` (nécessaire pour le `tsc` de la gateway qui mappe
`@meeshy/shared/*` → `packages/shared/dist/*`). Le jest gateway mappe lui
`@meeshy/shared/(.*)` → la **source** `packages/shared/$1`, donc les tests tournent
sans dist.

PRs ouvertes au démarrage — **audit anti-doublon** : ~16 PRs, majoritairement le
swarm web « converge sur SSOT » (getUserDisplayName #2311/#2313/#2317/#2320,
formatFileSize #2309, language-utils #2315, isUserAnonymous #2305) + gateway
(read-tracking #2307, receipts #2328, pagination #2329, translation-filter #2323)
+ iOS. **Aucune** ne touche `services/gateway/src/utils/sanitize.ts`. Zéro risque
de conflit.

## Sélection : **correctness + Single Source of Truth (validation d'email, couche gateway)**

Le codebase possède déjà un validateur d'email canonique RFC 5322 dans
`packages/shared/utils/email-validator.ts` (`isValidEmail` /
`validateAndNormalizeEmail`). Le **web** a déjà convergé dessus
(`apps/web/utils/xss-protection.ts:299` — « pas de réimplémentation locale »).
La **gateway** était restée en arrière avec une regex inline plus faible.

## Current state (avant correctif)

### `services/gateway/src/utils/sanitize.ts:204` (avant)
```ts
static sanitizeEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const sanitized = input.trim().toLowerCase();
  if (!emailRegex.test(sanitized)) return null;
  return sanitized;
}
```

Cette regex accepte des adresses que le validateur canonique **rejette** :

| Entrée | Regex inline (gateway) | `validateAndNormalizeEmail` (SSOT) |
|---|---|---|
| `a..b@example.com` (points consécutifs) | ✅ accepté | ❌ rejeté |
| `.user@example.com` (point en tête) | ✅ accepté | ❌ rejeté |
| `user.@example.com` (point en fin) | ✅ accepté | ❌ rejeté |
| `user@-example.com` (domaine tiret-préfixé) | ✅ accepté | ❌ rejeté |
| `user@example-.com` (domaine tiret-suffixé) | ✅ accepté | ❌ rejeté |
| `user@example..com` (points consécutifs domaine) | ✅ accepté | ❌ rejeté |

Le fichier importait déjà `@meeshy/shared` (`NotificationTypeEnum`) →
`validateAndNormalizeEmail` est un **drop-in** (même signature de retour :
email normalisé en lowercase/trimmed, ou `null`).

## Problems identified
1. **Correctness — validation trop permissive à une frontière de confiance.**
   `sanitizeEmail` est le point de normalisation des emails côté gateway. Accepter
   des valeurs malformées (points consécutifs/en tête/en fin, domaines
   tiret-bordés) que le reste de la stack traite comme invalides est une
   incohérence entre chemins similaires (register/reset utilisent le validateur
   strict).
2. **Duplication / 4ᵉ regex d'email divergente.** Après le SSOT partagé et la
   convergence web, cette copie gateway était la 4ᵉ règle de validation d'email
   du repo — exactement la classe que les itérations précédentes réduisaient.
3. **Format 12h/AM-PM sans objet ici** — pas concerné (email), mais même racine :
   logique réimplémentée localement au lieu de consommer le SSOT.

## Root causes
`sanitize.ts` a été écrit avant la centralisation du validateur d'email dans
`@meeshy/shared`. La convergence n'avait été faite que côté web ; la gateway,
bien qu'important déjà `@meeshy/shared`, n'avait pas été recâblée.

## Business impact
Faible surface d'appel directe aujourd'hui (`sanitizeEmail` fait partie de l'API
publique du `SecuritySanitizer` mais n'a pas encore de consommateur route). L'impact
principal est **préventif et de cohérence** : supprimer une règle de validation
d'email plus faible d'une utilité de sécurité empêche un futur bug latent (un
appelant qui ferait confiance à `sanitizeEmail` accepterait des emails que
register/reset rejettent) et unifie le comportement de validation app-wide.

## Technical impact
- Suppression d'une regex divergente ; une seule source de vérité RFC 5322.
- `sanitize.ts` passe de « regex maison » à « délégation SSOT » (−7 lignes de
  logique, +1 import).
- Aucun changement de comportement sur les emails valides (24 cas de test
  existants restent verts) ; seul le rejet des 6 formes malformées change.

## Risk assessment
**Faible.** Changement isolé à une méthode pure sans appelant production actuel.
Les 18 tests `sanitizeEmail` existants passent inchangés ; 6 tests de régression
ajoutés. Import subpath (`@meeshy/shared/utils/email-validator`) identique à celui
déjà utilisé en production par `apps/web/utils/xss-protection.ts` → résolution
build/jest prouvée.

## Proposed improvements (implémentées)
Remplacer la regex inline de `sanitizeEmail` par un appel à
`validateAndNormalizeEmail` du SSOT partagé, après le garde `!input`.

## Expected benefits
- Une seule règle de validation d'email dans tout le repo côté TS.
- Frontière de confiance gateway alignée sur register/reset.
- Maintenance : toute évolution RFC future se fait en un seul endroit.

## Implementation complexity
**Triviale** — 1 import + 7 lignes remplacées par 1 délégation.

## Validation criteria
- `sanitize.test.ts` : 24/24 sur `sanitizeEmail` (18 existants + 6 régressions).
- Suite complète `sanitize.test.ts` : 201/201.
- `tsc --noEmit` gateway : 0 erreur sur `sanitize.ts` / `email-validator`.
- `packages/shared/dist/utils/email-validator.d.ts` présent (build shared OK).

## Future improvements
- **Candidat #2** (non pris ici) : 3 composants web d'auth
  (`ProfileSettings.tsx:102`, `PhoneResetFlow.tsx:235`, `ForgotPasswordForm.tsx:63`)
  utilisent la regex faible `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` → à converger sur
  `isValidEmail` (`@meeshy/shared` ou `xss-protection`). Chemins user-facing réels
  (email-change + reset) ; nécessite tests RTL → itération dédiée.
- **Candidat #3** : `escapeHtml` dupliqué 3-4× (markdown-parser-v2.2 / markdown
  sanitizer / gateway sanitize / xss-protection escapeAttribute divergent).
- **Candidat #4** : logique d'initiales avatar réimplémentée ~10× (`slice(0,2)`
  → « JE » au lieu de « JD »), diverge de `getInitials`/`getUserInitials` ;
  `AdminLayout.tsx:239` crashe si displayName+username null.
- **Candidat #5** : `sanitizeFileName` (`xss-protection.ts:381`) — troncature peut
  dépasser le cap + casse les paires de substitution (à aligner sur
  `truncate.ts`/`truncateFilename`).
