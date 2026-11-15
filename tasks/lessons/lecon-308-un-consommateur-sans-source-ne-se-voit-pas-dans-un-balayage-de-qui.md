## Leçon 308 — un consommateur sans SOURCE ne se voit pas dans un balayage de « qui écoute quoi » (2026-08-28, cycle 131)

Le cycle 130 a fermé l'arm CONVERSATION de `user:preferences-updated` et laissé
l'arm CATÉGORIE en suivi. En l'ouvrant, on a trouvé plus bas que prévu :
`PreferencesApi` ne déclarait que les deux `PATCH` — **aucun `GET`**. Android
pouvait écrire ses préférences de notification et de confidentialité, jamais les
relire. Il n'existait donc aucun chemin, ni socket ni relecture, par lequel une
valeur posée sur le web pouvait atteindre l'appareil.

> **La forme INVERSE du cycle 130.** Là : un événement diffusé qu'aucun client ne
> consommait. Ici : un magasin local qu'aucune source ne pouvait nourrir. Le
> premier se trouve en comptant les décodeurs d'un événement ; le second est
> invisible à cette question — il n'y a rien à écouter, donc rien à recenser comme
> manquant. **Devant un magasin local, demander non pas « qui l'écoute ? » mais
> « par quoi peut-il apprendre qu'il a tort ? »**

Et le point technique qui vaut d'être retenu, parce qu'il se rejoue à chaque fois
qu'on ajoute la moitié LECTURE d'un contrat d'écriture :

> **Une projection de lecture doit prendre l'état COURANT en argument, jamais
> reconstruire depuis la seule réponse.** Un corps de fil porte souvent MOINS que
> le bloc local, et délibérément — ici, `extras` des deux côtés, plus les quatre
> champs de chiffrement côté privacy, omis à l'écriture précisément pour qu'une
> synchro d'appareil n'estampille pas ses défauts sur une valeur posée ailleurs.
> Reconstruire depuis la réponse inflige **exactement ce dégât dans l'autre sens**,
> à chaque diffusion. Et la garde ne se teste pas d'un seul côté : il faut le
> témoin qui prouve qu'on n'ADOPTE pas la valeur que la réponse porte, ET celui qui
> prouve qu'on n'ÉCRASE pas celle que le local tient.

Trois corollaires, tous mesurés dans le lot :

- **Un collecteur de synchronisation ne se loge pas dans le ViewModel de l'écran
  qu'il alimente.** Le bloc de notifications gouverne ce que l'appareil affiche et
  sonne, pas seulement un écran de réglages ; collecter dans `SettingsViewModel` le
  synchroniserait uniquement pendant que l'utilisateur le REGARDE — la fenêtre où
  il en a le moins besoin. Il vit pour la session, et il **s'arrête** à la
  déconnexion, sans quoi il rejouerait une relecture sur le compte suivant.
- **Un échec de relecture ne remet rien à zéro.** Remettre un bloc de notifications
  à ses défauts sur un incident réseau rallumerait les notifications de quelqu'un
  qui vient de les couper : pire que de rester périmé. La dégradation correcte est
  celle du hors-ligne — garder ce qu'on a.
- **Un double dont toutes les routes refusent par défaut rend testable une
  ABSENCE d'appel.** Cinq des sept catégories de la passerelle n'ont pas de magasin
  Android ; le témoin qui dit « on ne va pas les chercher » ne peut tomber que si
  une route non stubée fait échouer l'appel.
- **Élargir une interface, c'est un inventaire à tenir dans tous ses doubles ÉCRITS
  À LA MAIN — et le compilateur est le seul à s'en souvenir.** Les deux `GET`
  ajoutés à `PreferencesApi` ont fait tomber `CategoryRepositoryTest.FakePreferencesApi`,
  qui n'a rien à voir avec les préférences user-level. `ConversationRepositoryTest`
  porte déjà la remarque, mot pour mot, sur les quatre doubles de `ConversationApi` :
  la connaître ne suffit pas, il faut **grep les implémenteurs AVANT d'ajouter la
  route**, pas après que la CI l'a dit. Le réflexe : `grep -rn ": <Interface> {"` sur
  le module, et compléter chaque double dans le même commit — en refusant par défaut,
  jamais en rendant un succès vide qui ferait passer un test qui devrait tomber.

---

---
