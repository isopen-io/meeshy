# Analyse UI/UX — Itération 62wc (web)

## Périmètre
Application **web uniquement** (`apps/web/`). iOS/Android hors périmètre (référence
iOS seulement pour parité naturelle des features).

## Déclencheur de la routine
`pull_request.closed` #835 (`claude/practical-fermat-x182ra` → `main`) =
**iter-61w mergée** (anti-pattern `t()||fallback` cluster en-tête de conversation +
4 clés manquantes). `main` HEAD = `d63c4a5`.

## Revue de cohérence (étapes 1–3 de la routine)

### Étape 1 — Doublons d'analyses
Aucun doublon de contenu dans `docs/analyses/uiux/`. La numérotation reste bornée
par itération (`*w`/`*wb`/`*wc` = passes disjointes sur collisions d'agents
parallèles). Aucune ré-analyse répétée d'un même composant. La cible 62wc
(cluster **conversation details-sidebar**) n'a jamais été traitée pour
l'anti-pattern `t()||'fb'`.

### Étape 2 — Couverture plans/corrections
Tous les items i18n/a11y 49w→61w ont un plan ET une annotation de merge dans
`branch-tracking.md`. Le différé systémique restant = l'anti-pattern
`t('key') || 'fallback'` (~285 occ. / 40 fichiers mesurés sur `main` HEAD).
**Forte contention** ce cycle — agents parallèles déjà sur des volets disjoints :
- **#840 mergé** : iter-62w *layout chrome* (`t()||'fb'`).
- **#843 ouvert** : iter-62w *message bubble cluster* (`components/common/bubble-message/*`, `useMessageActions`).
→ Pour rester **orthogonal** (zéro fichier partagé), cette itération attaque un
cluster encore intact : la **sidebar de détails de conversation**.

### Étape 3 — Annotations
`branch-tracking.md` mis à jour : nouvelle entrée **62wc** ; cluster
details-sidebar marqué soldé pour l'anti-pattern. NE PLUS re-flagger ce cluster
pour `t() || 'fb'`.

## Étape 4 — Optimisation livrée

### Constat (anti-pattern dead-code)
Grep `t\(['"][^'"]+['"]\)\s*\|\|\s*['"]` sur le cluster details-sidebar →
**7 occurrences** sur 6 fichiers de l'anti-pattern `t('key') || 'texte'`. C'est la
classe de bug soldée en 50w (AudioEffects), 60wb (auth), 61w (en-tête conv).

**Pourquoi c'est l'anti-pattern** : `useI18n.t(key)` renvoie la **clé brute**
(string truthy) quand la traduction n'est pas chargée OU absente
(`return fallback || key`, `use-i18n.ts:172`). Donc `t('key') || 'Loading...'` :
- ne tombe **jamais** sur le secours `||` quand la clé existe (clé brute truthy) ;
- pendant le flash de chargement / si la clé manque, l'utilisateur voit la **clé
  brute** au lieu du secours → flash-of-raw-keys.
- le construct est doublement faux : secours mort + clé brute affichée.

### Vérification des clés (zéro changement visible runtime)
Contrôle clé par clé sous le wrapper `conversations.*` (le hook
`useI18n('conversations')` extrait `translations['conversations']`,
`use-i18n.ts:82-84`) : **les 4 clés utilisées existent ×4 locales** (en/fr/es/pt) :
- `common.loading` = `Loading...`/`Chargement...`/`Cargando...`/`Carregando...`
- `conversationDetails.clickToChangeImage` ✓ ×4
- `conversationDetails.imageUpdated` ✓ ×4 (`Conversation image updated`…)
- `conversationDetails.imageUploadError` ✓ ×4
- `conversationDetails.descriptionUpdated` ✓ ×4

⇒ Les clés résolvant déjà correctement, le secours `||` est du **dead-code** non
atteint aujourd'hui. La correction est donc une **hygiène pure** (zéro changement
visible runtime) : elle supprime l'anti-pattern et rend le secours réellement
fonctionnel via la signature native `t(key, fallback)`.

