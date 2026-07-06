# Iteration 106 — Analyse d'optimisation (2026-07-05)

## Protocole (démarrage)
`main` @ `73f5201` (« feat(android): optimistic + offline profile edit … #1500 »), working tree propre.
Branche de travail `claude/brave-archimedes-9bcdyw` recréée depuis `origin/main`
(`git checkout -B … origin/main`), 0 commit non-mergé à préserver. `git config user.email/name`
positionné (`noreply@anthropic.com` / `Claude`).

**4 PR ouvertes au démarrage**, toutes disjointes de la cible retenue :
- **#1501** gateway réactions (`ReactionService.reactionSummary`),
- **#1499** gateway `normalize.ts` (capitalisation noms, F72, itération 105),
- **#1498** calls (`CallEventsHandler` / `CallManager.tsx`),
- **#1497** community preferences (`community-preferences.ts` / `use-socket-cache-sync`, F71, itération 104).

Les itérations 104 (F71) et 105 (F72) sont **en vol mais pas encore mergées** dans `main` ⇒ ce cycle
est numéroté **106**. Cible retenue : **F73** — divergence entre `isValidEmail` et
`getEmailValidationError` (`packages/shared/utils/email-validator.ts`), strictement disjointe de toutes
les PR ouvertes.

### Revue d'ingénierie (constat de démarrage)
Balayage systématique (agent d'exploration, 64 tool-uses) des helpers **purs** de `packages/shared/utils`,
`apps/web/utils` et `apps/web/lib`, hors zones déjà traitées en itérations 100-105 (`truncate`,
`format-number`, `calendar-date`, `initials`, `mention-parser`, `conversation-helpers`, `duration-format`,
`relative-time`, `time-remaining`, `presence-format`, `normalize`). Vérifiés corrects et écartés :
`object-id`, `safe-redirect`, `presence-visibility`, `sender-identity`, `user-display-name`,
`avatar-utils`, `participant-helpers`, `client-message-id`, `optimistic-message`, `route-utils`,
`tag-colors`, `phone-validator`, `phone-validation-robust`, `user-adapter`, `language-normalize`,
`community-identifier`, `translation-cleaner`. Trois candidats retenus, un seul avec appelants **live**
sur les deux versants → F73.

## Cible : F73 — `getEmailValidationError` plus permissif que `isValidEmail` (les deux divergent)

### Current state
`packages/shared/utils/email-validator.ts` expose **deux** validateurs censés encoder **la même règle**
(l'en-tête du fichier liste des exemples accept/reject identiques) :
- `isValidEmail(email): boolean` — verdict booléen canonique (12 gardes + regex finale).
- `getEmailValidationError(email): string | null` — couche de **messages d'erreur** conviviaux ;
  retourne `null` = « valide ».

`getEmailValidationError` réimplémente un **sous-ensemble** des gardes de `isValidEmail` puis la même
regex finale. Une garde manque : le **plafond de 64 caractères sur la partie locale** (RFC 5321),
présent dans `isValidEmail:62` mais absent de `getEmailValidationError`. Comme la `EMAIL_REGEX` a une
partie locale **non bornée** (`[…]+`), un local part de 65+ car. passe la regex et
`getEmailValidationError` retourne `null` alors qu'`isValidEmail` retourne `false`.

Appelés en production (versants **divergents**) :
- `apps/web/hooks/use-field-validation.ts:33` — validation **inline** du champ email : utilise
  **uniquement** `getEmailValidationError`. `null` ⇒ champ marqué « valide » ⇒ enchaîne sur
  `checkAvailability` (fetch backend).
- `apps/web/hooks/use-register-form.ts:121` — **gating de soumission** : utilise `isValidEmail`.
- `apps/web/hooks/use-registration-validation.ts:169` — message via `getEmailValidationError`.

### Problems identified
- **[LIVE] « valide en inline mais soumission refusée ».** Pour un email dont la partie locale fait
  ≥ 65 car. avec un total ≤ 255 (ex. `'a'.repeat(65) + '@b.co'`, 70 car.) :
  `getEmailValidationError` → `null` (champ vert, requête `check-availability` envoyée au gateway),
  mais `isValidEmail` → `false` (soumission bloquée). Les deux fonctions, supposées équivalentes,
  **contredisent** l'une l'autre → UX déroutante (« aucune erreur affichée mais impossible de
  s'inscrire ») + requête backend inutile sur un email que l'inscription rejettera.
- Sens de la divergence **unique** : `getEmailValidationError = null` ∧ `isValidEmail = false`
  (jamais l'inverse — les gardes de `getError` sont un sous-ensemble strict). Prouvé par balayage.
- La divergence « domaine > 253 » est **inatteignable** (domaine > 253 ⇒ total > 255 ⇒ capté par le
  plafond de longueur totale en amont, dans les deux fonctions). Seul le plafond local part est
  réellement atteignable.

### Root cause
`getEmailValidationError` **réimplémente** la validation au lieu de déléguer son verdict final à la
source unique (`isValidEmail`). Toute garde présente dans `isValidEmail` mais oubliée dans `getError`
(ici le cap 64 sur le local part) crée une divergence silencieuse. Un validateur « à messages » ne
devrait jamais posséder sa propre notion de validité.

### Business impact
Bug d'inscription silencieux : un email au local part exceptionnellement long (plausible : préfixes
techniques, adresses de test, catch-all) apparaît valide dans le formulaire puis échoue à la
soumission — friction précisément sur le funnel d'acquisition, là où l'état de l'art (Google/Apple
sign-up) donne un feedback inline cohérent et immédiat.

### Technical impact
Correction locale au fichier SSOT (`email-validator.ts`) :
1. Ajout d'un message convivial spécifique `localPart.length > 64` (miroir d'`isValidEmail:62`).
2. **Délégation du verdict final** : la garde finale passe de `EMAIL_REGEX.test(...)` à
   `!isValidEmail(email)`. `getEmailValidationError` devient une pure couche de messages au-dessus du
   validateur canonique ⇒ invariant garanti **`getEmailValidationError(x) === null ⟺ isValidEmail(x)`**,
   robuste à toute évolution future des règles d'`isValidEmail`. Aucun changement de signature ni de
   contrat ; les 3 appelants web héritent automatiquement de la cohérence.

### Risk assessment
Très faible. Fonctions pures. Comportement **identique** sur tous les cas existants (les messages
spécifiques restent inchangés ; la garde finale déléguée retourne le même message générique `Format
d'email invalide` que la regex dans exactement les mêmes cas + les caps de longueur). Aucun email
actuellement accepté par `isValidEmail` n'est nouvellement rejeté (les nouvelles gardes miroir
`isValidEmail`). Prouvé par sweep de parité sur 27 échantillons.

### Proposed improvements (implémenté ce cycle)
- `email-validator.ts` : garde `localPart.length > 64` (message dédié) + garde finale
  `!isValidEmail(email)`. JSDoc : ajout de l'invariant explicite.

### Expected benefits
- Zéro divergence inline/soumission : un email refusé à l'inscription est refusé **aussi** en inline
  (avec un message spécifique pour le local part trop long).
- SSOT restaurée : `getEmailValidationError` ne peut plus dériver d'`isValidEmail`.
- Suppression d'une requête `check-availability` inutile pour un email intrinsèquement invalide.

### Implementation complexity
Faible (1 fonction pure, ~7 lignes nettes + 4 tests). Aucun changement de signature/contrat.

### Validation criteria
- [x] RED prouvé d'abord (repro Node autonome, impls copiées verbatim) :
      `getEmailValidationError('a'×65 + '@b.co')` → `null` tandis qu'`isValidEmail` → `false`.
- [x] GREEN (fix + sweep de parité sur 27 échantillons) : invariant
      `getError(x) === null ⟺ isValidEmail(x)` vérifié partout ; message local-part-trop-long spécifique.
- [x] GREEN vitest : `email-validator.test.ts` **48/48** (44 existants + 4 neufs : local part 65,
      local part 64 valide, invariant SSOT sur 27 cas, régression documentée).
- [x] Suite complète `packages/shared` : **1284/1284** (45/45 fichiers), 0 régression.
- [x] `bun run build` (tsc `--project`) : **0 erreur**.
- [ ] CI verte après push.

## Candidats écartés ce cycle (documentés)
- **F74 — `resolveDisplayContent` (`apps/web/utils/mention-display.ts:6`)** : `MENTION_DISPLAY_REGEX`
  omet le lookbehind gauche `(?<![\p{L}\p{N}_-])` que la SSOT `mention-parser.ts:59` applique pour
  ignorer le `@` interne des emails → `bob@marie.com` réécrit en `bob@Marie Claire.com` si un
  participant `marie` existe. **Écarté : 0 appelant live** (référencé uniquement dans docs/manifests
  de couverture). Latent, à corriger si le helper est câblé. Reporté (§ futur).
- **F75 — `generateCommunityIdentifier` (`apps/web/utils/community-identifier.ts:25`)** :
  `Math.random().toString(36).substring(2, 8)` peut produire un suffixe < 6 car. quand la
  représentation base-36 est courte (valeurs « rondes »). **Écarté : probabilité négligeable**
  (~2⁻ᵏ, mantisse 52 bits ⇒ quasi toujours ≥ 10 chiffres base-36) ; appelants live mais impact
  pratique nul. À durcir (boucle/`padEnd`) si une itération touche ce helper. Reporté (§ futur).

## Améliorations futures (report)
- **F51b** (LOW) : réécriture des docs `notifications/`.
- **F56b** (LOW) : `likeCount` absolu sur `post:reaction-added/removed` — collision potentielle avec
  #1501 (`ReactionService`) ; après merge.
- **F60b** (LOW) : parité parsing mention iOS/Android sur `MENTION_HANDLE_CHARS` (tiret).
- **F67b** (LOW) : audit découpage jour-calendaire iOS (`RelativeTimeFormatter`, `Calendar.startOfDay`).
- **F68b** (LOW) : contrepartie iOS des initiales (`String` avatar) — parité point-de-code.
- **F69** (LOW) : `sanitizeFileName` plafond 255 sur nom sans extension (latent, 0 appelant).
- **F70** (LOW) : `deepCleanTranslationOutput` apostrophes FR (code mort, 0 appelant).
- **F74** (LOW, neuf) : lookbehind manquant dans `resolveDisplayContent` (dead code, 0 appelant).
- **F75** (LOW, neuf) : suffixe `generateCommunityIdentifier` non garanti à 6 car. (proba négligeable).
