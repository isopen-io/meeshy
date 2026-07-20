# Analyse UI/UX — Itération 60wd (web only)

## Contexte de la routine
- Déclenchée par la fermeture (merge) de la **PR #799** (iter-59w ImageLightbox).
- **Tempête de collisions absorbée** (agents parallèles, même run) : `60w` #806
  (config-modal), `60wb` #808 (anti-pattern `t()||fallback` auth), `60wc` #804
  (aria `AttachmentPreviewReply`). Ma surface (cluster **admin/agent**) est
  **disjointe** des trois → renumérotée **60wd**.
- Revue analyses + plans : feed/reels (53w), modales (58w/#792/#796/#779), rouge
  erreur (56wb), ImageLightbox/OTP (59w), config-modal/auth/attachment-aria (60w→60wc)
  **tous soldés**. Aucun doublon web restant pour ma surface. iOS/Android hors périmètre.

## Cible 60wd — cluster **admin / agent** (surfaces live non internationalisées)
`components/admin/agent/` : 3 composants importent (ou peuvent importer)
`useI18n('admin')` mais affichent **22 chaînes FR figées** rendues en TOUTES langues
(rupture Prisme + a11y).

- **`AgentConversationsTab.tsx`** : confirm suppression, titre `Configurations Agent`
  + compteur `{count}`, placeholder `Rechercher...`, bouton `Configurer`, état vide,
  tooltips `Voir les messages agent`/`Planificateur de triggers`, 8 en-têtes colonnes
  (`Statut`/`Contrôlés`/`Confiance`/`Dernière rép.` + homogénéisation).
- **`ConversationPicker.tsx`** (`t` ajouté au destructuring) : placeholder recherche,
  `Recherche dans les salons...`, `Sans titre` ×2, état vide `{term}`, aide min-2-car.
- **`AgentRolesSection.tsx`** : état vide, `originLabel` (`Observé`/`Archétype`/`Hybride`),
  badge `Verrouillé`, bouton `Unlock`→`Déverrouiller` (incohérence corrigée),
  `{count} msg analysés`, `Confiance`, placeholder `Assigner un archétype...`.

## Correctif livré
- **40 clés ×4 locales** (`en/fr/es/pt`) sous `admin.agent.{conversationsTab,
  conversationPicker,rolesSection}.*` (+ `columns.*`/`origin.*`), diff strictement
  additif (round-trip JSON byte-identique ; parité 268 clés `agent` ×4).
- Fallbacks EN 2e arg (leçon 50w — même signature native que le fix 60wb/#808) ;
  interpolation `{count}`/`{term}` via params object.
- `Unlock` EN dur → `rolesSection.unlock`.

## Vérifications
- Grep FR résiduel sur les 3 fichiers → 0 (hors séparateur `•`).
- JSON valide ×4 ; parité 40 clés ; aucun test n'importe ces composants.
- CI #811 verte : Test web ✅, Quality bun ✅, Build bun ✅, + toutes suites.

## Annotation — NE PLUS re-flagger
- `AgentConversationsTab.tsx`, `ConversationPicker.tsx`, `AgentRolesSection.tsx` :
  i18n complet sous `admin.agent.{conversationsTab,conversationPicker,rolesSection}.*`.
- `ConversationPicker` défaut prop EN `placeholder="Search a conversation..."` =
  surchargé par appelants, non visible — laissé tel quel.

## Différé (61w+)
- Anti-pattern `t()||fallback` restant (~270 occ / ~48 fichiers hors auth) → lots bornés.
- `Badge` v2 variants off-palette → arbitrage `theme.colors.*` vs `gp-*` (56wb).
- Épuration `_archived/` ; console.error FR ; `next-themes` orphelin ;
  `app/settings/loading.tsx` (i18n server-side).
