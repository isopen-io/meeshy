'use client';

import { useQuery } from '@tanstack/react-query';
import { apiService } from '@/services/api.service';
import { queryKeys } from '@/lib/react-query/query-keys';

/**
 * Fiche d'un participant, telle que le gateway la sert.
 *
 * `email` et `birthday` sont `null` pour un membre ordinaire, même quand la
 * personne les a fournis : ils n'ont été demandés que parce que l'HÔTE les
 * exigeait sur son lien, et la salle contient d'autres visiteurs venus par ce
 * même lien public. `hasEmail` / `hasBirthday` disent qu'ils existent sans les
 * livrer — sans quoi un visiteur qui a tout rempli et un visiteur qui n'a rien
 * donné seraient indistinguables.
 *
 * Source : `GET /conversations/:id/participants/:participantId/profile`.
 */
/**
 * Ce que le visiteur peut RÉELLEMENT faire dans la salle — premier cercle,
 * servi à tout membre.
 *
 * Ce n'est pas la configuration courante du lien : l'hôte a pu la modifier
 * depuis, sans que cela retire quoi que ce soit à qui est déjà entré.
 */
export type ParticipantEntryCapabilities = {
  readonly canSendMessages: boolean;
  readonly canSendFiles: boolean;
  readonly canSendImages: boolean;
  readonly canSendVideos: boolean;
  readonly canSendAudios: boolean;
  readonly canSendLocations: boolean;
  readonly canSendLinks: boolean;
  readonly canViewHistory: boolean;
};

/**
 * Les réglages du lien emprunté — second cercle, `null` pour un membre
 * ordinaire. Même raison que pour l'email : la salle contient d'autres visiteurs
 * venus par ce même lien, et sa configuration appartient à l'hôte.
 */
export type ParticipantEntryLink = {
  readonly name: string | null;
  readonly isActive: boolean;
  readonly expiresAt: string | null;
  readonly maxUses: number | null;
  readonly currentUses: number;
  readonly requireNickname: boolean;
  readonly requireEmail: boolean;
  readonly requireBirthday: boolean;
  readonly allowedCountries: readonly string[];
  readonly allowedLanguages: readonly string[];
};

export type ParticipantProfile = {
  readonly participantId: string;
  readonly conversationId: string;
  readonly isAnonymous: boolean;
  readonly userId: string | null;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly avatar: string | null;
  readonly language: string | null;
  readonly country: string | null;
  readonly conversationRole: string | null;
  readonly joinedAt: string | null;
  readonly isOnline: boolean;
  readonly lastActiveAt: string | null;
  readonly shareLinkName: string | null;
  readonly hasEmail: boolean;
  readonly hasBirthday: boolean;
  readonly email: string | null;
  readonly birthday: string | null;
  /** `null` quand le participant a un compte : il n'est entré par aucun lien. */
  readonly entryCapabilities: ParticipantEntryCapabilities | null;
  /** `null` hors du cercle des administrateurs et modérateurs. */
  readonly entryLink: ParticipantEntryLink | null;
};

export function useParticipantProfile(
  conversationId: string | null,
  participantId: string | null
) {
  return useQuery({
    queryKey: queryKeys.conversations.participantProfile(conversationId ?? '', participantId ?? ''),
    enabled: !!conversationId && !!participantId,
    queryFn: async (): Promise<ParticipantProfile> => {
      const response = await apiService.get<ParticipantProfile>(
        `/conversations/${conversationId}/participants/${participantId}/profile`
      );
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'profile unavailable');
      }
      return response.data;
    },
  });
}
