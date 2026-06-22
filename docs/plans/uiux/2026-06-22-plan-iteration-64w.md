# Plan de correction — Itération 64w (web)

**Cible** : `apps/web/components/conversations/ConversationSettingsModal.tsx`
**Classe de bug** : anti-pattern i18n `t('key') || 'fallback'` (flash-of-raw-keys + rupture Prisme)

## Étapes
- [x] Recenser les 28 occurrences `t(k) || 'FR'` dans le composant
- [x] Vérifier l'existence des clés ×4 locales sous `conversations.conversationDetails.*` / `conversationHeader.*`
- [x] Identifier les 5 clés présentes uniquement en FR (`activity`, `viewAllParticipants`, `mediaAndAppearance`, `changeBanner`, `uploadBanner`)
- [x] Transformer les 28 `t(k) || 'FR'` → `t(k, 'EN')` (secours = valeur EN exacte du locale)
- [x] Ajouter les 5 clés manquantes en `en` / `es` / `pt` (additif)
- [x] Valider parité JSON + round-trip des 4 locales
- [x] Vérifier que le test `ConversationSettingsModal.test.tsx` reste vert (mock `t` 1-arg)
- [ ] CI verte
- [ ] Merge dans `main`, MAJ `branch-tracking.md`, suppression de branche

## Garde-fous
- Surface orthogonale aux PR en vol #855–#860
- Pas de nouvel import, pas de nouveau namespace (`useI18n('conversations')` déjà présent)
- `Pro` / labels de marque non concernés
- Reste de l'anti-pattern (~37 fichiers) → lots bornés 65w+
