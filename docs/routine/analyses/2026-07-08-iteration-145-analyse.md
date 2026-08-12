# Iteration 145 — Analyse d'optimisation (2026-07-08)

## Protocole (démarrage)
`main` @ `dae3540` (dernier merge, PR #1721 iter 144 — deux bugs de fonctions pures web/gateway).
Branche `claude/brave-archimedes-i50cla` recréée depuis `origin/main`. PRs ouvertes au démarrage :
#1717 (iOS video bubble), #1719 (gateway RedisDeliveryQueue LREM), #1720/#1722 (Android) — toutes
humaines / autres sessions, hors périmètre autonome. Ce cycle prend **145**.

Fan-out : deux agents Explore parallèles sur (a) `services/gateway/src` (helpers/services purs), (b)
`packages/shared/utils` + `packages/shared/types` + `apps/web/{utils,hooks}`. Consigne : **un** bug de
logique pure, haute confiance, **actuellement utilisé en production**, non couvert par les tests.

### Constat structurant — la surface *pure-helper* est épuisée
Les DEUX agents ont convergé (indépendamment, et confirmé par revue manuelle directe d'une trentaine de
fichiers) : la couche des utilitaires purs `packages/shared/utils` + `apps/web/utils` est **pristine**
après 144 itérations. Les seuls défauts de fonction pure clairement démontrables restants sont du **code
mort** :

- `apps/web/utils/translation-cleaner.ts:42` — `deepCleanTranslationOutput` scinde les URLs/domaines
  (`meeshy.me` → `meeshy. me`) via la règle « espace après ponctuation ». **Réel mais mort** :
  `deepCleanTranslationOutput` *et* `cleanTranslationOutput` ne sont importés nulle part (grep :
  uniquement docs + le fichier lui-même).
- `services/gateway/src/services/TranslationCache.ts:151` — `findSimilarTranslations` compare le texte
  **source** de la requête contre `entry.translatedText` (la sortie en langue **cible**) → similarité
  Jaccard toujours ≈ 0. **Réel mais mort** : ce fichier n'est importé QUE par son propre test ; la
  production utilise `message-translation/TranslationCache.ts` (classe distincte, `generateKey` statique
  + LRU). L'entrée de cache ne stocke même pas le texte source, donc une correction « propre »
  exigerait un changement de schéma pour zéro impact.

Le corriger n'améliorerait pas le produit (dead code). La cible retenue est le **seul défaut de
correction vivant** remonté : une divergence incrémental/recompute dans les stats de conversation.

---

## Cible : F113 — `ConversationMessageStatsService.isTextMessageStat` diverge de l'`recompute()` autoritaire sur les messages texte à contenu vide

### Current state
`services/gateway/src/services/ConversationMessageStatsService.ts`. Le service maintient
`ConversationMessageStats.textMessages` (exposé en `contentTypes.text` dans les stats de conversation)
par **deux chemins** censés produire le même compteur :

- **Chemin incrémental** — `onNewMessage` (l.150, `+1`) et `onMessageDeleted` (l.282, `-1`) via le
  prédicat `isTextMessageStat(attachmentTypes, content, messageType)`.
- **Chemin autoritaire** — `recompute()` (l.421), recalcul complet périodique qui « corrige » toute
  dérive des compteurs, règle : `msgType === 'text' && msg.attachments.length === 0`.

Le commentaire de `isTextMessageStat` (l.35-39) **documente explicitement l'invariant** : « This mirrors
the authoritative recompute() (`msgType === 'text' && attachments.length === 0`); the incremental path
MUST use the same rule. » Or l'implémentation ajoutait une 3e condition absente de `recompute` :

```ts
const hasTextContent = !!(content && content.trim().length > 0);
return attachmentTypes.length === 0 && hasTextContent && (messageType || 'text') === 'text';
```

### Problems identified
`hasTextContent` **casse l'invariant documenté**. Un message `messageType: 'text'`, **sans pièce
jointe**, dont le contenu est vide ou blanc (`''` ou `' '`) :

- `recompute()` le **compte** (`'text' && attachments === 0`).
- le chemin incrémental **ne le compte pas** (`hasTextContent` faux).

`contentTypes.text` **sous-compte** donc en temps réel, puis **saute** à la hausse au prochain
`recompute()` périodique — une incohérence visible dans les stats de conversation (analytics).

### Root causes
Un message texte à contenu blanc **est persistable** : le schéma gateway du contenu est
`z.string().min(1)` (`CommonSchemas.messageContent`), donc `' '` (un espace, longueur 1) passe la
validation et est stocké en `messageType: 'text'` sans pièce jointe. Le garde `hasTextContent` a été
ajouté au seul chemin incrémental — pas à `recompute` — introduisant la dérive. Les deux chemins
incrémentaux (`onNewMessage`/`onMessageDeleted`) partageant le même prédicat restaient cohérents *entre
eux* (ajout+suppression d'un message blanc → net 0), ce qui masquait le bug jusqu'à la comparaison avec
`recompute`.

### Business impact
Modéré. `contentTypes.text` est affiché dans les statistiques de conversation. Sa dérive (baisse
incrémentale puis saut au recompute) donne des chiffres incohérents d'un rafraîchissement à l'autre —
perte de confiance dans l'analytics. Fréquence faible (messages à contenu blanc), mais réel et
reproductible.

### Technical impact
Violation de l'invariant que le code documente lui-même (« MUST use the same rule »). Deux définitions
concurrentes d'un même compteur → dérive corrigée seulement au recompute périodique.

### Risk assessment
Très faible. Fonction pure, retrait d'une condition (et du paramètre `content` devenu inutile), 2 sites
d'appel mis à jour. Aucun test existant n'assertait l'ancien comportement (tous passent un contenu non
vide pour les messages texte).

### Proposed improvement
Aligner `isTextMessageStat` **exactement** sur `recompute` en supprimant `hasTextContent` (l'émptiness du
contenu n'est délibérément PAS un critère, comme dans `recompute`) et le paramètre `content` désormais
inutilisé :

```ts
function isTextMessageStat(attachmentTypes: string[], messageType?: string): boolean {
  return attachmentTypes.length === 0 && (messageType || 'text') === 'text';
}
```

`recompute` est nommé autoritaire (recalcule et corrige) ; c'est donc le chemin incrémental qui doit s'y
conformer — jamais l'inverse. Commentaire mis à jour pour expliciter que l'émptiness n'est pas gardée.

### Expected benefits
`contentTypes.text` cohérent entre temps réel et recompute — plus de dérive/saut. Un message texte blanc
est compté identiquement partout. Invariant documenté rétabli (SSOT du compteur = `recompute`).

### Validation criteria
- `onNewMessage(..., ' ', [], 'en', 'text')` → `textMessages: { increment: 1 }` (RED avant → `undefined`).
- `onNewMessage(..., '', [], 'en', 'text')` → `{ increment: 1 }` (RED avant → `undefined`).
- `onMessageDeleted(..., ' ', [], 'text')` → `{ decrement: 1 }` (RED avant → `undefined`).
- Cas existants inchangés (non-texte + caption → non compté ; attachments → non compté ; location →
  locationCount ; texte non vide → compté).

### Complexity / Risk
Très faible. Fonction pure, une condition retirée, un paramètre supprimé, +4 tests (3 RED-avant).

---

## Vérification
- `services/gateway` : `jest src/__tests__/unit/services/ConversationMessageStatsService.test.ts`
  → **71/71** (67 → 71, +4 dont 3 RED confirmés en revert de la source de prod).
- RED confirmé : contre la source pré-fix, les 3 nouveaux tests blanc/vide échouent
  (`Received: undefined`).
- `tsc --noEmit` : seule erreur = `Cannot find module '@meeshy/shared/prisma/client'`
  (pré-existante — client Prisma non généré dans cet environnement ; le jest config stub ce module, d'où
  les tests verts). Non liée au diff (aucun import touché).
