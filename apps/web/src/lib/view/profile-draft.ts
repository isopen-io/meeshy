import type { MyProfile, ProfilePatch } from '@/lib/api/profile';
import { isNameTooShort } from '@/lib/identity-bounds';

/**
 * **LE BROUILLON DE L'IDENTITÉ** (#6289) — les quatre saisies de l'édition, et
 * le corps PARTIEL qu'on en tire. Miroir `ProfileView.changedOrNil`
 * (`ProfileView.swift:816-818`) : un champ non touché ne part pas, sans quoi il
 * écraserait côté serveur un changement fait ailleurs entre-temps.
 *
 * Les NOMS se rognent et ne partent jamais vides (la passerelle refuse un
 * prénom vide, et un nom d'affichage vidé ferait afficher l'identifiant à tout
 * le monde) ; la BIO part telle quelle, vide comprise — la passerelle
 * l'accepte, et c'est le seul moyen de l'effacer.
 */
export type ProfileDraft = {
  readonly firstName: string;
  readonly lastName: string;
  readonly displayName: string;
  readonly bio: string;
};

export function draftOf(profile: MyProfile): ProfileDraft {
  return {
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
    displayName: profile.displayName ?? '',
    bio: profile.bio,
  };
}

const changedName = (typed: string, served: string | null): string | undefined => {
  const trimmed = typed.trim();
  return trimmed === '' || trimmed === (served ?? '') ? undefined : trimmed;
};

export function draftPatch(profile: MyProfile, draft: ProfileDraft): ProfilePatch {
  const firstName = changedName(draft.firstName, profile.firstName);
  const lastName = changedName(draft.lastName, profile.lastName);
  const displayName = changedName(draft.displayName, profile.displayName);
  return {
    ...(firstName === undefined ? {} : { firstName }),
    ...(lastName === undefined ? {} : { lastName }),
    ...(displayName === undefined ? {} : { displayName }),
    ...(draft.bio === profile.bio ? {} : { bio: draft.bio }),
  };
}

export type DraftNameField = 'firstName' | 'lastName' | 'displayName';

export type DraftIssues = Partial<Record<DraftNameField, 'too-short'>>;

const NAME_FIELDS: readonly DraftNameField[] = ['firstName', 'lastName', 'displayName'];

/**
 * LES REFUS QUI BLOQUENT L'ENREGISTREMENT (#13825, directive porteur
 * 2026-10-30) — un prénom, un nom ou un nom affiché CHANGÉ garde au moins deux
 * caractères une fois rogné. Seul un champ que l'utilisateur a modifié est
 * jugé : un nom déjà servi d'un caractère, laissé tel quel, n'empêche pas
 * d'éditer la bio. Un champ vidé n'est pas un refus de longueur — il ne part
 * simplement pas (`changedName`).
 */
export function draftIssues(profile: MyProfile, draft: ProfileDraft): DraftIssues {
  return Object.fromEntries(
    NAME_FIELDS.filter((key) => changedName(draft[key], profile[key]) !== undefined && isNameTooShort(draft[key])).map((key) => [key, 'too-short' as const]),
  );
}
