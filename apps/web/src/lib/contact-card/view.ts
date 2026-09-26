import {
  VCARD_KNOWN_LABELS,
  type ContactRelation,
  type ParsedVCard,
  type VCardKnownLabel,
} from '@meeshy/shared/types/contact-card';

import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **CE QUE LA CARTE DE VISITE MONTRE, ET CE QU'ELLE OFFRE** (#8101) — pur,
 * partagé par la bulle et la fiche : les deux surfaces offrent les MÊMES
 * gestes pour la même relation, et une seule table en décide.
 */

export type ContactAction = 'connect' | 'write';

type StateKey = Extract<InterfaceCatalogKey, `contactCard.state.${string}`>;
type FieldKey = Extract<InterfaceCatalogKey, `contactCard.field.${string}`>;
type LabelKey = Extract<InterfaceCatalogKey, `contactCard.label.${string}`>;

export type ContactRelationView = {
  /** Les boutons offerts, dans l'ordre d'affichage. */
  readonly actions: readonly ContactAction[];
  /** Un état dit en texte, jamais en bouton (une demande en attente). */
  readonly state: StateKey | null;
};

const RELATION_VIEWS: Readonly<Record<ContactRelation, ContactRelationView>> = {
  self: { actions: [], state: 'contactCard.state.self' },
  friend: { actions: ['write'], state: null },
  'request-sent': { actions: ['write'], state: 'contactCard.state.requestSent' },
  'request-received': { actions: ['write'], state: 'contactCard.state.requestReceived' },
  none: { actions: ['connect', 'write'], state: null },
};

export function contactRelationView(relation: ContactRelation): ContactRelationView {
  return RELATION_VIEWS[relation];
}

export type VCardFieldKind = 'phone' | 'email' | 'url' | 'address' | 'birthday' | 'note' | 'organization' | 'title';

export type VCardFieldRow = {
  readonly key: string;
  readonly kind: VCardFieldKind;
  /** Libellé AFFICHÉ, déjà localisé (ou le libellé libre de l'auteur). */
  readonly label: string;
  readonly value: string;
};

const FIELD_KEYS: Readonly<Record<VCardFieldKind, FieldKey>> = {
  phone: 'contactCard.field.phone',
  email: 'contactCard.field.email',
  url: 'contactCard.field.url',
  address: 'contactCard.field.address',
  birthday: 'contactCard.field.birthday',
  note: 'contactCard.field.note',
  organization: 'contactCard.field.organization',
  title: 'contactCard.field.title',
};

const LABEL_KEYS: Readonly<Record<VCardKnownLabel, LabelKey>> = {
  mobile: 'contactCard.label.mobile',
  home: 'contactCard.label.home',
  work: 'contactCard.label.work',
  main: 'contactCard.label.main',
  iphone: 'contactCard.label.iphone',
  fax: 'contactCard.label.fax',
  pager: 'contactCard.label.pager',
  other: 'contactCard.label.other',
};

const isKnownLabel = (label: string): label is VCardKnownLabel =>
  (VCARD_KNOWN_LABELS as readonly string[]).includes(label);

/** « Téléphone · mobile », « E-mail · Perso » — le type du champ, puis son libellé. */
function fieldLabel(language: InterfaceLanguage, kind: VCardFieldKind, label: string | null): string {
  const base = translate(language, FIELD_KEYS[kind]);
  if (label === null) return base;
  const qualifier = isKnownLabel(label) ? translate(language, LABEL_KEYS[label]) : label;
  return `${base} · ${qualifier}`;
}

/** TOUS les champs de la carte, dans l'ordre de lecture d'une fiche de contact. */
export function vcardFieldRows(card: ParsedVCard, language: InterfaceLanguage): VCardFieldRow[] {
  const single = (kind: VCardFieldKind, value: string | undefined): VCardFieldRow[] =>
    value ? [{ key: kind, kind, label: fieldLabel(language, kind, null), value }] : [];
  const labeled = (kind: VCardFieldKind, values: readonly { readonly label: string | null; readonly value: string }[]) =>
    values.map((entry, index) => ({
      key: `${kind}-${index}`,
      kind,
      label: fieldLabel(language, kind, entry.label),
      value: entry.value,
    }));
  return [
    ...labeled('phone', card.phones),
    ...labeled('email', card.emails),
    ...single('organization', card.organization),
    ...single('title', card.title),
    ...labeled('address', card.addresses),
    ...card.urls.map((value, index) => ({ key: `url-${index}`, kind: 'url' as const, label: fieldLabel(language, 'url', null), value })),
    ...single('birthday', card.birthday),
    ...single('note', card.note),
  ];
}

/** Deux initiales au plus — « Awa Diallo » → « AD », « +33… » → « # ». */
export function contactInitials(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((word) => word.match(/\p{L}/u)?.[0] ?? '')
    .filter(Boolean);
  if (letters.length === 0) return '#';
  const first = letters[0] ?? '';
  const last = letters.length > 1 ? (letters[letters.length - 1] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}
