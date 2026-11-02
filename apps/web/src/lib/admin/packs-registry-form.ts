import type { PackAvailability, PackTargeting } from '@meeshy/shared/types/pack-availability';
import type { PackRegistryOverride } from '@meeshy/shared/types/pack-registry-override';
import { PACK_PRICE_MAX } from '@meeshy/shared/types/content-pack';

import type { RegistryRow } from '@/lib/api/admin-packs-registry';

/**
 * **LE FORMULAIRE D'UNE SURCHARGE** (W17, #11323) — loi pure, sans DOM. Il part
 * de l'entrée SERVIE (`effective`) et rend le correctif au format que la route
 * valide (`PackRegistryOverrideSchema`) : un prix vide retire le prix (`null`),
 * une fenêtre vide la retire, des listes vides retirent le ciblage. Les dates
 * se saisissent et se lisent en UTC (le champ `datetime-local` n'a pas de
 * fuseau : l'écran le dit). Une saisie hors des lois du registre est refusée
 * AVANT le réseau ; la passerelle reste juge (422).
 */
export type RegistryForm = {
  readonly order: string;
  readonly price: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly communities: string;
  readonly countries: string;
  readonly languages: string;
};

const ORDER_MAX = 10_000;

const toLocalInput = (iso: string | undefined): string => (iso === undefined ? '' : iso.slice(0, 16));

const toIso = (local: string): string | null => {
  if (local.trim() === '') return null;
  const date = new Date(`${local}:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const listOf = (value: string): readonly string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');

export function formOfRow(row: RegistryRow): RegistryForm {
  const { effective } = row;
  return {
    order: String(effective.order),
    price: effective.price === null ? '' : String(effective.price),
    startsAt: toLocalInput(effective.availability?.startsAt),
    endsAt: toLocalInput(effective.availability?.endsAt),
    communities: (effective.targeting?.communities ?? []).join(', '),
    countries: (effective.targeting?.countries ?? []).join(', '),
    languages: (effective.targeting?.languages ?? []).join(', '),
  };
}

const integerIn = (value: string, min: number, max: number): number | null => {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return parsed >= min && parsed <= max ? parsed : null;
};

function availabilityOf(form: RegistryForm): PackAvailability | null | 'invalid' {
  const startsAt = toIso(form.startsAt);
  const endsAt = toIso(form.endsAt);
  if ((form.startsAt.trim() !== '' && startsAt === null) || (form.endsAt.trim() !== '' && endsAt === null)) return 'invalid';
  if (startsAt !== null && endsAt !== null && startsAt >= endsAt) return 'invalid';
  if (startsAt === null && endsAt === null) return null;
  return { ...(startsAt !== null ? { startsAt } : {}), ...(endsAt !== null ? { endsAt } : {}) };
}

function targetingOf(form: RegistryForm): PackTargeting | null {
  const communities = listOf(form.communities);
  const countries = listOf(form.countries).map((code) => code.toUpperCase());
  const languages = listOf(form.languages).map((code) => code.toLowerCase());
  const targeting = {
    ...(communities.length > 0 ? { communities } : {}),
    ...(countries.length > 0 ? { countries } : {}),
    ...(languages.length > 0 ? { languages } : {}),
  };
  return Object.keys(targeting).length === 0 ? null : targeting;
}

export function patchOfForm(form: RegistryForm): { readonly ok: true; readonly patch: PackRegistryOverride } | { readonly ok: false } {
  const order = integerIn(form.order, 0, ORDER_MAX);
  const price = form.price.trim() === '' ? null : integerIn(form.price, 1, PACK_PRICE_MAX);
  const availability = availabilityOf(form);
  if (order === null || (form.price.trim() !== '' && price === null) || availability === 'invalid') return { ok: false };
  return { ok: true, patch: { order, price, availability, targeting: targetingOf(form) } };
}
