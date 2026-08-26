# Itération 269 — Analyse : sept troncateurs d'aperçu de notification coupaient au milieu d'une paire de substituts UTF-16

## État courant

L'itération 268 a fermé la coupe UTF-16 non sûre dans `SecuritySanitizer.truncate`
(`services/gateway/src/utils/sanitize.ts`) — un piège ARMÉ mais **sans appelant de
production**. Son analyse notait explicitement que les troncateurs homonymes
(`truncateMessage` / `truncatePreview` / `truncateMessagePreview`) étaient
« distincts » et laissés de côté.

En posant à ces jumeaux la question du cycle 268 — *coupent-ils un point de code
ou une unité de code UTF-16 ?* — sept troncateurs de **contenu utilisateur servi**
se révèlent porter le MÊME défaut, cette fois en **production active**, sur le
chemin le plus sensible du dépôt (le texte poussé sur l'écran verrouillé et dans
les e-mails — la « face servie » du Prisme, cf. `CLAUDE.md` cycles 121-126).

| # | site | cap | suffixe | contenu servi |
|---|---|---|---|---|
| 1 | `services/messaging/reproduceEditedMessageNotifications.ts:78` | 100 | `…` | aperçu de message édité (notification reproduite) |
| 2 | `services/posts/reproduceEditedSubjectNotifications.ts:112` | 100 | `…` | aperçu de sujet de post édité |
| 3 | `services/notifications/NotificationService.ts:2616` | 100 | `…` | `messagePreview` d'une notification |
| 4 | `services/notifications/NotificationService.ts:1088` | 200 | — | `translatedContent` servi sur le fil push (`servedTranslationFields`) |
| 5 | `services/notifications/NotificationService.ts:1665` | 200 | — | **`pushBody`** — le CORPS de la bannière push |
| 6 | `services/notifications/NotificationService.ts:1922` | 500 | — | `details` d'un e-mail d'alerte de sécurité |
| 7 | `services/notifications/NotificationService.ts:1936` | 500 | — | `details` d'un e-mail de notification sociale |

Les sites #1 et #2 sont **byte-identiques** — une duplication pure, en plus du bug.

## Problèmes identifiés

1. **`String.prototype.substring(0, N)` coupe sur une frontière d'UNITÉ DE CODE
   UTF-16, pas de POINT DE CODE.** Quand `N` tombe au milieu d'une paire de
   substituts — tout caractère hors du plan multilingue de base : émoji,
   extensions CJK, symboles mathématiques — le résultat se termine par un
   **substitut haut orphelin** (`\uD800`–`\uDBFF`), rendu `�`.
2. Le produit est **massivement émoji** ; le contenu poussé/persisté est
   exactement celui qui déclenche le défaut.

Mesure (témoin ROUGE) — 99 `a` suivis de `😀` (`😀`), cap 100 :

| appel | rendu AVANT | attendu |
|---|---|---|
| `truncatePreview('a'.repeat(99) + '😀…texte')` | `"aaa…a\uD83D…"` (→ `aaa…a�…`) | `"aaa…a…"` |

## Causes racines

Contrat de chaque site : « borner un aperçu à N caractères ». Écrits pour un monde
où « caractère » ≈ « unité de code », ils n'ont jamais été confrontés au hors-BMP.
C'est, une fois de plus, la règle du dépôt : *une garde se mesure sur tout son
espace d'entrée* (jumelle des cycles 260/266/268). Et la duplication (#1≡#2, plus
cinq variantes in-line) est le vecteur qui a laissé le même défaut se répandre en
sept exemplaires : il n'existait aucun site UNIQUE à corriger.

## Impact métier / technique

**Panne active de bas volume, mais sur le contenu le plus visible.** Un `�` en fin
d'aperçu apparaît sur la bannière de l'écran verrouillé (#5), dans la traduction
servie (#4), dans les e-mails (#6/#7) et dans les aperçus persistés (#1/#2/#3) dès
qu'un émoji chevauche la frontière de coupe. Probabilité ≈ 1/2 par émoji situé
exactement à la position de coupe — faible par message, mais permanent et
public sur une surface soignée.

## Évaluation du risque

**Faible.** La troncature sûre par points de code est un **sur-ensemble strict** de
correction : pour toute entrée ASCII (unités de code == points de code), la sortie
est identique au caractère près ; elle ne diffère QUE lorsque l'ancien code
produisait un substitut orphelin. Le compteur de garde passe d'unités de code à
points de code — invisible pour les fixtures ASCII des tests existants.

## Améliorations proposées

Extraire **UN** site : `truncateByCodePoints(content, maxCodePoints, ellipsis?)`
dans `services/gateway/src/utils/truncate-text.ts`, itérant les points de code
(`Array.from`) — jamais une demi-paire. Remplacer les sept sites. Supprimer les
deux `truncatePreview` dupliqués. Aligne le gateway sur `truncateMessagePreview`
(`routes/conversations/utils/last-message-preview.ts`, déjà sûr) et sur le
correctif du cycle 268.

## Bénéfices attendus

- Plus aucun `�` en fin d'aperçu/bannière/e-mail servis.
- Sept implémentations → une SSOT ; la prochaine divergence est structurellement
  empêchée (leçon 245i).

## Complexité d'implémentation

Basse. 1 nouveau fichier util + son test, 3 fichiers touchés (2 `reproduce*` +
`NotificationService.ts`), 7 remplacements mécaniques.

## Critères de validation

1. Test RED prouvé sur le nouvel util AVANT correctif (substitut orphelin).
2. Test GREEN : `truncateByCodePoints` ne coupe jamais une paire de substituts,
   respecte le cap en points de code, ajoute le suffixe seulement si tronqué.
3. Suites existantes des trois fichiers touchés vertes (aperçu/suffixe/longueur).
4. Suite gateway complète verte (aucune régression).
