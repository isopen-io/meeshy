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
> **Scope** : `apps/web` **exclusivement**. Les vues iOS ne servent que de référence de parité (couleurs/features naturelles Meeshy), jamais d'objet de revue.
> **Thème** : accessibilité clavier (WCAG 2.1.1 *Keyboard* / 4.1.2 *Name, Role, Value* / 2.4.7 *Focus Visible*) des **segments de la timeline d'effets audio** — `<div onClick>` souris-only servant à *chercher* (seek) un point de lecture. Catégorie « **différé prioritaire 69w+** » du pointeur autoritaire (a11y clavier des `<div onClick>` non-`<button>` HORS video-calls/conversation-list/create-link-modal). Candidat **nommé** de l'audit 69w : `audio/AudioEffectsTimeline.tsx` (seek).

## Contexte de continuité
La routine a déjà soldé : anti-pattern i18n `t('key')||'fallback'`, aria-labels de contenu, focus-traps modales, `prefers-reduced-motion` global (#862), tokens dark-mode, épuration code mort, et la **vague a11y clavier** des `<div onClick>` non-`<button>` : liste de conversations + tuile audio (**67w / #1078**), contrôles plein écran appel vidéo (**68w / #1082**), et — **en vol** — le modal de création de lien (**69w / #1084**, `LanguagesSection`/`PermissionsSection`/`SelectableSquare`).

PR web en vol au démarrage (vérifiées via `list_pull_requests`) : **#1084** (a11y clavier create-link-modal, iter-69w) et **#1077** (i18n `t()||fb` `auth/verify-phone`). Surface choisie **strictement orthogonale** aux deux. **Numérotée 69wb** car 69w est occupé par #1084.

## Constat vérifié (file:line) et correction

| # | Fichier | Problème | Correction |
|---|---------|----------|-----------|
| 1 | `components/audio/AudioEffectsTimeline.tsx:53-65` | Chaque **segment de timeline** (une période d'activation d'un effet) est un `<div onClick={() => onSeekToTime(startTimeSeconds)}>` avec `cursor-pointer` + `title`, mais **sans `role`, `tabIndex`, `onKeyDown` ni anneau de focus**. Cliquer un segment fait *seek* la lecture audio à son début ; au **clavier** l'action est **inatteignable**, et le segment est **invisible au lecteur d'écran** (pas de rôle ni de nom accessible — `title` n'est pas annoncé de façon fiable). C'est le **seul** déclencheur de l'action (aucun bouton interne, contrairement à `invite-user-modal`). | `role="button"` + `tabIndex={0}` + `aria-label={segmentLabel}` (réutilise le **contenu i18n existant** du `title` : `« {début}s - {fin}s - {timeline.clickToSeek} »`) + `onKeyDown` Enter/Space (`preventDefault` → `onSeekToTime`) + anneau `focus-visible:ring-2 ring-inset ring-ring` (**`ring-inset`** car le conteneur parent est `overflow-hidden` — un anneau extérieur serait rogné). Clic souris **inchangé**. |

> **Pourquoi ce composant** : `AudioEffectsTimeline` est rendu par `AudioEffectsPanel` → **lazy-loadé par `SimpleAudioPlayer`** (lecture de **tout** message audio) ⇒ surface **LIVE** large. Le fix réutilise la chaîne de `title` déjà i18n comme nom accessible ⇒ **0 nouvelle clé i18n**. `invite-user-modal.tsx` (autre candidat de l'audit 69w) a été **écarté** : sa ligne de résultat contient déjà un `<Button>` « Ajouter » focusable (l'activation clavier du bouton *bubble* un `click` au `<div>` parent) → la ligne **est** opérable au clavier ; y ajouter `role="button"` **imbriquerait** deux contrôles interactifs (violation WCAG 4.1.2). Différé/non-applicable, documenté ci-dessous.

## Tests
- **NOUVEAU** `__tests__/components/audio/AudioEffectsTimeline.test.tsx` — 6 cas : segment exposé comme `button` focusable (`tabIndex=0`) avec nom accessible (`/{début}s - {fin}s - Click to seek/`), seek sur **Enter**, seek sur **Space**, no-op touche neutre (`Tab`), parité **clic** souris préservée, **aucun** `button` rendu quand `effectsTimeline` est vide (rendu « noSegment »). Mocks alignés sur les tests audio existants (`useI18n`, `AudioEffectIcon`, `audio-effects-config`).
- `node_modules` absent localement (identique à 67w/68w/69w) → exécution `jest`/`tsc` **déléguée au CI** (gate `Test web` + `Quality (bun)`). Le diff est mécaniquement identique au pattern déjà mergé en 67w/68w (inline `onKeyDown` Enter/Space + `role` + `focus-visible`) et reproduit en 69w.

## Hors-scope confirmé / différé (70w+)
- `invite-user-modal.tsx` : **non-applicable** (bouton interne déjà clavier-accessible ; ajouter un rôle imbriquerait les contrôles). **NE PLUS re-flagger** comme gap clavier.
- Reste de l'audit a11y clavier (bornés/orthogonaux) : `admin/agent/AgentConfigDialog.tsx` + `AgentGlobalConfigTab.tsx` (toggles `Badge`), `details-sidebar/*` (`DetailsHeader`/`CustomizationManager`/`DescriptionSection` — édition au clic). ⚠️ `details-sidebar` est dans `components/conversations/` mais **hors** du cluster « liste de conversations » 67w → encore à traiter.
- Backdrops/dismiss (`onClick={onClose}` doublés d'un bouton de fermeture visible + Escape) : **basse priorité**, pas un gap bloquant.
- classe résiduelle `t()||fallback` (`app/settings`, `contacts`, `PhoneResetFlow`, `StoryViewer`, `dashboard/LastMessagePreview`…) par lots bornés.
- `Test shared` rouge sur `main` = régression migration zod v4 (hors-scope web, propriétaire shared ; cf. branch-tracking — check non bloquant).

---

## ✅ ANALYSE CORRIGÉE & COMPLÈTE (69wb — 2026-06-30)
Le constat est **corrigé et testé** (en attente merge `main`). **NE PLUS re-flagger** :
- `AudioEffectsTimeline.tsx` segments de timeline pour l'a11y clavier / `aria-label` / focus (soldé — vaut pour **tous** les segments rendus).
- `invite-user-modal.tsx` ligne de résultat comme gap clavier (non-applicable, bouton interne déjà accessible).
Catégorie « **a11y clavier des `<div onClick>` non-`<button>`** » : segments audio timeline **épuisés**. Reste à balayer (cf. § Hors-scope) pour 70w+.
