# Iteration 240 — Une réaction sans emoji fabriquait un DOUBLE espace qui partait verbatim vers tous les clients (`interpolate` de `notification-strings`)

## Protocole (démarrage)
`main` @ `72ef1676` (dernier commit : `feat(android/chat): AI participant persona
profiles + trait bars (parity iOS) (#3295)`). Branche `claude/brave-archimedes-otg9gq`
réalignée sur `origin/main` (0 avance / 0 retard) au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Setup parité : `bun install --ignore-scripts`
(3861 paquets — les devDeps `jest`/`ts-jest`/`vitest` manquaient d'un install
partiel antérieur, réinstallés ici), puis `npx prisma generate --generator client`
+ `bun run build` dans `packages/shared`. **Deux runners validés** : `vitest`
(shared) et `jest` (gateway).

**Audit anti-doublon** (24 PRs ouvertes au départ, dont ~10 sur `packages/shared`).
Les PRs shared touchent `normalizeLanguageForDedup` (#3280), `resolveRiverLaneAt`
(#3270), `formatTimeRemaining` (#3259), `formatFileSize` (#3275), `chunk` (#3253),
`removingHandle` (#3262), `SignalSchemas.iv` (#3266), primitives de rôle (#3249).
**Aucune PR ouverte ne touche `packages/shared/utils/notification-strings.ts`** —
zéro chevauchement de fichier. Le balayage « présence brute » (cycles 81–84) est
clos ; le gateway (services/handlers) a été ré-audité en profondeur par un agent
dédié et n'a rendu que des candidats faible-confiance et test-pinnés — écartés.

## Sélection : **Priorité 1 — défaut de sortie i18n à large rayon d'impact sur une source unique**

`notification-strings.ts` est la source UNIQUE des titres/sous-titres de
notification, localisés en 8 langues, consommée par le gateway
(`NotificationService.buildNotificationDisplay`, `notificationString`) et **persistée
sur la `Notification` puis renvoyée verbatim sur REST / Socket.IO / push** aux
clients web et iOS (docstring du module, lignes 655–660). Un défaut ici s'affiche
identiquement partout.

## Current state (avant correctif)

`interpolate` (lignes 593–598) substituait chaque `{token}` sans se soucier des
espaces qui l'entourent :

```ts
function interpolate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = tokens[k];
    return v === undefined ? '' : v;
  });
}
```

Or `emoji` est **optionnel** (`params.emoji ?? ''`, ligne 610) tandis que **chaque
template de réaction l'enchâsse entre deux espaces littéraux** — 8 langues × 4 clés
(`reaction.message`, `reaction.comment`, `reaction.commentVerbose`, `reaction.post`),
p.ex. `'reacted {emoji} to your message'` (en, ligne 99), `'a réagi {emoji} à votre
message'` (fr, ligne 54). Quand l'emoji est absent, la substitution `→ ''` laissait
les **deux espaces adjacents intacts**.

## Problems identified

1. **Double espace verbatim dans le fil temps réel.** `notificationString('en',
   'reaction.message')` rendait `"reacted  to your message"` (deux espaces) au lieu
   de `"reacted to your message"`. Idem `reaction.comment`, `reaction.commentVerbose`,
   `reaction.post`, dans les **8 langues** (zh rendait `"用  回应了你的消息"`).
2. **Chemin de production confirmé.** `NotificationService.ts:890-891` résout
   `emoji: null` quand la métadonnée de réaction n'en porte pas ; ce `null` traverse
   `buildNotificationDisplay`, dont le TITRE (`"Alice reacted  to your post"`) est
   persisté et expédié aux clients. Les appels directs `notificationString(...,
   'reaction.message'/'reaction.commentVerbose', { emoji: reactionEmoji })`
   (`NotificationService.ts:1736-1737,1843-1845`) reproduisent le défaut dès que
   `reactionEmoji` est vide/`undefined`.
3. **Témoins aveugles.** Le fichier de tests dédié existait mais n'exerçait JAMAIS
   le chemin sans emoji : le test de couverture exhaustive passe toujours `emoji:
   '❤️'`, le test d'interpolation `emoji: '🔥'`. Un fichier « notification-strings »
   couvrait la présence de l'emoji, en vert, sans qu'une ligne ne puisse tomber si
   l'emoji manquait.

## Root causes

Un token OPTIONNEL enchâssé dans des espaces LITTÉRAUX présumés toujours présents.
L'interpolateur ignorait la relation entre le token et son voisinage : substituer
à vide n'implique pas de nettoyer l'espace devenu orphelin.

## Business impact

Chaque « like/réaction » dont la métadonnée ne porte pas d'emoji (le cas par défaut
de plusieurs chemins) produisait un titre de notification mal formé, visible tel
quel dans la liste in-app iOS/web et le push OS. Défaut cosmétique mais omniprésent,
sur une surface de confiance (les notifications), dans 8 langues.

## Technical impact

Défaut à la SOURCE unique → correction unique fermant les 32 combinaisons
(8 langues × 4 templates) d'un coup, plus tout futur template enchâssant un token
optionnel.

## Risk assessment

**Piège écarté :** la correction « naïve » (`.replace(/ {2,}/g,' ').trim()`) proposée
au premier abord AURAIT régressé `reaction.commentVerbose`. `interpolate` est
RÉUTILISÉ pour résoudre le `{context}` imbriqué (ligne 638), et les valeurs de
`COMMENT_CONTEXT` **commencent délibérément par un espace** (`' on {author}’s post'`).
Un `.trim()` inconditionnel aurait amputé cet espace → `commentaireon Bob's post`.
Le correctif retenu ne trim PAS et ne collapse QUE l'espace flanquant un token vide.

## Proposed improvement (retenu)

Capturer l'espace optionnel de part et d'autre du token dans la regex, et ne
réduire QUE lorsque la valeur est vide :

```ts
return template.replace(/( ?)\{(\w+)\}( ?)/g, (_match, lead, key, tail) => {
  const value = tokens[key];
  if (value === undefined || value === '') return lead && tail ? ' ' : '';
  return lead + value + tail;
});
```

- Token vide entre deux espaces ⇒ un seul espace (Latin : `reacted to your message`).
- Token vide en bord ⇒ disparaît (pas d'espace de tête/queue orphelin).
- Valeur NON vide ⇒ `lead + value + tail` = substitution d'origine à l'identique —
  **le contenu utilisateur (noms, previews) et l'espace-en-tête du contexte sont
  préservés**.

## Expected benefits

Titres de notification propres dans 8 langues sur tous les clients, sans mutation
du contenu utilisateur, sans régression du contexte imbriqué.

## Implementation complexity

**Triviale** — une fonction pure, 8 lignes. Rayon d'impact large, blast radius du
changement minimal.

## Validation criteria

- RED prouvé : 4 témoins neufs tombent sur le code d'avant (double espace).
- GREEN : les 4 neufs + 40 existants du fichier passent ; `vitest` shared complet
  98 fichiers / 2370 tests verts.
- Consommateurs gateway : 49 suites notifications (1018 tests) + 14 suites
  réaction/mention (443 tests) vertes sous `jest`.
- Aucun témoin (shared/gateway/apps) ne pinnait l'ancien double espace (grep).
- `tsc --noEmit` shared vert. Sortie recompilée vérifiée empiriquement.

## Améliorations futures (candidats non retenus cette itération)

- **zh sans emoji rend `用 回应了…` (espace unique résiduel).** Le CJK n'utilise pas
  d'espace ; l'idéal serait `用回应了…`. Mais un interpolateur agnostique de langue
  ne peut le savoir, et un espace unique est STRICTEMENT meilleur que le double
  d'avant. Corriger exigerait une refonte par-langue des templates — décision
  produit séparée.
- **Gateway `PostCommentService.likeComment`** purge les autres emojis avant upsert
  (`deleteMany({ emoji: { not: emoji } })`) — reliquat mono-réaction possiblement
  incohérent avec le modèle multi-réactions du chemin socket. MAIS test-pinné
  (`PostCommentService.reactionLimit.test.ts:90-94`) et miroir assumé dans
  `PostService.likePost` (« max 1 » délibéré). Exige une décision produit avant
  toute action — écarté.
</content>
