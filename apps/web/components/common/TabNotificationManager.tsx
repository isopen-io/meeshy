'use client';

import { useTabNotification } from '@/hooks/use-tab-notification';

/**
 * Composant invisible qui gère le badge de notification sur l'onglet navigateur.
 * Affiche un point bleu sur le favicon + compteur dans le titre quand
 * l'utilisateur a des messages non lus et n'est pas sur l'onglet Meeshy.
 */
export function TabNotificationManager() {
  useTabNotification();
  return null;
}
