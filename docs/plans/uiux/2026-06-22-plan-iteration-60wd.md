# Plan — Itération 60wd (web only) : i18n du cluster admin/agent

## Base
- Branche `claude/practical-fermat-iuu5e3`, resynchronisée sur `main` HEAD `43cb822`
  (post-#806/#808/#804). Renumérotée 60w→60wb→60wc→**60wd** (tempête de collisions).

## Objectif
i18n des 3 composants `components/admin/agent/{AgentConversationsTab,
ConversationPicker,AgentRolesSection}.tsx` (22 chaînes FR figées) sous `admin`.

## Étapes
1. [x] 40 clés ×4 locales sous `agent` dans `admin.json` (additif, parité 268 ×4).
2. [x] 3 composants câblés `t()` (15 + 6 + 9 swaps ; `t` ajouté à ConversationPicker).
3. [x] Vérif : grep FR = 0 ; JSON ×4 ; aucun test impacté.
4. [x] Commit + push ; PR #811 ; CI verte.
5. [ ] Résoudre collisions docs (60wd) ; merger `main` ; supprimer la branche.

## Contraintes
- Fallbacks EN 2e arg (leçon 50w) ; interpolation via params object.
- Namespace `admin` réutilisé ; aucune autre frontend.

## Leçon (tempête de collisions)
4 agents web parallèles ont consommé 60w→60wc ce run. Règle : `git fetch` + check PR
ouvertes AVANT de coder ; surface orthogonale ; au merge, renuméroter au suffixe
lettre libre suivant et résoudre les `add/add` docs en renommant le sien (jamais
écraser l'autre) ; merger immédiatement après résolution.

## Différé (61w+)
Anti-pattern `t()||fallback` restant ; `Badge` off-palette ; épuration `_archived/` ;
console.error FR ; `next-themes` orphelin ; `app/settings/loading.tsx`.