### Correctif (signature de secours native)
`t('key') || 'texte'` → **`t('key', 'texte')`** sur les 7 occurrences. Le 2ᵉ
argument string est traité comme **fallback natif** par `useI18n` (anti-flash,
`fallbackLocale='en'`, leçon 50w). Les secours sont **anglicisés sur la valeur EN
exacte du locale** (leçon 50w) :
- `imageUpdated` : secours `'Image updated'` → **`'Conversation image updated'`**
  (valeur EN exacte de `conversations.json`).
- Les 4 autres secours étaient déjà alignés sur la valeur EN exacte → conservés.

### Périmètre exact (6 fichiers, 7 occurrences)
- `components/conversations/conversation-details-sidebar.tsx` (2 : `imageUpdated`, `imageUploadError`)
- `components/conversations/details-sidebar/DetailsHeader.tsx` (1 : `clickToChangeImage`)
- `components/conversations/details-sidebar/CategorySelector.tsx` (1 : `common.loading`)
- `components/conversations/details-sidebar/TagsManager.tsx` (1 : `common.loading`)
- `components/conversations/details-sidebar/CustomizationManager.tsx` (1 : `common.loading`)
- `hooks/use-conversation-details.ts` (1 : `descriptionUpdated`)

### Décisions / hors périmètre
- **Aucune clé i18n neuve, aucun fichier locale touché** : les 4 clés existent
  déjà ×4 locales (vérifié). Diff strictement composant/hook (6 fichiers, +7/-7).
- **Aucun élargissement de type `t`** nécessaire : ces fichiers consomment
  `useI18n('conversations')` directement (signature native `(key, fallback?)`), pas
  de `t` narrowé en prop (contrairement au cluster en-tête 61w).
- Les ~278 occ. restantes (~38 fichiers : admin, settings, video-calls,
  ConversationSettingsModal 29 occ., PhoneResetFlow 56 occ.…) → lots cohérents
  bornés futurs, à coordonner avec les agents parallèles (#843 message bubble).

## Faux positifs / NE PLUS re-flagger
- `components/conversations/details-sidebar/*` + `conversation-details-sidebar.tsx`
  + `hooks/use-conversation-details.ts` : anti-pattern `t() || 'fb'` **soldé** → ne
  plus signaler ce cluster.

## Revue optimisation (étape 4) — opportunités repérées (différées, bornées)
- Gros porteurs de l'anti-pattern restants : `ConversationSettingsModal.tsx`
  (29 occ.), `PhoneResetFlow.tsx` (56 occ., post-#800), `app/auth/magic-link/page.tsx`
  (44 occ.), `app/forgot-password/check-email/page.tsx` (20 occ.),
  `app/links/tracked/[token]/page.tsx` (15 occ.), `app/reset-password/page.tsx`
  (12 occ.) — chacun = un lot borné dédié (vérifier l'existence des clés ×4 au cas
  par cas avant transformation).
- `Badge` success/warning/gold off-palette → arbitrage `theme.colors.*` vs `gp-*`.
- Surfaces sous contention active (#843 message bubble) : ne pas toucher.

## Statut
✅ Implémenté — itération **62wc**. Diff minimal (6 fichiers, +7/-7, **0 locale**).
`node_modules` absent du container routine → typecheck/build délégués au CI (cf.
58wb/59w/60wb/61w). Transformation mécanique string-level type-safe ; clés vérifiées
présentes ×4 locales ⇒ zéro changement visible runtime.

## ✅ Annotation de complétude
**SOLDÉ en 62wc** — cluster details-sidebar de conversation : anti-pattern
`t() || 'fb'` éliminé (7 occ. / 6 fichiers ; `grep`=0 sur le répertoire). **NE PLUS
re-flagger** ces 6 fichiers pour l'anti-pattern. Numérotée **62wc** (62w pris par
#840 layout chrome mergé ; 62wb réservé probable à #843 message bubble en vol ;
suffixe `w` = web).
