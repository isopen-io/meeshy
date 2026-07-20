# Itération 167i — Analyse UI/UX iOS : `ShareLinkDetailView` (VoiceOver structurel)

**Date** : 2026-07-19
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/ShareLinkDetailView.swift`
**Base** : `main` HEAD (`efedb69e4`)
**Branche** : `claude/laughing-thompson-cwu3q5`
**Gate** : CI `iOS Tests`
**Catégorie** : Accessibilité — VoiceOver (structure, information portée par icône/couleur seule, état transitoire muet)

## Contexte

`ShareLinkDetailView` est l'écran de détail d'un lien de partage (carte d'en-tête avec statut
actif/inactif, barre d'actions Copier / Partager / Activer-Désactiver / Supprimer, cartes de
statistiques, section informations). Elle est présentée depuis `ShareLinksView` via
`NavigationLink`.

Numéro **167i** : strictement au-dessus du plus haut en vol (166i = `MessageTranscriptionDetailView`,
PR #2030 ; 165i = `StatsTimelineChart`, PR #2028). `ShareLinkDetailView` n'est ciblée par **aucune
PR ouverte** au run (vérifié via `list_pull_requests`) → 0 contention. **Aucun test** ne la
référence (seul appelant : `ShareLinksView`).

## Constat (avant 167i)

Le fichier ne portait **aucun** modifier d'accessibilité (`grep` = 0 occurrence). Cinq lacunes
concrètes de lecture VoiceOver :

1. **Statut porté par icône + couleur seule** (`headerCard`) : l'état actif/inactif est signalé
   par le glyphe `link` vs `link.badge.minus` et la teinte accent-vs-gris. Le glyphe est
   décoratif et redondant avec le `statusBadge` texte juste en dessous — mais n'était pas masqué.
2. **Carte d'en-tête éclatée** : `displayName`, `statusBadge` (« Actif »/« Inactif »), titre de
   conversation et `joinUrl` monospace = quatre éléments frères lus en quatre swipes distincts.
3. **État « copié » transitoire muet** : le bouton Copier bascule son icône (`doc.on.doc` →
   `checkmark`) et sa couleur (accent → success) pendant 2 s — **feedback purement visuel**, aucune
   annonce VoiceOver. Violation directe de « never rely only on color to convey meaning ».
4. **Boutons d'action à glyphe non masqué** : les 4 `actionButton` exposaient leur `Image` SF
   Symbol décorative à VoiceOver (annoncée « image ») en plus du libellé texte.
5. **Paires label/valeur non groupées** : cartes de stats (`statCard`) et lignes d'info
   (`infoRow`) lues comme deux éléments déconnectés au lieu d'une annonce cohérente.

Point secondaire : les titres de section (« STATISTIQUES », « INFORMATIONS ») n'étaient pas
marqués comme en-têtes → pas de navigation au rotor VoiceOver.

## Corrections appliquées (1 fichier, 0 logique, 0 changement visuel)

- **Glyphe de statut d'en-tête** : `.accessibilityHidden(true)` (décoratif, état déjà porté par
  `statusBadge`).
- **Carte d'en-tête → 1 élément VoiceOver** : `.accessibilityElement(children: .combine)` sur la
  `VStack` — lecture composée « Nom, Actif, Conversation, URL » en une annonce.
- **Annonce « copié »** : `UIAccessibility.post(notification: .announcement, …)` déclenché à la
  copie (idiome déjà utilisé dans `CallView`/`StoryViewerView`). 1 clé i18n neuve
  `shareLink.a11y.copied` (« Lien copié »), code-only via `defaultValue`.
- **`actionButton`** : glyphe `.accessibilityHidden(true)` + `.accessibilityLabel(label)` +
  `.accessibilityAddTraits(.isButton)` explicites (libellé stable, indépendant du glyphe qui varie
  selon l'état).
- **`statCard`** : glyphe `.accessibilityHidden(true)` + `.accessibilityElement(children: .combine)`
  → « 12, Utilisations » en une annonce (`∞` lu « infinity » par VoiceOver, contexte donné par le
  label « Maximum »).
- **`infoRow`** : `.accessibilityElement(children: .combine)` → « Identifiant, ABC123 ».
- **`sectionTitle`** : `.accessibilityAddTraits(.isHeader)` → navigation au rotor par en-têtes.

**1 clé i18n neuve, suffixée `.a11y`** (VoiceOver-only, référencée code-only via `defaultValue` —
0 édition xcstrings, parité 100i/104i) : `shareLink.a11y.copied`.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 changement de layout/couleur/copie visible,
  0 test neuf. `UIAccessibility` (UIKit) déjà résolu dans ce fichier (`UIPasteboard`,
  `UIActivityViewController`, `UIApplication` y sont déjà utilisés) → **aucun import neuf**.
- **Dynamic Type déjà conforme** : les polices utilisent des styles sémantiques (`.title3`,
  `.caption`, `.subheadline`, `.system(.caption, design: .monospaced)`) qui scalent nativement →
  aucune conversion `MeeshyFont.relative` requise, itération purement VoiceOver.
- Aucun test ne référence `ShareLinkDetailView` → aucune régression de test.

## Statut

**TERMINÉE** — `ShareLinkDetailView` désormais entièrement lisible par VoiceOver : statut/état
énoncés en clair (plus par icône/couleur seule), carte d'en-tête et paires label/valeur groupées,
état « copié » annoncé, en-têtes de section navigables au rotor. Ne plus re-flagger cette surface
pour VoiceOver ni Dynamic Type.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `ShareLinkDetailView` — **167i** : VoiceOver structurel complet (glyphes décoratifs masqués,
  carte d'en-tête + `statCard` + `infoRow` en `children: .combine`, annonce `.announcement` de
  l'état « copié », `actionButton` labels/traits explicites, `sectionTitle` `.isHeader`, 1 clé
  `.a11y` neuve). Dynamic Type déjà conforme (styles sémantiques). **SOLDÉ.**
