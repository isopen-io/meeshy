# UI/UX Analysis — Iteration 53wb (2026-06-22)

## Scope
**Web exclusivement** (suffixe `w`). Base : `main` HEAD `8e9c95e` (post-merge iter-52w #765 +
iter-53w #766). Itération dédiée à l'**i18n de la page reel deep-link `/reel/[postId]`** —
surface utilisateur (non-admin) repérée par revue fraîche.

## Numérotation : 53wb (double collision parallèle)
Deux agents routine concurrents ont livré avant cette branche :
- **52w** (`practical-fermat-whger0`, #765) : `getTypeLabel` ranking → `ranking.conversationType.*`.
  Ma 52w initiale (même périmètre) était **redondante** → convergée/abandonnée, repivot.
- **53w** (`practical-fermat-isk47b`, #766) : i18n+a11y de la **liste de conversations v2**
  (`components/v2/ConversationItem.tsx`).

Mon travail (page reel) est de **périmètre disjoint** des deux (fichiers entièrement différents) —
ce n'est PAS un doublon de code. Seuls le numéro `53w` et les noms de fichiers docs entraient en
collision → renumérotée **53wb** (précédent : `49wb`). Les docs `53w` (v2 conv list) sont
conservées telles quelles ; celle-ci est additive.

## Anti-repetition check (étapes 1–3 de la routine)
- **Doublons analyses** : aucun. Le finding ci-dessous (page reel `/reel/[postId]`) n'apparaît
  dans **aucune** analyse antérieure (1→53w). La 53w parallèle a couvert `ConversationItem.tsx`,
  pas la page reel.
- **Complétude** : findings web 40→53w possèdent plan + annotation. 50w (audio/media/v2), 52w
  (#765 ranking), 53w (#766 v2 conv list) — NON ré-audités.
- **Faux positif écarté** : différé « `getTypeLabel` **local** invitations » = en réalité **déjà
  i18n** (`t('invitations.typeFriend/Community/Conversation')`) — pas un finding.
- **Exclusions intentionnelles respectées** : video-calls/audio (50w), GhostBadge/PostCard/
  PrintButton/AudioControls (50w), `/v2` ThemeProvider, `hooks/useI18n.ts` re-export.

## Web Findings

### High (i18n — Prisme UI) : `app/reel/[postId]/page.tsx` — 10 chaînes FR dures user-facing
La page de **deep-link reel** (`/reel/:id`, partagée publiquement) affichait **10 chaînes
françaises en dur** à TOUS les utilisateurs quelle que soit leur langue d'interface — rupture
nette du Prisme côté UI sur une surface d'**entrée** (un destinataire ES/EN/PT d'un lien reel
voit des erreurs/feedback en français) :
- **Toasts** : `'Lien copié !'` (l.110), `'Impossible de copier le lien'` (l.112).
- **Loading** (`sr-only`, lecteurs d'écran) : `'Chargement du reel…'` (l.148).
- **Titres d'état** : `'Reel indisponible'` / `'Ce contenu n’est pas un reel'` / `'Ce reel n’existe plus'` (l.153).
- **Corps d'état** : `'Ce reel est privé ou a été supprimé.'` / `'Le lien pointe vers une publication, pas vers un reel.'` / `'Le reel que vous cherchez est introuvable.'` (l.156-160).
- **Bouton** : `'Retour au fil'` (l.166).

**Contexte** : aucun namespace `reel`/`feed` n'existait dans `locales/` (la surface feed/reel
n'est pas encore internationalisée ; `ReelPlayer` lui-même n'a aucun `t()`). La page est déjà
un composant `'use client'`.

**Correction** : nouveau namespace dédié `reel.json` (×4 locales fr/en/es/pt, 10 clés à parité) +
`useI18n('reel')` câblé dans la page. Fallbacks anglais passés en 2e argument
(`t('key', 'English…')`) pour éviter le flash de clé brute pendant le chargement async du
namespace (leçon iter-50w : `t()` renvoie la clé pendant le load sans 2e arg).

### Vérifiés conformes (pas des violations) — NON retouchés
- Spinner `aria-hidden="true"` + libellé `sr-only` : pattern a11y correct (l.147-148), seul le
  texte était FR → corrigé.
- `close()` (back gesture) : `router.back()` si historique, sinon `/feed/posts` — geste « back »
  natif respecté, non modifié.
- `ReelPlayer` (composant enfant) : large surface média sans i18n — hors périmètre de ce lot
  borné, ajouté au carry-over pour une passe dédiée.

## Pré-existant repéré (HORS périmètre — à signaler)
**CI `Test web` rouge sur `main`** : 2 suites échouent à la résolution de modules NON déclarés
dans `package.json` — `__tests__/components/auth/account-recovery-modal.test.tsx`
(`@radix-ui/react-visually-hidden`) et `__tests__/lib/encryption/adapters/browser-signal-stores.test.ts`
(`@signalapp/libsignal-client`). Introduites par `42a6b60` (déjà dans `main`), **indépendantes**
de ce diff (mon `git diff origin/main...HEAD -- __tests__/` est vide). À corriger isolément
(ajout deps ou skip mocks). Le job `Test web` n'est pas bloquant pour le merge (cf. #765/#766
mergées dans le même état rouge).

## Clés locales ajoutées (×4 : fr/en/es/pt) — nouveau namespace `reel`
`reel.json` → `linkCopied`, `linkCopyError`, `loading`, `unavailableTitle`, `notAReelTitle`,
`goneTitle`, `unavailableBody`, `notAReelBody`, `goneBody`, `backToFeed` (10 clés, parité vérifiée).

## Parité plateformes
Libellés d'UI/erreur (pas du contenu utilisateur Prisme) → `resolveUserLanguage` ne s'applique
pas. iOS/Android gèrent leurs propres affordances reel. Aucun impact sur la résolution de langue.

## Validation
- 4 `reel.json` valides (`json.load`), **parité des 10 clés** confirmée fr/en/es/pt.
- Namespaces chargés par **import dynamique** (`hooks/use-i18n.ts:75`
  `import('@/locales/${locale}/${ns}.json')`) → aucune inscription dans `locales/*/index.ts`
  requise (barrel non importé, déjà incomplet — laissé tel quel).
- Aucune chaîne FR résiduelle dans `page.tsx` (grep ⇒ 0). Aucun test n'importe la page reel.
- `t` ajouté aux deps du `useCallback` `onShare` (cohérence hooks).

## Différés (54+) — maintenus dans branch-tracking.md
- `ReelPlayer` (composant feed) + surface feed globale : non internationalisés — passe dédiée.
- **Pré-existant CI** : 2 suites web cassées sur deps manquantes (cf. ci-dessus) — à corriger isolément.
- retrait `next-themes` orphelin ; consolidation notifications/preferences ; réactions par pièce
  jointe ; deep links `/v2/chats?id=` ; swipe-back mobile web ; audit dark admin (reste) ; audit
  qualité es/pt ; console.error FR (logs dev).
- **NOUVEAU (revue fraîche 53wb)** : fallbacks FR durs de Suspense — `app/groups/page.tsx:12`,
  `app/groups/[identifier]/page.tsx:18` ; `app/auth/verify-phone/page.tsx:478` +
  `verify-email/page.tsx:353` (`Chargement…`). Lot i18n borné pour une prochaine itération.

## ✅ Status : itération soldée — corrections implémentées, voir plan 2026-06-22-plan-iteration-53wb
NE PAS retraiter : page `/reel/[postId]` (10 chaînes FR → namespace `reel` ×4). Différé
« `getTypeLabel` local invitations » = faux positif (déjà i18n).
