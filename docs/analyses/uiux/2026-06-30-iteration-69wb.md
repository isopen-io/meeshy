# Analyse UI/UX — Itération 69wb (Web)

> **⚠️ Collision parallèle** : un agent parallèle a livré un **autre `69w`** (a11y clavier `create-link-modal`, branche `claude/practical-fermat-vbsdvr`, déjà sur `main`). Cible **orthogonale** (fichiers différents) → travail conservé, **renuméroté `69wb`**. `AttachmentPreviewReply.tsx` reste **non couvert** par leur PR (0 `onKeyDown` sur le `main` fusionné) — correction toujours nécessaire, non-doublon.
>
> **Scope** : `apps/web` **exclusivement**. Les vues iOS ne servent que de référence de parité (couleurs/features naturelles Meeshy), jamais d'objet de revue.
> **Thème** : accessibilité clavier (WCAG 2.1.1 *Keyboard* / 2.4.7 *Focus Visible*) des **previews d'attachments en zone de réponse** — éléments `role="button"` + `tabIndex={0}` **sans `onKeyDown`** : focusables et annoncés comme boutons mais **inactivables au clavier**.
> **Base** : `main` HEAD `b0c15b6` (post-merge #1078 iter-67w + 68w video-calls a11y + 67w verify-phone).
> **Branche** : `claude/practical-fermat-47i08j`.

## Contexte de continuité

La routine a déjà soldé exhaustivement : anti-pattern i18n `t('key')||'fallback'` (50w→66w), aria-labels de contenu,
focus-traps modales, `prefers-reduced-motion` global (#862), tokens dark-mode, épuration code mort, lazy-load images,
**a11y clavier liste de conversations + tuile audio (67w / #1078)** et **a11y clavier contrôles plein écran appel vidéo
(68w, `DraggableParticipantOverlay` + `VideoCallInterface`)**.

Le doc 68w désigne explicitement le gisement restant : « **audit transverse `role="button"` sans `onKeyDown`/`focus-visible`,
hors video-calls/conversations** ». Audit transverse réalisé (`grep role="button"` sans `onKeyDown` dans le même fichier
sur `components/` + `app/`) → **1 seul fichier survivant** : `components/attachments/AttachmentPreviewReply.tsx`.

### Doublons d'analyses
Aucun doublon introduit. Cette surface (`attachments/`) n'a jamais été ciblée par une itération a11y clavier antérieure.
La catégorie « `<div onClick>`/`role="button"` souris-only » est désormais **quasi épuisée** côté web (voir clôture).

## Constats vérifiés (file:line) et corrections

`components/attachments/AttachmentPreviewReply.tsx` exposait **3 previews interactifs** avec `role="button"` + `tabIndex={0}`
+ `aria-label` mais **aucun `onKeyDown`** dans tout le fichier : focusables au `Tab`, annoncés « bouton » par le lecteur
d'écran, mais **impossible à activer au clavier** (ni `Enter`, ni `Espace`) — faux sens d'accessibilité (le test existant
n'assertait que `tabindex=0`, jamais l'activation). Aucun anneau de focus visible non plus.

| # | Élément | Problème | Correction |
|---|---------|----------|-----------|
| 1 | Miniature **image** cliquable (`:156`) | `role="button"`/`tabIndex=0` sans `onKeyDown` → ouvre la lightbox image à la souris seule ; pas de `focus-visible`. | `onKeyDown` Enter/Espace → `openImageLightbox(index)` + anneau `focus-visible:ring-2 ring-purple-500`. |
| 2 | Tuile **PDF** cliquable (`:225`) | idem → ouvre la lightbox PDF souris seule. | `onKeyDown` Enter/Espace → `openPdfLightbox(attachment)` + `focus-visible`. |
| 3 | Tuile **texte/code** cliquable (`:247`) | idem → ouvre la lightbox texte souris seule. | `onKeyDown` Enter/Espace → `openTextLightbox(attachment)` + `focus-visible`. |

### Approche (épuration / DRY)
Les 3 handlers `handle*Click` (qui mêlaient `stopPropagation` + mutation d'état) sont **découplés** : extraction de 3 **actions
pures** `open{Image,Pdf,Text}Lightbox` réutilisées par la souris **et** le clavier, plus un helper unique
`activateOnKey(action)` (Enter/Espace, `preventDefault`+`stopPropagation`) — même idiome que 68w (`DraggableParticipantOverlay`),
zéro duplication de la logique d'ouverture. Anneau de focus violet aligné sur la charte (bouton plein écran vidéo déjà en
`purple-*` dans le même composant).

> **Pas de nouvelle clé i18n** : les `aria-label` existaient déjà (`actions.openImageNamed`/`openPdfNamed`/`openTextFileNamed`,
> ×4 locales). Strictement une correction d'activation clavier + focus visible.

## Tests
- **MIS À JOUR** `__tests__/components/attachments/AttachmentPreviewReply.test.tsx` — bloc `Accessibility` enrichi de **4 cas**
  d'activation **réelle** (au-delà du `tabindex` seul) : ouverture lightbox image via **Enter**, PDF via **Espace**, texte via
  **Enter**, et **no-op** sur touche neutre (`a`) — comble le trou « focusable mais pas activable ».
- **Résultat** : suite `AttachmentPreviewReply` → **33 passed** (29 → 33). Répertoire `attachments/` complet → **7 suites /
  235 passed / 3 skipped**. Auth précédemment flaggée (`forgot-password`) revérifiée verte sur `main` → **44 passed** (note
  périmée, voir tracking).

## Hors-scope confirmé
- Lecteurs audio/vidéo compacts (`CompactAudioPlayer`/`CompactVideoPlayer`) et bouton plein écran vidéo : déjà des `<button>`
  natifs ou conteneurs `role="listitem"` non interactifs → **pas de gap clavier**.
- Typecheck/ESLint local : `@meeshy/shared/dist` non build localement (pré-existant, identique sur `main`) ; le diff n'ajoute
  que des attributs JSX standards + `useCallback` (mêmes patterns que 67w/68w mergés). Gate réel = `Quality (bun)` CI.

---

## ✅ ANALYSE CORRIGÉE & COMPLÈTE (69w — 2026-06-30)
Les 3 constats sont **corrigés et testés**. **NE PLUS re-flagger** `AttachmentPreviewReply.tsx` (image/PDF/texte) pour
l'activation clavier ni le `focus-visible`.

**Catégorie « a11y clavier des `role="button"`/`<div onClick>` non-`<button>` » : gisement ÉPUISÉ côté web** sur
`components/`+`app/` (audit `role="button"` sans `onKeyDown` même fichier = 0 survivant après ce correctif). Restes différés
distincts pour itérations futures (hors cette catégorie) :
- préférence applicative `preferences.reducedMotion` (toggle ApplicationSettings) encore quasi no-op (état serveur async) ;
- audit `<span onClick>`/`<li onClick>` interactifs résiduels au cas par cas (faible densité, à confirmer) ;
- revue d'agencement/épuration de surcharge par fenêtre (densité d'écran) — thème produit non encore ouvert.
