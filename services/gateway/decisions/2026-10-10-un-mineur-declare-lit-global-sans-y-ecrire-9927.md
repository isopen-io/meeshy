# Un mineur déclaré lit Meeshy Global sans y écrire (2026-10-10, #9927)

**Décision porteur (#9926).** L'âge se demande à l'onboarding, facultativement : un âge non déclaré ne restreint rien. Une date sous 13 ans est refusée. De 13 à 17 ans révolus, Global est en lecture seule et rangée dans les archives, et revient d'elle-même à 18 ans.

## Ce qui est retenu

- **Aucun état stocké.** La règle est calculée à chaque lecture et à chaque écriture depuis `User.birthDate` (`isDeclaredMinor`, `viewerWriteRestrictionOf`, calendrier UTC, anniversaire inclus, 29 février → 1er mars). L'archivage est un RECOUVREMENT au service : `UserConversationPreferences.isArchived` garde le choix de l'utilisateur, qui reparaît à 18 ans ; désarchiver Global pendant la minorité écrit la préférence sans rien changer à ce qui est servi.
- **La date se déclare une fois** (`PUT /api/v1/me/birth-date`) : écriture conditionnée en base à l'absence de date, 409 `BIRTH_DATE_ALREADY_SET` ensuite. Une correction passe par le support (l'administration garde l'écriture de `birthDate`). Le consentement vocal, second écrivain historique de la date, ne l'écrit plus que si aucune n'est posée et qu'elle serait admise.
- **Une règle, tous les chemins.** Règle 5 de `conversationWriteAdmission` au point de convergence (REST, `message:send`, `message:send-with-attachments`, transfert vers Global, lien de partage) ; `admitMessageEdit` pour les quatre transports d'édition ; `globalMinorGate` pour la position en direct (départ, et mise à jour d'une session inconnue du registre), l'épinglage et le dépinglage, la pièce jointe texte rattachée à un message existant. Refus 403 `GLOBAL_ADULTS_ONLY` avec un `message` lisible pour les clients antérieurs.
- **Aucune dispense de rôle** : c'est une protection du mineur, pas une police d'écriture.
- **Ce qui reste permis** : lire, réagir (les réactions ne sont pas des écritures de message), supprimer ses propres messages, signaler une capture d'écran.
- **L'anonyme est un âge inconnu.** Un participant sans compte (lien de partage) n'a pas de date de naissance : la règle ne le restreint pas, comme tout compte qui n'a rien déclaré.

## Ce qui est servi

`viewerWriteRestriction: 'minor-global' | null` sur chaque ligne de `GET /conversations`, sur `GET /conversations/:id` (champ composé de `?fields=`) et, toujours présent, sur `GET /me/onboarding` (sa présence annonce l'étape `age`). La ligne de liste sert Global avec `userPreferences[0].isArchived: true`. Le détail ne sert pas `isArchived` : il n'a jamais servi les préférences (#4173), et les recharger coûterait une jointure par ouverture.
