## Leçon 607 — Un composant peut avoir sa suite de tests et n'être monté NULLE PART : un fichier de test n'est pas un consommateur (2026-09-14)

**Cas.** En cherchant où l'e-mail de #6424 devait renvoyer pour « définir un
mot de passe », mesure de `apps/web` : `PasswordSettings` (256 lignes) et
`__tests__/components/settings/password-settings.test.tsx` existent tous deux,
et le composant a **zéro consommateur** hors sa propre définition. L'onglet
« Security » des réglages monte `EncryptionSettings`. Conséquence : **aucune
personne ne pouvait changer son mot de passe depuis l'application web**, seulement
le réinitialiser par e-mail depuis `/forgot-password`.

1. **Le comptage doit EXCLURE les tests.** `git grep -l PasswordSettings` rend
   deux fichiers et rassure ; en retirant `__tests__`, il n'en reste qu'un — sa
   définition. C'est cette seconde commande qui mesure quelque chose.
2. **Le motif est celui de la « vue sans consommateur ne rougit nulle part »,
   avec une aggravation** : la suite de tests VERTE fait croire que la
   fonctionnalité est éprouvée. Elle l'est — sur un composant que personne
   n'affiche.
3. **La question qui l'attrape** se pose au moment où l'on veut renvoyer
   quelqu'un vers un écran : « ce lien atterrit-il sur une page qui parle de
   ça ? ». C'est la loi 4 (un contrôle existe s'il a un effet) appliquée à une
   DESTINATION plutôt qu'à un bouton.
4. **Corollaire mesuré le même jour** : la barre latérale de `/admin` pointait
   « Journaux d'audit » vers `/admin/audit`, quand la page vit dans
   `app/admin/audit-logs/`. Un 404 depuis toujours, trouvé en RECOPIANT la
   table vers une autre application. Porter une liste de destinations est une
   occasion de les VÉRIFIER — recopiée sans mesure, elle importe ses 404 dans
   l'application neuve.
