import { CONTACT_CARD_MIME_TYPE, type ParsedVCard, type VCardLabeledValue } from '@meeshy/shared/types/contact-card';
import { contactCardFileName, parseVCard, serializeVCard } from '@meeshy/shared/utils/vcard';

import { appelNatifMethode, coqueCourante, type CoqueNative } from '@/lib/native-shell';

/**
 * ENVOYER UN CONTACT (#8242) — la tuile « Contact » du tiroir, miroir de
 * `CarouselTile(id: "contact")` (`UniversalComposerBar+Attachments.swift`).
 *
 * ## TROIS SOURCES, UNE CARTE
 *
 * Dans l'ordre où elles se préfèrent : le sélecteur NATIF de la coque Android
 * (`MeeshyContactsPlugin.java`, `ACTION_PICK` — aucune permission, aucune
 * lecture du carnet entier), l'API Contact Picker du navigateur (Chrome
 * Android), et partout ailleurs le choix d'une fiche `.vcf`. Les trois rendent
 * un `ParsedVCard`, et UNE seule fonction en fait la pièce qui part
 * (`contactCardFile`) : `serializeVCard`, partagée, que `parseVCard` relit chez
 * le destinataire — la même carte qu'un envoi iOS.
 *
 * ## RIEN NE PART SANS UN CHOIX
 *
 * Chaque source rend la fiche que l'utilisateur a CHOISIE, ou `null` quand il
 * referme le sélecteur. Une fiche `.vcf` est RELUE puis réécrite : seule sa
 * première carte, et seuls les champs que la carte d'un contact affiche,
 * partent — ni la photo, ni les autres fiches d'un carnet exporté.
 */

export type ContactSource = 'shell' | 'picker' | 'file';

type PickerAddress = {
  readonly addressLine?: readonly string[];
  readonly city?: string;
  readonly region?: string;
  readonly postalCode?: string;
  readonly country?: string;
};

/** Une fiche rendue par `navigator.contacts.select` (API Contact Picker). */
export type PickedContact = {
  readonly name?: readonly string[];
  readonly tel?: readonly string[];
  readonly email?: readonly string[];
  readonly address?: readonly PickerAddress[];
};

type ContactsManager = {
  readonly select: (properties: string[], options?: { readonly multiple?: boolean }) => Promise<readonly PickedContact[]>;
  readonly getProperties?: () => Promise<readonly string[]>;
};

export type ContactHost = {
  readonly coque: CoqueNative | undefined;
  readonly nav: { readonly contacts?: Partial<ContactsManager> };
};

const SHELL_PLUGIN = 'MeeshyContacts';
const SHELL_METHOD = 'pick';
const WANTED_PROPERTIES = ['name', 'tel', 'email', 'address'] as const;

export function defaultContactHost(): ContactHost {
  return {
    coque: coqueCourante(),
    nav: typeof navigator === 'undefined' ? {} : (navigator as { readonly contacts?: Partial<ContactsManager> }),
  };
}

const contactsManagerOf = (host: ContactHost): ContactsManager | null => {
  const contacts = host.nav.contacts;
  return typeof contacts?.select === 'function' ? (contacts as ContactsManager) : null;
};

export function contactSourceOf(host: ContactHost): ContactSource {
  if (appelNatifMethode(host.coque, SHELL_PLUGIN, SHELL_METHOD) !== null) return 'shell';
  if (contactsManagerOf(host) !== null) return 'picker';
  return 'file';
}

const nonEmpty = (values: readonly (string | undefined)[] | undefined): string[] =>
  (values ?? []).map((value) => (value ?? '').trim()).filter((value) => value !== '');

const unlabeled = (values: readonly string[]): VCardLabeledValue[] => values.map((value) => ({ label: null, value }));

class UnreadableContactError extends Error {
  constructor() {
    super('Fiche de contact illisible');
  }
}

