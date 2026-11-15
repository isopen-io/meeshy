## Leçon 287 — un prédicat de validation se mesure sur TOUTES les formes de son entrée, pas la seule famille qu'on avait en tête (2026-08-25, itération 267)

`packages/shared/types/attachment.ts` exposait six type-guards MIME agrégés par
`isAcceptedMimeType` — la porte accept/reject des pièces jointes. Deux gardes
(audio, vidéo) NETTOYAIENT les paramètres MIME avant de comparer
(`audio/webm;codecs=opus` → `audio/webm`) ; les quatre autres (image, texte,
document, code) faisaient une comparaison exacte. Résultat : **la même forme
d'entrée était classée différemment selon sa seule famille média**.
`isAcceptedMimeType('audio/webm;codecs=opus')` → true ;
`isAcceptedMimeType('text/plain; charset=utf-8')` → **false** — alors que
`; charset=utf-8` est le paramètre que `fetch`/`axios`/tout serveur HTTP ajoute
par défaut à un `Content-Type` texte/JSON. Un upload JSON légitime était rejeté,
et `getAttachmentType('application/json; charset=utf-8')` tombait au défaut
`'document'` au lieu de `'code'`.

> **Le nettoyage a été ajouté là où le symptôme est apparu (AUDIO/VIDÉO, où
> `MediaRecorder` émet un paramètre), et jamais généralisé.** C'est la forme, à
> une frontière de validation, de la règle du dépôt : *une protection se mesure
> sur tout ce que la charge TRANSPORTE* — ici l'ensemble des formes d'entrée
> (avec/sans paramètre), pas la seule famille qu'on regardait. Jumelle directe
> de l'It. 266 (`isPrivateIp` ne connaissait que l'IPv4) et de l'It. 260
> (`isIpInRange` hors plage).

Deux corollaires de méthode :

- **Le témoin qui l'attrape s'écrit sur la famille AUTRE que celle qui marche.**
  Les tests audio/vidéo EXERÇAIENT déjà le cas paramétré (prouvant l'INTENTION
  du dépôt : tolérer les paramètres) ; image/texte/document/code n'étaient
  testés qu'avec des MIME nus, donc le trou était invisible. Comme la leçon 276
  (« un témoin de rang s'écrit sur un rang autre que le premier »), transposée à
  une famille.
- **Une divergence entre N implémentations de la même règle se supprime en
  extrayant UN site.** Le correctif n'ajoute pas le nettoyage quatre fois : il
  factorise `stripMimeParameters()` et remplace les DEUX copies in-line
  existantes — le mécanisme même qui empêche la prochaine divergence.
