# Plan — Itération 60w (web) : i18n config-modal

## Base
- `main` HEAD `287ca0b` (post-59w : OTP #786 / ImageLightbox #799 / focus-trap
  #796 / inert #779).
- Branche : `claude/practical-fermat-rzocwo` (resynchronisée sur main après
  fermeture du doublon #802).

## Contexte — repivot
La 59w focus-trap préparée sur cette branche (#802) s'est révélée doublon strict
de #796 déjà mergé → #802 fermée. Repivot sur la surface orthogonale
recommandée par le tracking : `components/settings/config-modal.tsx`.

## Objectif
i18n des 9 chaînes FR figées (affichées en TOUTES langues — rupture Prisme) du
modal de configuration global :
- 6 libellés d'onglets visibles, 1 titre, 2 surfaces a11y (`sr-only` + `aria-label`).

## Étapes
1. [x] Bloc `settings.configModal` (9 clés) ×4 locales (en/fr/es/pt), inséré
   additivement après `"settings": {` (round-trip JSON, parité vérifiée).
2. [x] `config-modal.tsx` : `useI18n('settings')` ; remplacer les 9 littéraux par
   `t('configModal.*', '<EN fallback>')` (leçon 50w).
3. [x] Vérif : JSON valide ×4 ; parité 9 clés ; grep FR résiduel = 0.
4. [x] Annoter analyse 60w + `branch-tracking.md` (doublon #802, config-modal soldé).
5. [ ] Commit + push ; PR vers `main` ; merge après CI vert ; supprimer la branche.

## Décisions
- **Bloc dédié `configModal`** plutôt que réutiliser `settings.tabs.*` : le wording
  du modal (`Profil utilisateur`/`Langues & Traduction`/`Apparence`) diffère des
  libellés génériques courts existants — réutiliser changerait l'UX (hors périmètre).
- Fallbacks EN en 2e arg (anti-flash). Namespace `settings` déjà standard (37 usages).
- Aucune autre frontend (iOS/Android hors périmètre).

## Suite (61w+)
- `PhoneResetFlow.tsx:490` `sr-only` `Indicatif pays`.
- `AttachmentPreviewReply.tsx:205-206` title/aria FR.
- Épuration `components/settings/_archived/` (font-selector mort) si confirmé inutile.
- `Badge` v2 success/warning/gold off-palette — arbitrage `theme.colors.*` vs `gp-*`.