/** La carte d'une fiche : un nom (ou, à défaut, le premier moyen de joindre). */
const cardOf = (parts: {
  readonly name: string | undefined;
  readonly phones: readonly VCardLabeledValue[];
  readonly emails: readonly VCardLabeledValue[];
  readonly addresses: readonly VCardLabeledValue[];
}): ParsedVCard => {
  const formattedName = (parts.name ?? '').trim() || parts.phones[0]?.value || parts.emails[0]?.value || '';
  if (formattedName === '') throw new UnreadableContactError();
  return { formattedName, phones: parts.phones, emails: parts.emails, urls: [], addresses: parts.addresses };
};

const addressOf = (address: PickerAddress): string =>
  nonEmpty([...(address.addressLine ?? []), address.city, address.region, address.postalCode, address.country]).join(', ');

const fromPicker = (contact: PickedContact): ParsedVCard =>
  cardOf({
    name: nonEmpty(contact.name)[0],
    phones: unlabeled(nonEmpty(contact.tel)),
    emails: unlabeled(nonEmpty(contact.email)),
    addresses: unlabeled(nonEmpty((contact.address ?? []).map(addressOf))),
  });

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Les valeurs étiquetées rendues par la coque — lues, jamais crues. */
const labeledFromShell = (value: unknown): VCardLabeledValue[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new UnreadableContactError();
  return value.flatMap((entry: unknown) => {
    if (!isRecord(entry) || typeof entry.value !== 'string') throw new UnreadableContactError();
    const text = entry.value.trim();
    const label = typeof entry.label === 'string' && entry.label.trim() !== '' ? entry.label.trim() : null;
    return text === '' ? [] : [{ label, value: text }];
  });
};

const fromShell = (payload: unknown): ParsedVCard => {
  if (!isRecord(payload)) throw new UnreadableContactError();
  return cardOf({
    name: typeof payload.name === 'string' ? payload.name : undefined,
    phones: labeledFromShell(payload.phones),
    emails: labeledFromShell(payload.emails),
    addresses: [],
  });
};

const isShellCancel = (error: unknown): boolean => isRecord(error) && error.code === 'CANCELED';

const pickFromShell = async (host: ContactHost): Promise<ParsedVCard | null> => {
  const pick = appelNatifMethode(host.coque, SHELL_PLUGIN, SHELL_METHOD);
  if (pick === null) throw new UnreadableContactError();
  try {
    return fromShell(await pick({}));
  } catch (error) {
    if (isShellCancel(error)) return null;
    throw error;
  }
};

/**
 * `select` exige une activation utilisateur : il s'appelle DANS le geste. Il
 * ne demande que les propriétés que le navigateur sait servir — une
 * propriété inconnue fait rejeter l'appel entier.
 */
const pickFromBrowser = async (host: ContactHost): Promise<ParsedVCard | null> => {
  const manager = contactsManagerOf(host);
  if (manager === null) throw new UnreadableContactError();
  const supported = manager.getProperties ? await manager.getProperties() : ['name', 'tel', 'email'];
  const properties = WANTED_PROPERTIES.filter((property) => supported.includes(property));
  const [contact] = await manager.select(properties, { multiple: false });
  return contact === undefined ? null : fromPicker(contact);
};

/**
 * La fiche que l'utilisateur CHOISIT dans un sélecteur (coque ou navigateur) ;
 * `null` quand il le referme sans choix. Rejette quand la fiche est illisible
 * — le composeur le DIT, jamais une carte vide.
 */
export function pickContact(source: Exclude<ContactSource, 'file'>, host: ContactHost): Promise<ParsedVCard | null> {
  return source === 'shell' ? pickFromShell(host) : pickFromBrowser(host);
}

/** La première carte d'une fiche `.vcf` choisie ; `null` si elle n'en porte aucune. */
export async function contactFromVCardFile(file: File): Promise<ParsedVCard | null> {
  const card = parseVCard(await file.text());
  return card === null || card.formattedName === '' ? null : card;
}

/** La pièce jointe qui part : `text/vcard`, nommée comme le contact (#8142). */
export function contactCardFile(card: ParsedVCard): File {
  return new File([serializeVCard(card)], contactCardFileName(card.formattedName), { type: CONTACT_CARD_MIME_TYPE });
}
