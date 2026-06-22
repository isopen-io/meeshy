# Plan d'itération 53w — i18n + a11y liste de conversations v2

**Date** : 2026-06-22 · **Périmètre** : Web only · **Base** : `main` HEAD `50350e3`

## Objectif
Solder les chaînes FR dures et l'a11y manquante de
`components/v2/ConversationItem.tsx` (liste de conversations v2) : libellés
d'actions swipe, aperçus de dernier message, indicateur de frappe, et
`aria-label` du bouton options.

## Étapes
- [x] Audit anti-doublon : confirmer qu'aucune passe 1→52 n'a couvert ce composant.
- [x] Choisir le foyer i18n : sous-namespace existant `conversations.v2chat`
      (déjà doté de `file`, `options`, `someoneTyping`).
- [x] Ajouter 13 clés `v2chat.{archive,delete,markRead,mute,unmute,pin,unpin,
      important,tag,call,photo,voiceMessage,typing}` × 4 locales.
- [x] Threader `useI18n('conversations')` + remplacer les 12 chaînes dures.
- [x] Ajouter `aria-label={t('v2chat.options')}` au bouton 3 points.
- [x] Corriger les typos FR au passage (`Desepingler` → accent ; `ecrit...` → accent).
- [x] Vérifier : `tsc` 0 erreur sur le composant ; JSON valide ; parité 13/13.
- [x] Docs (analyse + plan + branch-tracking).

## Fichiers touchés
- `apps/web/components/v2/ConversationItem.tsx`
- `apps/web/locales/{fr,en,es,pt}/conversations.json` (+13 lignes chacun)

## Hors périmètre (laissé en différé, repéré par l'explorer 53w pour 54w+)
- `components/v2/ReplyPreview.tsx` `CONTENT_TYPE_LABELS` (`📷 Photo` / `🎬 Vidéo` FR durs).
- `components/attachments/AttachmentDeleteDialog.tsx` (dialogue confirm FR dur, ~5 chaînes).
- `components/auth/PhoneExistsModal.tsx` (~8 chaînes FR dures + flow SMS).
- `components/v2/PostComposer.tsx` / `AudioPlayer.tsx` : `aria-label` statiques anglais non i18n.
- chantiers larges hérités : deep links `/v2/chats?id=`, swipe-back mobile,
  audit dark admin (reste) ; hors-périmètre : lockfile `next-themes`, mocks jest.

## Critère de succès
Liste de conversations v2 entièrement localisée (4 langues) + bouton options
accessible ; tests verts ; diff minimal.
