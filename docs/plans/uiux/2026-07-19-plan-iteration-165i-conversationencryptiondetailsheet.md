# Plan Itération 165i — `ConversationEncryptionDetailSheet` VoiceOver

**Piste** : iOS (`i`) · **Base** : `main` HEAD `efedb69e4` · **Branche** : `claude/laughing-thompson-k6bl5v`
**Gate** : CI `iOS Tests`

## Objectif
Combler 3 lacunes VoiceOver sur la feuille de détail du chiffrement (surface fraîche, déjà conforme
Dynamic Type + palette). Sweep a11y pur, 0 logique, 0 changement visuel.

## Étapes
1. [x] Resync `main` (HEAD `efedb69e4`), reset branche `claude/laughing-thompson-k6bl5v`.
2. [x] Sélection cible : `ConversationEncryptionDetailSheet` (0 mention tracking, 0 test, icônes non
   labellisées + Toggle `labelsHidden` anonyme).
3. [x] En-tête actif : `Image("lock.shield.fill")` → `.accessibilityHidden(true)` ; `HStack` →
   `.accessibilityElement(children: .combine)`.
4. [x] En-tête inactif : `Image("lock.open")` → `.accessibilityHidden(true)` ; `HStack` → `.combine`.
5. [x] Rangée toggle : `Image("lock.fill")` → `.accessibilityHidden(true)` ; `HStack` (Text +
   Toggle `disabled`+`labelsHidden`) → `.combine` (nom + valeur folded en un élément).
6. [x] Analyse + plan docs (`165i`).
7. [ ] Commit + push `claude/laughing-thompson-k6bl5v`.

## Vérification
- **Compile** : modifs = 6 modificateurs SwiftUI standards (`accessibilityHidden`,
  `accessibilityElement`), aucun symbole neuf, `MeeshyColors` déjà importé. Gate réel = CI `iOS Tests`
  (macOS ; build local iOS indisponible dans cet environnement Linux).
- **Non-régression** : 0 logique, 0 clé i18n neuve, 0 test référence le fichier, 0 changement de
  layout/couleur/copie visible.

## Doctrine appliquée
- « Never rely only on color to convey meaning » : glyphes cadenas décoratifs masqués, état porté par
  le texte.
- Regroupement VoiceOver (`.combine`) = parité 163i/164i.
- Toggle `labelsHidden` sans nom = parité fix 105i (`VideoFilterControlView`).
