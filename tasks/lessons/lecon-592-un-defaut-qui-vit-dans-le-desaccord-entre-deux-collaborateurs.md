## Leçon 592 — Un défaut qui vit dans le DÉSACCORD entre deux collaborateurs injectés est invisible à TOUT test qui injecte les deux

**Mesuré le 2026-09-12, #6201**, sur la garde SSRF de
`services/gateway/src/services/zmq-agent/agent-illustration.ts`. Trouvé par une
session pair, vérifié et prolongé ici.

La garde valide l'hôte par `lookup()`, puis `fetch()` **re-résout le nom
indépendamment** — d'où un rebinding DNS. Sa suite fait 219 lignes et dix-sept
cas : hôte privé, `og:image` privée, sauts de redirection revalidés, boucle,
content-type, budget d'octets. **Excellente, et structurellement aveugle**, parce
que chaque cas s'écrit ainsi :

```ts
await resolveAgentIllustration({ sourceUrl: ARTICLE, fetchImpl, lookup: publicLookup });
```

> **Les deux collaborateurs sont injectés, donc remplacés par une fiction
> COHÉRENTE — et le défaut vit précisément dans leur DÉSACCORD.** Ce n'est pas un
> cas de test qui manque : c'est un NIVEAU de test qui manque. Ajouter des cas
> unitaires n'y changera rien, quel que soit leur nombre.

### La contre-épreuve va plus loin que l'intuition

J'ai essayé d'écrire le témoin qui constaterait la dette — un `lookup` rendant
une adresse publique au 1er appel et celle des métadonnées au 2e. **Il a rougi**,
et sa cause démonte l'idée même du témoin : les deux appels que la garde fait ne
sont pas « validation puis transport », ce sont les validations de DEUX URL
(`publicHttpUrl` est appelé sur l'URL source, sur l'image extraite du HTML, et
sur chaque redirection). Un faux transport ne résout AUCUN nom : il n'existe
aucune seconde résolution à contredire.

**Le geste opérant** : ne pas écrire un témoin qui rougit pour de mauvaises
raisons, mais poser à l'endroit exact un commentaire qui dit *pourquoi le témoin
ne peut pas exister à ce niveau*, et renvoyer la preuve au niveau qui peut la
porter (ici un test d'intégration à transport réel). **Un test absent et expliqué
vaut mieux qu'un test présent qui mesure autre chose.**

### Deux corollaires du même lot, qui dépassent le SSRF

**1. `[].every(...)` rend `true`.** Une garde écrite
`addresses.every(estPublique)` est donc un VERT À VIDE sur une résolution
vide — l'inverse exact d'un fail-closed. Le vide se refuse EXPLICITEMENT, sur
toute collection dont on ne contrôle pas la taille.

**2. Un témoin d'ORDRE s'écrit sur les DEUX ordres.** Forme fautive rejouée
(`addresses[0]` seul) : **rouge uniquement quand la PREMIÈRE adresse est
publique**. Le cas « privée puis publique » restait VERT sur le code fautif,
qui voyait déjà la privée en tête. L'ordre des enregistrements A est choisi par
l'attaquant — les deux ordres sont nécessaires, jamais redondants. C'est la
leçon 261 sous un autre jour : un témoin de RANG s'écrit sur un rang AUTRE que
le premier, sinon la forme juste et la forme fautive rendent le même verdict.

---
