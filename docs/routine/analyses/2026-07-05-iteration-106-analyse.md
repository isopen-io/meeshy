# Iteration 106 — Analyse d'optimisation (2026-07-05)

## Protocole (démarrage)
`main` @ `968aaa0` (« Merge PR #1499 — brave-archimedes-5sc6q5 / F72 noms composés »), working tree
propre après `git checkout -B main origin/main` (le `main` local était divergent, resynchronisé sur
`origin/main`). Branche de travail `claude/brave-archimedes-1jtx8e` recréée depuis `origin/main`,
0 commit non-mergé à préserver.

**13 PR ouvertes au démarrage** (#1497 → #1514), majoritairement iOS/gateway calls, gateway typing,
web i18n (`detectBestInterfaceLanguage`, F79), gateway translation (`isUrlOnly`, F76), shared email
(`getEmailValidationError`, F73), preferences communauté (F71). **Toutes disjointes** de la cible
retenue ici (`apps/web/utils/phone-validator.ts`) — laissées à leurs sessions.

### Revue d'ingénierie (constat de démarrage)
Backlog F-series : plus haute étiquette observée F79 (#1510). Cette itération prend **F80**.

Balayage ciblé des utilitaires **purs** peu contestés d'`apps/web/utils/`, hors zones déjà traitées
(itérations 100-105 : `truncate`, `format-number`, `initials`, `xss-protection`, `translation-cleaner`,
`calendar-date`, `mention-parser`, `conversation-helpers`, `duration-format`, `relative-time`,
`time-remaining`, `presence-format`, `date-format`, `normalize`) et hors fichiers des 13 PR ouvertes.

Cible retenue : **F80** — `validatePhoneNumber` (validateur simple `phone-validator.ts`) compte le
préfixe international `+`/`00` dans le budget de longueur, rejetant à tort les E.164 de 15 chiffres.
Signalé une première fois en itération 105 (« rejet des E.164 à 15 chiffres — réel mais laissé pour un
cycle dédié ») ; c'est ce cycle dédié. **Distinct** de la divergence de modules F25b (deux validateurs
`phone-validator` simple vs `phone-validation-robust` libphonenumber, refactor MOYEN documenté aux
itérations 49/69/70) — ici on corrige un bug de correction **dans** le validateur simple, sans le
fusionner.

## Cible : F80 — `validatePhoneNumber` impute le préfixe `+`/`00` au budget de longueur E.164

### Current state
`apps/web/utils/phone-validator.ts` expose `validatePhoneNumber(phone: string)` — validateur **pur**,
sans pays, source des messages d'erreur d'inscription. Implémentation d'origine (l.19-60) :
```ts
const trimmed = phone.trim();
if (trimmed.length < 8)  return { isValid: false, error: 'phoneTooShort' };
if (trimmed.length > 15) return { isValid: false, error: 'phoneTooLong' };
const phoneRegex = /^(\+|00)?\d+$/;
if (!phoneRegex.test(trimmed)) return { isValid: false, error: 'phoneInvalidFormat' };
return { isValid: true };
```
Contrôle de **longueur AVANT le format**, sur la longueur **totale de la chaîne** (préfixe compris).
Consommé en production :
- `hooks/use-register-form.ts:133-138` — validation du numéro **à la soumission de l'inscription**
  (bloque l'inscription et affiche le toast d'erreur).
- `hooks/use-field-validation.ts:43-44` — `getPhoneValidationError` (validation de champ live).
- `components/auth/register-form/PhoneField.tsx`, `PhoneResetFlow.tsx` — `formatPhoneNumberInput`.

### Problems identified
- **[LIVE, inscription bloquée] E.164 maximal rejeté.** La norme E.164 autorise jusqu'à **15 chiffres**
  (hors préfixe international). Avec le préfixe `+`, `+123456789012345` fait **16 caractères** →
  `trimmed.length > 15` → `phoneTooLong`. Un numéro international **valide de 15 chiffres** est refusé
  à l'inscription. Avec `00`, `00` + 15 chiffres = 17 caractères → même rejet dès 15 chiffres.
- **[LIVE, incohérence prouvée] Verdict dépendant de la graphie du préfixe.** Le **même** numéro exprimé
  de trois façons équivalentes reçoit trois budgets de chiffres différents :
  - sans préfixe : `\d+` → **15 chiffres** autorisés (`123456789012345`, 15 car. ✓) ;
  - préfixe `+` : `+` + 14 chiffres max (le `+` consomme 1 car.) → **14 chiffres** ;
  - préfixe `00` : `00` + 13 chiffres max → **13 chiffres**.
  Un numéro devrait être jugé identiquement quelle que soit la façon dont l'utilisateur écrit le
  préfixe international.
- **[LIVE, message trompeur] Espaces/tirets signalés « trop long ».** Comme la longueur est contrôlée
  avant le format, `+33 6 12 34 56 78` (17 car.) sort `phoneTooLong` — alors que le vrai problème est
  un **format invalide** (espaces). Les tests existants documentent d'ailleurs ce contournement en
  commentaire (« With spaces, the total length exceeds 15 chars, so it fails phoneTooLong first »),
  signe que l'ordre longueur-avant-format est un accident et non un choix.

### Root cause
Le budget de longueur (8-15) est appliqué à la **longueur brute de la chaîne** — qui inclut le préfixe
international `+` (1 car.) ou `00` (2 car.) — et non au **nombre de chiffres** du numéro. E.164 borne le
**nombre de chiffres**, pas la longueur de la représentation. De plus, contrôler la longueur avant le
format fait remonter des erreurs de format sous l'étiquette « trop long ».

### Business impact
Rejet silencieux à l'inscription pour les numéros internationaux longs (jusqu'à 15 chiffres) saisis
avec un préfixe `+`/`00` — précisément la saisie recommandée pour un produit multi-pays. L'utilisateur
voit « numéro trop long » sur un numéro parfaitement valide, sans recours évident. Incohérence de
message (« trop long » sur un numéro espacé) qui dégrade la confiance dans le formulaire.

### Technical impact
Fichier pur, testé (`__tests__/utils/phone-validator.test.ts`). Deux tests encodent explicitement le
bug (max « 15 caractères » et rejet « trop long » sur `+123456789012345` de 15 chiffres) et deux autres
s'appuient sur l'ordre longueur-avant-format pour classer les espaces/tirets en `phoneTooLong` — ils
seront corrigés pour refléter la sémantique juste (chiffres bornés 8-15, format signalé comme format).

### Risk assessment
**FAIBLE.** Changement local d'une fonction pure. La borne haute passe de « ≥ 16 car. » à « > 15
chiffres » : élargit l'acceptation (aucun numéro auparavant valide n'est rejeté sur la borne haute).
La borne basse passe de « < 8 car. » à « < 8 chiffres » : ne resserre que les cas pathologiques
`+` / `00` + < 8 chiffres (numéros internationaux trop courts) — aucun test ni appelant n'en dépend.
Le reclassement espaces/tirets `phoneTooLong` → `phoneInvalidFormat` n'affecte que le libellé du toast
(plus exact). Aucun impact fonctionnel côté appelants (ils lisent `isValid` + mappent l'erreur).

### Proposed improvements
1. Vérifier le **format d'abord** (`^(\+|00)?\d+$`) → `phoneInvalidFormat` (espaces/tirets/lettres).
2. Extraire les **chiffres** (retrait du préfixe `+`/`00`) et borner **8-15 chiffres** :
   `< 8` → `phoneTooShort`, `> 15` → `phoneTooLong`.
3. Mettre à jour la JSDoc et les exemples pour parler de **chiffres** et non de caractères.
4. Corriger/étendre les tests : `+123456789012345` (15 chiffres) devient **valide** ; `phoneTooLong`
   testé avec 16 chiffres ; espaces/tirets attendus en `phoneInvalidFormat` ; ajout de cas
   d'équivalence de préfixe (même numéro `+`/`00`/sans → même verdict).

### Expected benefits
- Inscription débloquée pour les E.164 longs valides.
- Verdict prisme-cohérent indépendant de la graphie du préfixe.
- Messages d'erreur exacts (format ≠ longueur).

### Implementation complexity
**FAIBLE** — un fichier de production + un fichier de test, purement Jest-testable côté web.

### Validation criteria
- `bun/npx jest __tests__/utils/phone-validator.test.ts` vert.
- `+123456789012345` (15 chiffres) → valide ; `+1234567890123456` (16) → `phoneTooLong`.
- `+33 6 12 34 56 78` → `phoneInvalidFormat` (et non `phoneTooLong`).
- Équivalence : `123456789012345`, `+123456789012345`, `00123456789012345`… jugés cohéremment.
- `tsc` sans nouvelle erreur.

## Candidats écartés (documentés)
- **F25b** — fusion des deux validateurs téléphone (`phone-validator` simple ↔ `phone-validation-robust`
  libphonenumber). Refactor comportemental MOYEN (itérations 49/69/70), hors scope d'un cycle bugfix pur.
- **F69** — `sanitizeFileName` (255 car.) : 0 appelant production, reporté.
- **F70** — `deepCleanTranslationOutput` : code mort, reporté.
