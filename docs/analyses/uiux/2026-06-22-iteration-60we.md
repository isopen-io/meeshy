# Analyse UI/UX — Itération 60we (web)

## Périmètre
Web uniquement. Revue de continuité (étapes 1–3 de la routine) + livraison d'une
optimisation bornée : **bug anti-pattern `t('key') || 'French'`** sur les deux
dialogues de recadrage/upload d'image.

## Étape 1 — Doublons d'analyses
Aucun doublon de contenu détecté dans `docs/analyses/uiux/`. Les fichiers
`*w/*wb/*wc` sont des passes disjointes (numérotation incrémentée sur collisions
d'agents parallèles, conformément à `branch-tracking.md`). Aucune ré-analyse
répétée d'un même composant. Le cluster i18n feed (53w→58wb) reste entièrement
soldé.

## Étape 2 — Couverture plans/corrections
Tous les items i18n/a11y des itérations 49w→58wb ont un plan ET sont mergés
(`branch-tracking.md`). Sur `main` les iter-58wd (#794, primitives erreur/
chargement), 59w (#786, a11y OTP) et 59w-ImageLightbox sont déjà mergées →
**Next iteration = 60**. Le différé a11y « focus-trap des modales hand-rolled »
reste en cours via une PR parallèle (#802, `ConversationDrawer` +
`AgentTopicEditModal` + hook `useFocusTrap` ; encore étiquetée 59w côté branche,
à renuméroter au merge). Pour rester **orthogonal** (zéro fichier partagé), cette
itération attaque une surface distincte (dialogues d'image) et ne touche PAS
`useFocusTrap`.

## Étape 3 — Annotations
`branch-tracking.md` mis à jour : nouvelle entrée **60w** ; nouveau différé
documenté (cluster systémique `t() || 'fallback'`, ~259 occ./42 fichiers).
NE PLUS re-flagger
`avatar-crop-dialog.tsx` ni `conversation-image-upload-dialog.tsx` pour cet
anti-pattern (soldés ici).

## Étape 4 — Optimisation livrée

### Constat (bug réel, pas seulement Prisme)
Grep `t\(['"][^'"]+['"]\)\s*\|\|\s*['"]` → **259 occurrences sur 42 fichiers** de
l'anti-pattern `t('key') || 'texte de secours'`. C'est exactement le bug soldé
en 50w sur les `AudioEffects*` (`t('x') || 'En'`).

**Pourquoi c'est buggé** : `useI18n.t()` renvoie **la clé brute** (string
truthy) quand la traduction n'est pas encore chargée OU absente
(`return fallback || key`). Donc `t('key') || 'Recadrer…'` :
- ne tombe **jamais** sur le secours `|| 'Recadrer…'` (la clé brute est truthy) ;
- pendant le flash de chargement, l'utilisateur voit **`profile.cropAvatar.zoom`**
  (clé brute) dans **toutes** les langues, au lieu d'un libellé lisible.

De plus, le secours figé est en **français** → rupture Prisme s'il s'affichait.

### Correctif (signature de secours native)
Remplacement `t('key') || 'French'` → **`t('key', 'English')`** : la signature à
2 args de `useI18n` traite le 2ᵉ argument string comme **fallback natif**.
Résultat : pendant le load → secours **anglais** lisible (anti-flash, leçon 50w,
`fallbackLocale = 'en'`) ; une fois chargé → traduction correcte ×4 locales.

Cible **bornée** = les deux dialogues jumeaux de recadrage/upload d'image
(workflow identique `react-easy-crop`, surfaces user-facing) :
1. `components/settings/avatar-crop-dialog.tsx` — 8 chaînes (`settings`
   namespace, prefix `profile.cropAvatar.*`).
2. `components/conversations/conversation-image-upload-dialog.tsx` — 15 chaînes
   (`conversations` namespace, prefix `conversationImage.*`).

### Découverte d'épuration / zéro churn locale
Les **23 clés existent déjà** dans `settings.json` + `conversations.json` ×4
locales (en/fr/es/pt) → **aucun fichier locale touché**. Les secours anglais
posés en 2ᵉ arg sont **copiés mot pour mot des valeurs `en/*.json`** (cohérence
parfaite du flash anti-load). Diff = 2 fichiers composant, 0 locale.

### Décisions / hors périmètre
- Les 40 autres fichiers porteurs du même anti-pattern (~236 occurrences) →
  **nouveau différé borné** consigné, à traiter par petits lots cohérents
  (50w/57w-style), sans tout faire d'un coup (collision agents + revue).
- Commentaires FR internes (`// Réinitialiser l'état…`) **non touchés** :
  non user-facing, hors périmètre Prisme.
- Aucune dépendance sur le hook `useFocusTrap` (modifié par #802) → orthogonal.

## Faux positifs / NE PLUS re-flagger
- `avatar-crop-dialog.tsx` / `conversation-image-upload-dialog.tsx` :
  anti-pattern `t() || 'fb'` soldé → ne plus signaler ces 2 dialogues.

## Statut
✅ Implémenté — itération **60we**. Diff minimal (2 fichiers composant, 0 locale).
node_modules absent dans le container routine → typecheck/build délégués au CI
(comme 58wb/59w). Correctif purement local (signature `t`), aucune nouvelle clé.
