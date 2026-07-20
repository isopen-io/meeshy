# Plan itération 88i — `DeleteAccountView` (iOS)

**Branche** : `claude/upbeat-euler-bhrdy6` (resync sur `main` HEAD `e89c7c1a`)
**Suffixe `i`** = piste iOS (parallèle web/android).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/DeleteAccountView.swift` (écran suppression de compte — à enjeu élevé, destructif).
**Contention** : 0 PR iOS ouverte au moment du run (`list_pull_requests` = []). Numéro `88i` = > 87i (plus haute analyse iOS mergée).

## Diagnostic (au-delà du sweep répétitif)

1. **Dynamic Type** : 20 `.font(.system(size:))` figés → Dynamic Type absent.
2. **Bug VISUEL ACTIF** (ligne 160) : `Text(String(localized:..., defaultValue: "Tapez **SUPPRIMER MON COMPTE** pour confirmer"))`.
   `String(localized:)` renvoie une `String` → `Text(String)` **ne parse PAS le markdown** → l'utilisateur voit les astérisques littérales `**SUPPRIMER MON COMPTE**`.
3. **Bug i18n LATENT (sévère)** : la phrase de confirmation est couplée à la traduction.
   - Serveur = `z.literal('SUPPRIMER MON COMPTE')` (`services/gateway/src/validation/delete-account-schemas.ts`) → la phrase tapée DOIT être exactement cette chaîne FR dans **toutes** les locales.
   - Les clés `account.delete.confirmation.{prompt,placeholder}` ne sont dans aucun catalogue (`defaultValue` seul) → aujourd'hui l'app affiche le FR partout (OK par accident). Mais dès qu'un traducteur ajoute + traduit ces clés (workflow i18n normal), un utilisateur EN/ES/DE/PT verrait « Type **DELETE MY ACCOUNT** » et **ne pourrait JAMAIS** supprimer son compte (bouton bloqué à vie).

## Corrections

1. **Dynamic Type** : 19 sites `.font(.system(size:))` → `MeeshyFont.relative(size, weight:, design:)` (weight/design préservés, dont `.monospaced`/`.rounded`).
   - **1 figé justifié & commenté** : héros `envelope.circle.fill` 64pt (décoratif ≥40pt, doctrine 84i/87i) + `.accessibilityHidden(true)`.
2. **Prompt de confirmation** (fix bugs 2 & 3, source unique) :
   - `defaultValue` `"Tapez **SUPPRIMER MON COMPTE** pour confirmer"` → `"Tapez %@ pour confirmer"` (format word-order-safe).
   - `requiredPhrase` (source unique = littéral serveur) injecté via `String(format:)`, puis mis en gras monospacé déterministe via `AttributedString.range(of:)` (mime le champ de saisie monospacé → signale « tapez exactement ceci »). Plus d'astérisques, plus de dérive i18n possible.
3. **Placeholder découplé** : `TextField(String(localized:"...placeholder"), …)` → `TextField(requiredPhrase, …)` (littéral non-traduisible = contrat serveur, supprime le risque de dérive).
4. **a11y** : `.accessibilityHidden(true)` sur héros décoratif envelope.

## Contraintes
- 1 fichier, 0 logique métier changée (le contrat `requiredPhrase == "SUPPRIMER MON COMPTE"` est préservé et renforcé comme source unique).
- 0 clé i18n neuve (réutilise `account.delete.confirmation.prompt` avec un `defaultValue` corrigé ; retire l'usage de `...placeholder` qui n'était pas au catalogue).
- 0 test neuf (swap présentation + fix rendu ; couverture structurelle CI).
- Gate = CI `iOS Tests` (`ios-tests.yml`).

## Après merge
- Supprimer la branche mergée, resync `main`, mettre à jour `branch-tracking.md` (pointeur iOS 89i).
