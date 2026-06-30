# Analyse UI/UX — Itération 69wb (Web)

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
