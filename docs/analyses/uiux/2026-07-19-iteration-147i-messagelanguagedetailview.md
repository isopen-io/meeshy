# Itération 147i — Analyse UI/UX iOS : `MessageLanguageDetailView`

**Date** : 2026-07-19
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageLanguageDetailView.swift`
**Base** : `main` HEAD (`efedb69e4`)
**Branche** : `claude/laughing-thompson-lknori`
**Gate** : CI `iOS Tests`

## Contexte

`MessageLanguageDetailView` est l'**explorateur de langues du Prisme Linguistique** pour un message —
la vue « Langue » du `MessageMoreSheet` documentée dans `CLAUDE.md` (SEUL point d'entrée pour explorer
les traductions). Elle affiche la bannière de langue originale, un aperçu du contenu (texte ou
transcription audio), la traduction sélectionnée, et la liste des langues supportées avec, pour chacune,
un aperçu de traduction + une action (« Traduire » / retraduire / sélectionner).

**Surface fraîche, jamais traitée** : contrairement aux ~146 itérations précédentes, ce fichier était
**absent** à la fois de l'ensemble annoté « doctrine » (70 fichiers) ET de l'ensemble traité
accessibilité (163 fichiers) — 0 `accessibilityLabel`/`accessibilityHidden`/`accessibilityElement`,
0 annotation de doctrine. Les polices y utilisent déjà des **styles de texte Dynamic Type**
(`.caption`, `.footnote`, `.subheadline` — pas de `.system(size:)`) → **aucune migration Dynamic Type
requise**, uniquement des défauts d'accessibilité VoiceOver.

## Constat (avant 147i) — défauts a11y réels, pas cosmétiques

1. **Bouton « fermer la traduction sélectionnée » (`xmark.circle.fill`, icône seule)** — **aucun
   `.accessibilityLabel`**. VoiceOver annonçait le nom brut du symbole (« xmark circle fill ») au lieu
   d'un libellé d'action. **Défaut a11y avéré** (Pattern 1, identique au défaut corrigé en 146i sur
   `VoiceProfileManageView`).
2. **Bouton « retraduire » (`arrow.clockwise`, icône seule)** — **aucun `.accessibilityLabel`**.
   VoiceOver annonçait « arrow clockwise ». C'est le « Bouton retraduire » documenté dans `CLAUDE.md`.
   **Défaut a11y avéré** (Pattern 1).
3. **Glyphes décoratifs non masqués** : `text.bubble.fill` (bannière originale), `waveform` ×2 (aperçu
   transcription texte + aperçu transcription audio) — VoiceOver lisait le nom brut du symbole **en plus**
   du libellé texte adjacent qui porte déjà le sens → doublon verbeux.
4. **Glyphe de statut de rangée (`checkmark.circle.fill` / `chevron.right`)** — non masqué → VoiceOver
   lisait « checkmark circle fill » / « chevron right ». Pire : l'état **sélectionné** n'était signalé
   que par la **couleur** (fond + libellé teintés) + ce glyphe brut → **dépendance à la couleur seule**
   pour VoiceOver (violation « never rely only on color » une fois le nom du symbole retiré).

## Corrections appliquées (1 fichier, 0 logique)

- **Bouton fermer** : `.accessibilityLabel("Fermer")` via clé `common.close` **déjà utilisée** ailleurs
  (aucune clé i18n neuve — précédent 146i). Glyphe `xmark.circle.fill` gardé (chrome de la carte).
- **Bouton retraduire** : `.accessibilityLabel("Retraduire")` via **nouvelle** clé namespacée
  `message-detail.retranslate` (famille existante `message-detail.*`, `defaultValue` inline conforme à
  la convention du fichier — pas de clé « close »/« translate » réutilisable pour ce sens).
- **Glyphes décoratifs** (`text.bubble.fill`, `waveform` ×2) → `.accessibilityHidden(true)` (le libellé
  texte adjacent porte le sens → évite l'annonce redondante du nom du symbole).
- **Glyphe de statut de rangée** (`checkmark`/`chevron`, 2 sites) → `.accessibilityHidden(true)` **+**
  ajout de `.accessibilityAddTraits(isSelected ? .isSelected : [])` sur le **bouton de rangée**. Le trait
  `.isSelected` **remplace** le glyphe checkmark masqué comme repère de sélection **non-fondé-sur-la-
  couleur** pour VoiceOver → correction complète (masquer le symbole sans ce trait aurait laissé les
  utilisateurs VoiceOver sans aucun repère de sélection). `isSelected` est déjà calculé dans
  `languageRow` → 0 état neuf.

**Pas de dépendance à la couleur seule** : après 147i, l'état sélectionné est porté par le trait
sémantique `.isSelected` (annoncé par VoiceOver), pas seulement par la teinte. Contrainte respectée.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, 1 clé i18n neuve (`message-detail.retranslate`,
  `defaultValue` inline — le runtime n'exige pas sa présence préalable dans `Localizable.xcstrings`).
  `import MeeshyUI` déjà présent. Les patterns `.accessibilityLabel(String(localized:…))` et
  `.accessibilityAddTraits(cond ? .trait : [])` sont déjà employés ailleurs dans le codebase → compile OK.
- Les actions réseau (`translateTo`, `translateAudioTo`, `loadExistingTranslations`, `mergeAudioTranslations`)
  ne sont **pas** touchées.
- Aucun test ne référence `MessageLanguageDetailView` → aucune régression de test. Gate = CI `iOS Tests`.
- **0 contention** : fichier absent des surfaces des PR iOS ouvertes (scan par sous-agent Explore, 233 fichiers).

## Statut

**TERMINÉE** — `MessageLanguageDetailView` : 2 boutons icône-seule labellisés (défauts a11y réels
corrigés), 4 glyphes décoratifs masqués à VoiceOver, état de sélection de rangée porté par `.isSelected`
(repère non-couleur). Aucune migration Dynamic Type nécessaire (styles de texte déjà en place). Ne plus
re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `MessageLanguageDetailView` — bouton fermer `.accessibilityLabel` (`common.close`, défaut a11y corrigé) ;
  bouton retraduire `.accessibilityLabel` (`message-detail.retranslate`, défaut a11y corrigé) ; glyphes
  décoratifs `text.bubble.fill`/`waveform`×2 `.accessibilityHidden` ; glyphe de statut de rangée masqué +
  `.accessibilityAddTraits(.isSelected)` sur le bouton de rangée (repère de sélection non-couleur).
  **SOLDÉ 147i.**
