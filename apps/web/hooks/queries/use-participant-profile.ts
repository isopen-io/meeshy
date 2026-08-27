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
  /**
   * **Peut MANQUER — `undefined` veut dire « on ne te le dit pas ».**
   * #4009 retire ce droit de l'événement diffusé à la room de conversation :
   * « qui a le droit de voir l'historique » est un fait de modération, comme
   * `historyVisibleFrom` que #3898 avait déjà retiré du même payload.
   * Distinct de `false`, qui le REFUSE : non dit n'est pas refusé.
   */
  readonly canViewHistory?: boolean;
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
  /**
   * Octroi d'historique par DATE posé par un administrateur — vaut pour TOUT
   * participant, inscrit compris, pas seulement les visiteurs sans compte.
   * `null` pour un membre ordinaire, que l'octroi existe ou non : c'est un fait
   * de modération, pas un attribut de la personne. Servi aux hôtes
   * (admin/modérateur/creator).
   */
  readonly historyVisibleFrom: string | null;
  /**
   * Ce lecteur peut-il POSER ou RETIRER l'octroi ci-dessus ? Répond à une
   * question différente de `historyVisibleFrom` : un modérateur LIT l'octroi
   * mais ne peut pas l'écrire (réservé admin/creator côté gateway) — sans ce
   * signal, `historyVisibleFrom: null` ne distingue pas « pas hôte » de
   * « hôte, aucun octroi posé ».
   */
  readonly canGrantHistory: boolean;
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
        // Le CODE voyage avec l'erreur : « cette personne est partie » et
        // « la fiche est indisponible » sont deux phrases différentes, et seul
        // le gateway sait laquelle est vraie. Sans lui, la vue devrait deviner.
        // `code` vit à la racine de l'enveloppe (`utils/response.ts`).
        const failure = new Error(response.error ?? 'profile unavailable') as Error & {
          code?: string;
        };
        failure.code = (response as { code?: string }).code;
        throw failure;
      }
      return response.data;
    },
  });
}
