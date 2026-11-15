## Un prédicat PUR appartient à un module FEUILLE — sinon les doubles du module lourd l'avalent

*2026-11-08 — #17074, cycle 148*

### Ce qui s'est passé

Une garde de confidentialité manquait à un éventail de notifications. Le
prédicat existait déjà, inliné chez son voisin, et le lot consistait à lui
donner un NOM pour que les deux sites partagent la règle. Je l'ai posé dans
`MentionService`, à côté de son jumeau qui interroge la base — l'endroit
évident.

Une suite d'intégration E2EE à deux appareils, qui ne parle ni de mentions ni de
demandes de message, a cessé de voir **aucune** notification.

Sa cause : ce fichier remplace `MentionService` par un double qui ÉNUMÈRE cinq
méthodes à la main. Mon import s'est résolu en `undefined`, l'appel a levé dans
le `try` best-effort de l'éventail — qui ne lève jamais, par contrat — et la
notification n'est jamais partie. **Le symptôme était à deux fichiers de la
cause, sur un test qui ne mentionne aucun des deux sujets.**

### La règle connue, et ce qu'elle ne disait pas

Le dépôt porte déjà « un double PARTIEL perd en silence tout ce que le module
GAGNE, et il ne se signale qu'au moment où le module grandit » — trois
exemplaires documentés. Elle prescrit `jest.requireActual` + surcharge ciblée,
et c'est juste.

Ce qu'elle ne dit pas : **le risque est une propriété du module qu'on
AGRANDIT**, pas seulement du double. Un module lourd — un service qui traîne un
cache, un moteur de suggestions, des projections — est précisément celui que
les suites remplacent. Y ajouter une fonction, c'est la placer derrière tous
les doubles existants, dont on ne sait pas combien il y en a.

> **Avant d'ajouter une fonction à un module, demander : combien de suites le
> REMPLACENT ?** Si la réponse est « plus d'une », et si la fonction n'a besoin
> de rien de ce module, elle appartient à une feuille.

### Ce qui rend la feuille meilleure, et pas seulement plus sûre

Un prédicat pur sur des lignes déjà lues ne dépend de rien : ni prisma, ni
cache, ni logger. Le mettre dans un service inverse la dépendance — l'éventail
importait un service entier pour une expression de trois lignes. Dans une
feuille, il n'y a rien à doubler, donc rien à oublier de doubler.

Et la feuille est l'endroit où la RAISON se lit : le doc-comment du module
nomme le défaut mesuré, pas un goût d'architecture.

### À faire la prochaine fois

1. une fonction PURE (pas de `this`, pas d'IO) va dans un module feuille, pas
   dans le service où vit son sujet ;
2. le module d'origine la RÉ-EXPORTE si des importeurs historiques en dépendent
   — la migration ne doit pas être un lot à elle seule ;
3. réparer quand même le double qui a avalé la fonction (`jest.requireActual` +
   surcharge ciblée) : la feuille empêche la CLASSE, le double réparé empêche la
   PROCHAINE dans ce fichier ;
4. devant un rouge sur une suite qui ne parle pas de ton sujet, chercher
   d'abord ce que son harnais REMPLACE — pas ce que ton code touche.
