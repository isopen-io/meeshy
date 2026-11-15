## Un `await` ajouté en amont d'un canal NON ATTENDU en change la sémantique observable (cycle 143 bis, #16706)

`MessageHandler` lance l'enfilage hors ligne **sans l'attendre** — `this._enqueueOfflineEventForParticipants({…})`, deux sites, aucun `await`. C'est délibéré : le canal est best-effort et doit rester hors du chemin de l'accusé.

Trois témoins assertent dessus après un simple `await handler.handleMessageDelete(...)`. Ils ne mesurent donc pas un comportement : ils mesurent **ce qui s'est trouvé terminé pendant leur propre attente**, c'est-à-dire un nombre de tours de boucle d'événements que personne n'a écrit nulle part.

J'ai ajouté UNE lecture de base en amont de l'unité partagée (une garde d'admission, parfaitement juste). Elle consomme un tour. Les trois témoins sont passés au rouge avec « 0 appel » — **y compris sur une famille d'événements que la garde ne regarde même pas**, ce qui est le signe qui disculpe le verdict et accuse l'attente.

> **Avant d'ajouter une lecture à une unité partagée, demander : qui l'appelle SANS l'attendre ?** Le défaut ne se lit ni dans la garde, ni dans les assertions — il est dans la profondeur d'attente qu'une unité introduit chez des appelants qui n'attendent pas. Aucun des deux côtés n'a tort, et c'est ce qui rend le diagnostic lent.

**Le symptôme qui l'identifie en une lecture** : un échec « 0 appel » uniforme sur des cas dont les prédicats diffèrent. Si la garde était la cause, seules les familles qu'elle inspecte tomberaient. Quand tout tombe, c'est que rien n'est parti du tout — donc le problème est en amont de la décision, dans l'ordonnancement.

**Deux correctifs, et le second est celui qui compte.** Faire se recouvrir les deux lectures (elles étaient indépendantes, les sérialiser était gratuit) rend la latence d'avant mais ne suffit pas : attendre une seconde promesse coûte un tour **où qu'elle soit**. Ce qu'il faut, c'est que le témoin **attende explicitement le canal qu'il observe** (`await new Promise((r) => setImmediate(r))`, qui franchit la phase « check »).

**Modifier un témoin pour qu'il passe est exactement ce dont il faut se méfier, et la distinction se MESURE.** Sous les témoins flushés, j'ai muté la production dans deux directions : une garde qui refuse tout fait tomber 1 témoin, un enfilage cassé en fait tomber 3. Ils gardent donc toujours ce qu'ils gardaient ; si le flush avait masqué la régression, les deux mutations seraient restées vertes. **Un flush ajouté sans ces deux mutations est indistinguable d'un enterrement.**

**Et le correctif du témoin paie son propre budget.** Le helper de flush, avec son explication, pesait 23 lignes dans un fichier de témoins à 4 263 lignes — de la dette héritée, donc déjà hors budget, donc interdit d'ajout. Replié sur les lignes d'appel existantes : zéro ligne ajoutée, explication déportée dans cette fiche. **Un cliquet de taille ne fait pas d'exception pour un correctif, même juste, même petit** — et c'est le troisième cliquet du même cycle à refuser une addition que je croyais anodine.
