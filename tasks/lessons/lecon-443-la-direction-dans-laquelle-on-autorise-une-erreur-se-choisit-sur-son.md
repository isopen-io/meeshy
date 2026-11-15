## Leçon 443 — La direction dans laquelle on autorise une erreur se choisit sur son COÛT DE RÉPARATION, jamais sur sa probabilité

**Trois cas indépendants, en une journée, sur trois couches différentes.** Chacun
posait la même question — « de quel côté doit-on se tromper ? » — et chacun l'a
tranchée sans jamais estimer une fréquence :

| cas | erreur A | erreur B | qui répare A | qui répare B |
|---|---|---|---|---|
| fail-safe de `StoryDerivedContent` | un doublon s'affiche | la légende d'un auteur est TUE | l'œil du lecteur | **personne** |
| réglage d'un balayage (§ 440) | un membre reste privé | un membre est ouvert pour rien | le compilateur | **personne** |
| routage de publication (§ 441) | rien ne se passe | un post en trop est publié | l'utilisateur re-tente | **une suppression** |

Dans les trois, l'erreur A a un réparateur — gratuit, immédiat, souvent
automatique — et l'erreur B n'en a pas. On penche vers A. **Et c'est indépendant
de laquelle est la plus probable.**

> C'est ce qui rend la règle utilisable AU MOMENT DE LA CONCEPTION : on n'a pas
> besoin d'estimer une fréquence, seulement de répondre à **« si je me trompe de
> ce côté, qui s'en aperçoit, et à quel prix ? »**.

Elle explique aussi pourquoi les formulations plus étroites tenaient chacune sur
un cas et pas sur les trois : « fail-closed » parle de sécurité, « réversible /
irréversible » parle du temps, « ne rien perdre » parle du contenu. Le coût de
réparation les subsume — il porte sur l'AGENT qui répare, et cet agent peut être
un compilateur, un œil, un utilisateur, ou personne.

**Le corollaire, qui est la partie actionnable** :

> Quand AUCUNE des deux erreurs n'a de réparateur, il ne faut pas choisir — il
> faut **créer le réparateur**.

Un balayage qu'on règle en citant l'extrait fautif fabrique le vérificateur
humain qui manquait ; une garde qu'on double d'un témoin sur la valeur SERVIE
fabrique le vérificateur automatique. Choisir un côté sans réparateur, c'est
parier ; en poser un, c'est concevoir.

*Formulée avec une session voisine le 2026-09-02 : elle tenait deux points, la
§ 441 a fourni le troisième — et sans trois points on n'aurait vu qu'une
coïncidence.*
