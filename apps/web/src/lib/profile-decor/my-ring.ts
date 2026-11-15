import { useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand/react';

import type { AvatarRingDesign } from '@meeshy/shared/types/avatar-ring-design';

import { apiDeps } from '@/lib/api/deps';
import { myProfileQueryOptions } from '@/lib/api/profile';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';

import { useRingDesign } from './author-ring';

/**
 * **MON CONTOUR ÉQUIPÉ** (#10946) — celui que `GET /me` sert (`profileDecor`),
 * pour les avatars qui me montrent HORS du profil : le disque du menu flottant,
 * ma tuile du rail de stories, la carte de profil des réglages. Le profil est
 * déjà lu par le bandeau de progression et par l'écran de profil, sous la MÊME
 * clé : aucune requête de plus, et le contour suit l'équipement à la seconde
 * où le cache du profil change. Sans session : aucun contour.
 */
export function useMyRing(): AvatarRingDesign | null {
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  const profile = useQuery({ ...myProfileQueryOptions(apiDeps), enabled: signedIn }, appQueryClient);
  return useRingDesign(profile.data?.profileDecor?.avatarRing ?? null);
}
