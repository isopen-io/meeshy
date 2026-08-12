'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Composant invisible monté au layout racine : il termine la chaîne de
 * révocation de session, qui s'arrêtait jusqu'ici à mi-chemin.
 *
 * Le serveur émet `auth:session-revoked` quand TOUTES les sessions d'un compte
 * viennent d'être invalidées (réinitialisation de mot de passe, lien
 * « ce n'était pas moi » d'un email de connexion suspecte) et ferme la socket
 * dans la foulée. `SocketIOOrchestrator.onSessionRevoked` traduit l'événement
 * en `meeshy:session-revoked` sur `window` — un événement DOM plutôt qu'un
 * appel direct, pour ne pas créer d'import circulaire entre la couche socket et
 * le store d'auth.
 *
 * **Personne ne l'écoutait.** L'orchestrateur journalisait un avertissement,
 * lançait l'événement dans le vide, et l'onglet restait connecté avec sa
 * session en cache : socket coupée, mais utilisateur toujours « connecté »,
 * jeton toujours en localStorage, et la moindre reconnexion le remettait en
 * ligne. La fermeture de socket côté serveur est le contrôle ; ce composant est
 * ce qui la rend visible à l'utilisateur.
 *
 * `useAuthStore.logout()` est le seul chemin de déconnexion du store — il purge
 * toutes les sessions via `authManager` puis renvoie à l'accueil. On le lit via
 * `getState()` : cet écouteur ne doit pas se réabonner à chaque rendu, et
 * l'action Zustand est stable.
 */
export function SessionRevocationHandler() {
  useEffect(() => {
    const onRevoked = () => {
      useAuthStore.getState().logout();
    };
    window.addEventListener('meeshy:session-revoked', onRevoked);
    return () => window.removeEventListener('meeshy:session-revoked', onRevoked);
  }, []);

  return null;
}
