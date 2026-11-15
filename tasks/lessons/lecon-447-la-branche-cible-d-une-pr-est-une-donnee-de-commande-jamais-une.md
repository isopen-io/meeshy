## Leçon 447 — La branche CIBLE d'une PR est une donnée de commande, jamais une convention par défaut

**Ce qui s'est passé (2026-09-02, chantier stickers).** La PR #4826 a été
ouverte sur `main` — la cible par défaut du dépôt — alors que la branche
avait été FORKÉE de `dev`, fusionnait `origin/dev` à chaque étape, et que le
porteur voulait `dev`. Il l'a dit à mi-course (« merge dans dev pas dans
main ! »). Coût avant la correction : Trivy comparait les alertes à la
dernière analyse de `main` (plus ancienne que `dev`, donc des alertes
« nouvelles » qui n'en étaient pas), le corps de la PR annonçait « demande
porteur : merger sur main », et le point de contrôle horaire portait « base
main » dans son propre prompt — trois artefacts à corriger pour une
donnée.

> **La base d'une PR se lit à l'endroit d'où la branche est PARTIE**, et à
> ce que le porteur a dit — jamais au défaut du dépôt. Une branche qui
> fusionne `dev` à chaque tour a déjà répondu à la question. Et la base
> n'est pas qu'un champ de la PR : tout ce qui la NOMME (corps, routine de
> contrôle, commentaire d'issue) est à changer dans le même mouvement, sinon
> l'un des trois continue de dire l'ancienne.

Corollaire mesuré : la comparaison de sécurité (Trivy « new alerts vs
base ») dépend de la base. Une PR rouge sur ce check avec une base fausse
n'a RIEN à corriger dans le code — changer la base l'a rendue neutre.
