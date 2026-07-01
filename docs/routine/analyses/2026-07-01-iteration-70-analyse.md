# Iteration 70 — Analyse d'optimisation (2026-07-01)

## Protocole renforcé v2 (démarrage) — RÉGRESSION BUILD détectée & corrigée
Au démarrage, la vérification élargie a révélé une **régression build sur `main`** consécutive à une
collision inter-agents sur le lot iter 68 (F30-d). (Iter 69 est occupé par un agent parallèle — lot
ObjectId MongoDB, disjoint ; ce lot est donc numéroté **70**.)

### Diagnostic
Deux agents parallèles (`claude/sharp-wozniak-0fc6ol` = nous, `claude/sharp-wozniak-40x133`) ont livré le
**même** F30-d sur les **mêmes 2 fichiers**, chacun ajoutant `import { copyToClipboard } from '@/lib/clipboard'`
sur une **ligne différente**. Le merge Git, ne voyant **aucun conflit textuel** (ajouts sur lignes
distinctes), a **cumulé les deux imports** → doublon :

- `components/conversations/header/use-header-actions.ts` : import en L3 **et** L6.
- `components/conversations/conversation-item/ConversationItem.tsx` : import en L8 **et** L13.

`tsc` : **4× `TS2300 Duplicate identifier 'copyToClipboard'`** (2 par fichier). **Build cassé sur `main`.**
Chaque PR passait le CI **isolément** (l'import n'était présent qu'une fois dans chaque branche) ; le
doublon n'apparaît qu'**après le merge des deux** — angle mort classique du CI par-PR.

### Correction (iter 70)
1. Suppression du **second** `import { copyToClipboard }` dans chacun des 2 fichiers (garde la 1re occurrence).
2. Consolidation des docs `iteration-68` (analyse + plan), eux aussi **concaténés** par le même merge parallèle.

### Garanties
- `tsc` (apps/web) : **909 → 905** erreurs, diff = **exactement les 4 `TS2300` retirées, 0 ajoutée** →
  retour à la baseline propre `main` (905 erreurs pré-existantes hors périmètre).
- `jest` header + conversation-item : **27/27** verts.
- Recensement : **aucun autre doublon** `copyToClipboard` sur l'app. F30-a/b/c/d bien convergés sur `main`.

## Leçon PROC renforcée (protocole v3)
Sur un domaine à **fort parallélisme** (F30 : ~40 PR concurrentes), le merge Git peut **cumuler deux
ajouts identiques** (même import, lignes différentes) **sans conflit** → régression invisible au CI par-PR.
**Ajout au protocole de démarrage** : après `git checkout origin/main`, exécuter `tsc --noEmit` (ou au
minimum `grep -c` des imports des sources uniques récemment adoptées) pour détecter les **doublons
d'import** avant de choisir un nouveau lot. Un lot « propre » commence par un `main` qui compile.

## Consignés pour itérations futures

| # | Constat | Impact |
|---|---------|--------|
| F30 (reste) | ~8 sites : Header ×4 (landing, fire-and-forget), TwoFactorSettings, use-message-interactions, share-affiliate-modal, admin/{share,tracking}-links, tracking-links.ts, share-utils.ts | MOYEN |
| F31 | `truncateText` dupliqué (`truncate.ts` vs `xss-protection.ts`) | FAIBLE-MOYEN |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut — flip = validation staging requise (non autonome) | HAUT (~75 % BP) |
| PROC | Collisions inter-agents fréquentes sur F30 — préférer les clusters « exotiques » peu ciblés + détecter les doublons d'import post-merge | PROCESS |

## Gain
Build `main` **restauré** (0 `TS2300`). Docs iter-68 consolidés. Protocole de démarrage renforcé v3
(détection des doublons d'import post-merge). Aucune perte de la convergence F30 déjà acquise.
