# Iteration 107 — Analyse d'optimisation (2026-07-05)

## Protocole (démarrage)
`main` @ `73f5201` (« feat(android): optimistic + offline profile edit incl. content languages (§K) — #1500 »),
working tree propre. Branche de travail `claude/brave-archimedes-fru31a` recréée depuis `origin/main`
(`git checkout -B … origin/main`), 0 commit non-mergé à préserver.

**8 PR ouvertes au démarrage** (#1497–#1505, toutes issues de sessions parallèles, chacune disjointe) :
gateway socketio auth-race (#1505), Android theme-mode (#1504), shared email-validator F73 (#1503),
calls GC push + iOS dead-code (#1502), gateway ReactionService (#1501), gateway normalize F72 (#1499),
calls GC streak + web toast (#1498), community-preferences F71 (#1497). La cible retenue ici
(`services/gateway/src/utils/url-content.ts`) est **disjointe** de toutes ces PR — aucune ne touche le
pipeline de détection « URL-only » ni les fichiers modifiés. Laissées à leurs sessions.

### Revue d'ingénierie (constat de démarrage)
Balayage ciblé (agent d'exploration) des helpers **purs** de `packages/shared/utils/`, `apps/web/utils/`,
`apps/web/lib/` et `services/gateway/src/utils/` (hors zones déjà traitées itérations 100-106 et hors
fichiers des 8 PR ouvertes). Trois candidats remontés, classés par (impact réel × certitude) :

1. **F76 — `isUrlOnly` absorbe le texte non-latin collé à une URL → traduction sautée** — RETENU
   (impact réel, appelants live dans le pipeline de traduction messages **et** posts, classe
   Unicode/locale, cœur produit multilingue).
2. **F77 — `CircuitBreaker` ignore son propre `failureWindowMs`** (`utils/circuitBreaker.ts`) — écarté
   ce cycle : ambiguïté d'intention (comptage « échecs consécutifs » vs « fenêtre glissante » — le
   compteur se remet à zéro sur tout succès, réduisant le rayon d'impact). Reporté (§ futur), à traiter
   avec une décision produit sur la sémantique voulue.
3. **F78 — `buildAttachmentUrl` (`apps/web/utils/attachment-url.ts`) ne corrige que l'hôte exact
   `meeshy.me`** (pas `www.meeshy.me`) et reconstruit depuis `pathname` seul (drop query/hash) —
   écarté ce cycle : dépend de l'existence effective d'URLs `www.`/porteuses de query en production
   (incertain). Reporté (§ futur).

## Cible : F76 — `isUrlOnly` classe « URL-only » un contenu texte+URL sans séparateur d'espace (CJK/Thaï)

### Current state
`services/gateway/src/utils/url-content.ts` expose `isUrlOnly(text)` — **source unique** de la décision
« ce contenu ne porte aucun texte traduisible, sauter la traduction (préserver les liens verbatim ;
NLLB corromprait une URL) ». Implémentation d'origine :
```ts
const URL_TOKEN_REGEX = /https?:\/\/\S+/g;
export function isUrlOnly(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  return trimmed.replace(URL_TOKEN_REGEX, '').trim().length === 0;
}
```
Consommée par :
- `services/gateway/src/services/message-translation/MessageTranslationService.ts:210`
  (`if (messageData.content && isUrlOnly(messageData.content)) { …skip translation… }`) ;
- `services/gateway/src/services/posts/PostTranslationService.ts:71,119,162` (3 appels — traduction des
  posts sociaux).

### Problems identified
- **[LIVE] Traduction silencieusement sautée** pour tout contenu où du texte est **collé** à une URL
  sans espace séparateur. `\S+` (« un ou plusieurs non-blancs ») est **glouton** et engloutit les
  caractères CJK/Thaï (qui sont des non-blancs) placés immédiatement après l'URL. Reproduit :
  `isUrlOnly('https://example.com你好世界')` → `\S+` matche `example.com你好世界` → chaîne résiduelle
  vide → **`true`** (faux : « 你好世界 » = « bonjour le monde » est traduisible). Idem
  `'你好世界https://example.com'` (texte avant), `'https://example.comสวัสดี'` (thaï).
- Sur les langues **sans espace inter-mots** (chinois, japonais, thaï), coller une URL au texte est un
  usage **naturel** — précisément la population cible d'un produit de messagerie multilingue.

### Root cause
`\S+` borne le token URL sur la **prochaine espace**, pas sur le **jeu de caractères légaux d'une URL**.
Un caractère hors RFC 3986 (CJK, Thaï, emoji…) devrait terminer le token ; `\S+` ne le sait pas et
continue de consommer jusqu'à la prochaine espace, avalant le texte adjacent.

### Business impact
Régression de traduction **invisible** sur le cœur de la proposition de valeur Meeshy (« traduction
multi-langue simultanée », Prisme Linguistique). Un locuteur chinois/japonais/thaï qui partage un lien
suivi d'un commentaire collé voit son commentaire **jamais traduit** pour ses destinataires — le contenu
apparaît dans la langue originale, violant le principe de transparence du Prisme (« le contenu traduit
s'affiche comme du contenu natif »). Touche messages **et** posts sociaux.

### Technical impact
Correction purement locale au fichier SSOT : borner `URL_TOKEN_REGEX` au jeu de caractères URL-légaux
(RFC 3986 : unreserved `A-Za-z0-9-._~` + reserved gen/sub-delims `:/?#[]@!$&'()*+,;=` + percent `%`).
Le texte non-URL adjacent survit alors au `replace` et le `trim().length` post-strip le détecte.
`MessageTranslationService` et `PostTranslationService` héritent automatiquement du correctif. Aucun
changement de signature, d'import ou de contrat.

### Risk assessment
Très faible. Comportement **identique** sur tous les cas de test existants (URL bare, multi-URL avec
espaces, texte+URL séparés par espace, texte pur, vide, schémas non-HTTP) — prouvé : les 6 tests
existants restent verts. **Corrigé** sur le cas collé-non-latin. Fonction pure, sans effet de bord.
Effet de bord bénin acceptable : un contenu « URL + emoji collé » (`https://x.com🎉`) devient
`false` (→ traduction lancée) au lieu de `true` — inoffensif car le pipeline mixte masque/restaure les
URLs (docstring du module), et un emoji seul traverse NLLB sans corruption ; mieux vaut traduire par
excès que sauter par erreur.

### Proposed improvements (implémenté ce cycle)
- `URL_TOKEN_REGEX = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/g` (token borné aux caractères
  URL-légaux ASCII).
- Commentaire expliquant le *pourquoi* (glouton `\S+` vs frontière RFC 3986).

### Expected benefits
- Messages/posts CJK/Thaï avec texte collé à une URL sont **de nouveau traduits** — restaure le Prisme
  Linguistique pour cette population.
- Aucun coût : même nombre d'opérations (un `replace` + `trim`), regex marginalement plus longue.

### Implementation complexity
Très faible (1 constante regex + commentaire ; 3 assertions de non-régression + 3 cas Unicode neufs).
Aucun changement de signature/contrat.

### Validation criteria
- [x] RED prouvé d'abord (repro Node, impl copiée verbatim) : `isUrlOnly('https://example.com你好世界')`
      → `true` (bug).
- [x] GREEN Node (fix + non-régression sur 13 cas : 8 existants + 5 Unicode) : toutes vertes.
- [x] GREEN jest : `url-content.test.ts` **9/9** (6 existants + 3 nouveaux blocs : CJK collé texte
      avant/après, Thaï collé, non-régression URL bare + comma-joined). `bun run test:unit`.

## Candidats écartés ce cycle (documentés)
- **F77 — `CircuitBreaker.failureWindowMs` inutilisé** (`services/gateway/src/utils/circuitBreaker.ts`) :
  le champ est documenté « fenêtre de comptage des échecs » et fixé par toutes les factories
  (`createSocketIOBreaker`/`createRedisBreaker`/`createDatabaseBreaker`) mais **jamais référencé** dans
  la logique ; `failureCount` ne se réinitialise que sur succès/transition, pas par vieillissement
  temporel. Trois échecs isolés espacés de 20 min ouvriraient le circuit malgré l'absence de rafale
  dans la fenêtre. **Écarté** : ambiguïté d'intention (« échecs consécutifs » est une sémantique
  défendable) — nécessite une décision produit avant d'implémenter une fenêtre glissante.
- **F78 — `buildAttachmentUrl` hôte-spécifique + drop query** (`apps/web/utils/attachment-url.ts:54-60`) :
  la correction de domaine ne se déclenche que pour l'hôte exact `meeshy.me` (pas `www.meeshy.me`) et
  reconstruit depuis `url.pathname` seul, perdant query string/hash. **Écarté** : dépend de l'existence
  réelle d'URLs `www.`/porteuses de query en production (incertain) — impact conditionnel.

## Améliorations futures (report)
- **F51b** (LOW) : réécriture des docs `notifications/`.
- **F56b** (LOW) : `likeCount` absolu sur `post:reaction-added/removed`.
- **F60b** (LOW) : parité parsing mention iOS/Android sur `MENTION_HANDLE_CHARS` (tiret).
- **F67b** (LOW) : audit découpage jour-calendaire iOS.
- **F69** (LOW) : `sanitizeFileName` plafond 255 sur nom sans extension (latent, 0 appelant).
- **F70** (LOW) : `deepCleanTranslationOutput` apostrophes FR (code mort, 0 appelant).
- **F68b** (LOW) : contrepartie iOS des initiales (parité point-de-code).
- **F77** (MEDIUM, neuf) : `CircuitBreaker.failureWindowMs` inutilisé — nécessite décision sémantique.
- **F78** (LOW-MEDIUM, neuf) : `buildAttachmentUrl` hôte-spécifique + drop query — impact conditionnel.
