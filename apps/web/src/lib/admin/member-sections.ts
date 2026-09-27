import { editableFieldsOf, type AdminUserEdit } from '@/lib/api/admin-user-actions';
import type { AdminUserDetail } from '@/lib/api/admin-user-detail';

/**
 * **LES BROUILLONS DE LA FICHE D'UN MEMBRE, SECTION PAR SECTION** (#8289).
 *
 * Chaque section de la fiche porte son brouillon et n'envoie QUE ce qui a
 * changé par rapport au membre servi : la passerelle fait traverser à chaque
 * champ PRÉSENTÉ sa propre loi (`champsPresentes`), et renvoyer un rôle
 * identique demanderait `canUpdateUserRoles` pour rien.
 *
 * Deux règles de forme, tenues ici une fois :
 * - un texte est comparé ROGNÉ — des espaces autour d'un pseudo ou d'une
 *   adresse ne sont pas un changement ;
 * - un champ NULLABLE vidé part en `null` (le retirer), jamais en `''` — une
 *   langue vide n'est pas une langue, et la passerelle exige deux lettres.
 */

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export type IdentityDraft = {
  readonly username: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly displayName: string;
  readonly bio: string;
  readonly systemLanguage: string;
  readonly regionalLanguage: string;
  readonly customDestinationLanguage: string;
};

export type ContactDraft = { readonly email: string; readonly phoneNumber: string };

export type RoleDraft = { readonly role: string; readonly isActive: boolean };

export const identityDraftOf = (m: AdminUserDetail): IdentityDraft => ({
  username: m.username,
  firstName: m.firstName,
  lastName: m.lastName,
  displayName: m.displayName,
  bio: m.bio,
  systemLanguage: m.systemLanguage,
  regionalLanguage: m.regionalLanguage,
  customDestinationLanguage: m.customDestinationLanguage,
});

export const contactDraftOf = (m: AdminUserDetail): ContactDraft => ({ email: m.email, phoneNumber: m.phoneNumber });

export const roleDraftOf = (m: AdminUserDetail): RoleDraft => ({ role: m.role, isActive: m.isActive });

const orNull = (valeur: string): string | null => (valeur === '' ? null : valeur);

export function identityEditOf(m: AdminUserDetail, d: IdentityDraft): AdminUserEdit {
  const edit: Mutable<AdminUserEdit> = {};
  const username = d.username.trim();
  const displayName = d.displayName.trim();
  if (username !== m.username) edit.username = username;
  if (d.firstName.trim() !== m.firstName) edit.firstName = d.firstName.trim();
  if (d.lastName.trim() !== m.lastName) edit.lastName = d.lastName.trim();
  if (displayName !== m.displayName) edit.displayName = orNull(displayName);
  if (d.bio !== m.bio) edit.bio = d.bio;
  if (d.systemLanguage !== m.systemLanguage) edit.systemLanguage = d.systemLanguage;
  if (d.regionalLanguage !== m.regionalLanguage) edit.regionalLanguage = orNull(d.regionalLanguage);
  if (d.customDestinationLanguage !== m.customDestinationLanguage) edit.customDestinationLanguage = orNull(d.customDestinationLanguage);
  return edit;
}

export function contactEditOf(m: AdminUserDetail, d: ContactDraft): AdminUserEdit {
  const edit: Mutable<AdminUserEdit> = {};
  const email = d.email.trim();
  const phoneNumber = d.phoneNumber.trim();
  if (email !== m.email) edit.email = email;
  if (phoneNumber !== m.phoneNumber) edit.phoneNumber = orNull(phoneNumber);
  return edit;
}

export function roleEditOf(m: AdminUserDetail, d: RoleDraft): AdminUserEdit {
  const edit: Mutable<AdminUserEdit> = {};
  if (d.role !== m.role) edit.role = d.role;
  if (d.isActive !== m.isActive) edit.isActive = d.isActive;
  return edit;
}

export const sectionIsDirty = (edit: AdminUserEdit): boolean => editableFieldsOf(edit).length > 0;
