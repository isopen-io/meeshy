## Leçon 591 — Une loi qui gouverne trois clients et habite UN service n'est pas mal câblée : elle est INATTEIGNABLE

**Mesuré le 2026-09-12, #6189.** Cherchant si `apps/web-v2` lisait la protection
déclarée sur une PIÈCE JOINTE (la jumelle du cycle 125), la réponse fut nette :

```
src/components/bubble.tsx:319      isViewOnce={message.isViewOnce}
src/components/focal-row.tsx:670   isViewOnce={message.isViewOnce}
src/lib/view/conversation.ts:116   if (last.isBlurred) …
src/lib/view/conversation.ts:117   if (last.isViewOnce) …
```

Quatre lectures, toutes au niveau MESSAGE. Aucune au niveau PIÈCE. Sonde :

```
SONDE url_en_clair=true img=true voile=false
```

Une pièce `isViewOnce: true` sur un message ordinaire rendait son `<img>` et
l'URL du fichier en clair, pendant qu'iOS la retenait
(`FocalAttachmentBlock.swift:130`) et que le gateway composait DÉJÀ le verdict
des deux niveaux par un OU.

**Le réflexe est d'écrire « le web a oublié de lire ce champ ». C'est faux.** La
loi vivait dans `services/gateway/src/services/notifications/NotificationService.ts`.
Un client ne peut pas importer un service. Le web ne pouvait donc pas la lire
même en le voulant : ce n'était pas un oubli, c'était une IMPOSSIBILITÉ.

> **Quand une loi gouverne plusieurs clients et qu'un seul l'applique, mesurer où
> elle HABITE avant d'accuser ceux qui ne l'appliquent pas.** Une loi dans un
> service est un privilège d'accès : le service l'a, les clients ne l'ont pas. Le
> correctif n'est pas de la recopier — deux corps pour une règle, c'est la leçon
> 586 — mais de la DÉPLACER dans le paquet partagé, le service la réexportant.

Cette forme se reconnaît à un symptôme précis : **le doc-comment de la loi parle
déjà des clients**. Celui de `maskedAttachment` nommait la NSE iOS et l'écran
verrouillé — il DÉCRIVAIT un monde à trois clients depuis un fichier qu'un seul
pouvait ouvrir. Un commentaire qui parle plus large que son import est le signe
que la loi est mal logée.

Effet de bord à ne pas négliger : le déplacement a allégé de 19 lignes le fichier
le plus lourd du gateway (6 108 → 6 089 contre un cliquet de 6 119). **Sortir une
loi d'un fichier obèse est un découpage PAR RESPONSABILITÉ**, donc exactement ce
que le budget de taille demande — pas une tranche arbitraire.

### Deux corollaires de méthode, payés dans le même lot

**1. Un bitmask recopié dans un témoin est une seconde source de vérité qui se
trompe.** J'ai écrit `VIEW_ONCE = 1 << 0` et `BLURRED = 1 << 1` dans le test.
Les vraies valeurs sont `1 << 2` et `1 << 1` : `1 << 0` est `EPHEMERAL`. Le
témoin a rougi sur MA constante, et il avait raison. **Les bits s'importent
(`MESSAGE_EFFECT_FLAGS`), jamais ne se réécrivent** — et le témoin qui distingue
`EPHEMERAL` (non masquant) des deux autres est celui qui aurait attrapé une loi
écrite `effectFlags !== 0`.

**2. Une absence affirmée sur une valeur numérique COURTE croise le bruit.**
`expect(html).not.toContain(String(piece.fileSize))` — `fileSize` vaut 96, et
« 96 » apparaît dans les coordonnées des chemins SVG (`M144,100…96,57`).
L'assertion rougissait sur un GLYPHE, pas sur une fuite. Il faut restreindre le
sujet avant d'affirmer une absence (ici : retirer les `<svg>`), sinon
l'assertion est ininterprétable dans les deux sens — elle peut aussi passer pour
une raison fausse.

Voisins : leçon 586 (deux gardes opposées sur la même chaîne — ici deux CORPS
pour une loi, le même mal), leçon 590 (mesurer avant d'accuser le diff),
`CLAUDE.md` § Prisme cycle 125 et § Single Source of Truth.

---
