# Plan — Itération 61we (web)

## Contexte
Poursuite bornée de la classe de bug **anti-pattern i18n `t('key') || 'fallback'`**
(différé 60w/60wd). Surface orthogonale choisie : le **cluster bulle de message**
(`components/common/bubble-message/`), non couvert par les PR 61w en vol
(#835 conversation **header**, #814 image dialogs, #816/#818 lightboxes,
#837/#810 AttachmentPreviewReply).

## Pourquoi c'est un bug (rappel)
`use-i18n.ts` → `t()` retourne `fallback || key`. La forme `t('k') || 'x'` est donc :
1. **du code mort** — `t()` ne renvoie jamais une valeur falsy ;
2. **un flash-of-raw-keys** — pendant le chargement, `t()` renvoie la **clé brute**
   (`'k'`, truthy) → le `|| 'x'` ne s'affiche jamais. Correctif : passer le fallback
   en 2e argument `t('k', 'x')` (anglicisé sur la valeur EN exacte, leçon 50w).

## Cas particulier découvert (vrai bug visible)
`MessageContent.tsx` affichait `{t('bubble.forwarded') || 'Transféré'}` mais la clé
`bubble.forwarded` **n'existait dans AUCUN locale** → `t()` renvoyait la **chaîne
littérale `"bubble.forwarded"`** sur le badge « message transféré », en toutes langues
(le `|| 'Transféré'` étant mort). Correctif = ajout de la clé ×4 locales + fallback EN.

## Changements
1. **`MessageActionsBar.tsx`** — prop `t: (key: string) => string` → `t: TFunction`
   (type canonique, Single Source of Truth) ; 4 occurrences :
   - `t('messageActions.more', 'More options')` ×2 (aria-label + tooltip)
   - `t('copyLink', 'Copy link')`
   - `t('messageActions.messageInfo', 'Message info')`
2. **`MessageContent.tsx`** — prop `t` élargie à `TFunction` ;
   `t('bubble.forwarded', 'Forwarded')` + **ajout clé `bubble.forwarded`** ×4 locales.
3. **`DeleteConfirmationView.tsx`** — `t('emptyMessage', 'Empty message')`
   (utilise déjà le vrai `useI18n('deleteMessage')`).
4. **locales** `bubbleStream.json` ×4 — `bubble.forwarded`
   (en `Forwarded` / fr `Transféré` / es `Reenviado` / pt `Encaminhado`).

## Sécurité du changement de type
`TFunction` est un **sur-ensemble** de `(key) => string` (2e arg optionnel). L'unique
appelant `BubbleMessageNormalView.tsx` passe déjà `tBubble = useI18n('bubbleStream')`
(qui EST un `TFunction`). Aucun autre consommateur. Risque nul.

## Vérification
- Clés EN confirmées : `messageActions.more`=More options, `copyLink`=Copy link,
  `messageActions.messageInfo`=Message info, `emptyMessage`=Empty message.
- `bubble.forwarded` absente partout → ajoutée ×4 (diff strictement additif 3 lignes/fichier).
- `grep` anti-pattern dans le cluster = 0 (reste `version.model || 'basic'` = vrai
  fallback de donnée, hors périmètre).
- `tsc` non concluant en conteneur frais (node_modules absent) ; changements triviaux/type-safe.

## NE PLUS re-flagger
Les 6 occurrences `t()||fallback` de `MessageActionsBar`/`MessageContent`/`DeleteConfirmationView`
et la clé `bubbleStream.bubble.forwarded`.
