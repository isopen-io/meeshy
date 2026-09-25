## Leçon 426 — Trois mesures fausses en une nuit, et les trois par un filtre que j'avais choisi moi-même

**Les faits (2026-09-01/02), dans l'ordre.**

1. **« La story n'a aucune scène. »** `curl` sans `X-Canvas-Caps: 3` — le gateway
   OMET `storyEffects` pour un client qui ne déclare pas la capacité (règle 5 de
   `negotiateWireStoryEffects`). Un `curl` nu EST un vieux client.
2. **« Le fil ne porte aucune géométrie. »** Mon relevé lisait `o['x']` et
   `o['scale']` ; le format v3 range la géométrie sous `transform: {…}` et
   `anchor: {t,x,y}`. `None` partout, et j'ai cru à un fil appauvri.
3. **« Deux couleurs sur une seule ligne. »** J'avais échantillonné le bouton
   `⋯`, à l'autre bout de la carte. Le défaut de contraste était réel ; mon
   témoin visuel ne le prouvait pas.

Et un quatrième, de raisonnement : `437,7 ≈ 491,3 × 0,88` — une coïncidence à
trois chiffres significatifs prise pour une chaîne causale, alors que la
géométrie ne lisait pas cette largeur-là.

> **Une absence mesurée à travers une négociation, une projection ou un
> échantillon n'est pas une absence : c'est le silence du filtre que j'ai
> choisi.** Et le filtre est invisible dans le résultat — un `None` ne dit jamais
> s'il vient du monde ou de la requête.

**Le geste.** Avant de conclure à une absence, énoncer le filtre traversé et le
faire varier : le même appel AVEC l'en-tête, le même relevé sur les clés BRUTES,
le même échantillon décalé de vingt points. Si l'absence survit aux trois, elle
est du monde.

**Deux variantes de plus, du même motif, la même nuit** (versées ici sur
invitation de leur auteur — la leçon est une, ses formes se comptent) :

5. **La PAGINATION.** `gh project item-list --limit 400` a rendu 400 items
   couvrant les issues 3532→3972 ; les miennes (4754+) étaient hors de la
   fenêtre. Relevé : « 0 sur 14 sur le tableau ». La conclusion était juste —
   elles y étaient bien absentes — **mais pour une raison que je ne lisais pas**.
   Une liste tronquée qui ne contient pas X ne prouve rien sur X.
6. **Le CHAMP INEXISTANT.** `gh issue view <n> --json projectItems -q
   '.projectItems[0].id'` rend vide sur des items qui EXISTENT : la projection
   n'expose ni `id`, seulement `status` et `title`. Demander un champ absent
   rend le même vide qu'une absence d'objet.

> **Une conclusion juste tirée d'une mesure fausse est plus dangereuse qu'une
> conclusion fausse** : elle se confirme, donc elle valide la méthode qui l'a
> produite. La cinquième variante a failli m'apprendre à faire confiance à un
> relevé tronqué.

Le geste s'étend donc d'un cran : **faire dire à la requête ce qu'elle a
COUVERT**, pas seulement ce qu'elle a trouvé. Une liste doit imprimer sa plage
(`min → max`, nombre d'items) avant qu'on lise son silence.

**Ce qui a fini par trancher** là où huit recherches de motifs avaient échoué :
l'arbre d'accessibilité, qui rend des CADRES mesurés plutôt que des noms
espérés. Il a donné en un appel ce que le grep ne savait pas nommer — mais il
ment aussi (il décrit parfois une vue montée et non affichée), donc il se croise
avec les pixels. Les deux d'accord, alors seulement c'est un fait.
