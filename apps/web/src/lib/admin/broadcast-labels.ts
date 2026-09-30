import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LE VRAI NOM D'UNE DIFFUSION** (#8876, #6731) — son nom ; à défaut son objet ;
 * à défaut « Non renseigné ». Jamais son identifiant : la passerelle refuse une
 * diffusion sans nom, mais une ligne corrompue ne doit pas se peindre par son
 * ObjectId.
 */
export function broadcastLabel(broadcast: { readonly name: string; readonly subject: string }, language: InterfaceLanguage): string {
  const name = broadcast.name.trim();
  if (name !== '') return name;
  const subject = broadcast.subject.trim();
  return subject === '' ? translateAdmin(language, 'admin.value.notProvided') : subject;
}
