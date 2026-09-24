/**
 * Ce qu'une clé de préférence EST — son type, ses valeurs permises, ses bornes,
 * son défaut — lu dans le schéma zod qui la valide, et nulle part ailleurs
 * (#7845).
 *
 * ## Pourquoi un module à part du registre
 *
 * `preference-registry.ts` range ses sept schémas sous un type STRUCTUREL
 * (`PreferenceSchema` : `parse`, `partial`, `strict`) — c'est ce qui lui permet
 * de les tenir dans une seule table sans réinstancier un générique par ligne.
 * `z.toJSONSchema` demande, lui, l'objet zod CONCRET. Le lui donner depuis le
 * registre obligerait à y réintroduire le type zod, ou à caster ; le garder ici,
 * importé depuis la même source (`@meeshy/shared/types/preferences`), ne coûte
 * rien et laisse le registre tel qu'il est.
 *
 * ## Pourquoi calculé une fois, au chargement du module
 *
 * Un schéma ne change pas entre deux requêtes. Recalculer sept descriptions à
 * chaque ouverture de fiche serait un travail sans effet — et le témoin qui
 * les parcourt lit la même constante que la route.
 *
 * ## Ce qui est servi
 *
 * `type`, `enum`, `minimum`, `maximum`, `default` — ce dont un éditeur a besoin
 * pour choisir son contrôle (interrupteur, liste, nombre borné, texte) et
 * afficher la valeur d'usine. Le reste de la description JSON (`pattern`,
 * `items`, `propertyNames`, `not`…) n'est pas un contrat que l'administration
 * lit : le SERVEUR valide, avec le même `.strict()` que `/me`, et c'est son
 * refus nommé qui fait foi.
 *
 * `io: 'input'` : la forme que le corps d'un `PATCH` doit avoir, pas celle que
 * le parseur rend — un champ `.default()` y est facultatif, ce qui est vrai
 * d'une écriture partielle.
 */
import { z } from 'zod';
import {
  PrivacyPreferenceSchema,
  AudioPreferenceSchema,
  MessagePreferenceSchema,
  NotificationPreferenceSchema,
  VideoPreferenceSchema,
  DocumentPreferenceSchema,
  ApplicationPreferenceSchema,
} from '@meeshy/shared/types/preferences';
import type { PreferenceCategory } from './preference-registry';

/** La description d'UN champ, réduite à ce qu'un éditeur lit. */
export type PreferenceFieldDescriptor = {
  readonly type?: string;
  readonly enum?: readonly unknown[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly default?: unknown;
};

const CLES_SERVIES = ['type', 'enum', 'minimum', 'maximum', 'default'] as const;

function projeterChamp(brut: unknown): PreferenceFieldDescriptor {
  if (typeof brut !== 'object' || brut === null) return {};
  const champ = brut as Record<string, unknown>;
  return Object.fromEntries(
    CLES_SERVIES.filter((cle) => champ[cle] !== undefined).map((cle) => [cle, champ[cle]])
  );
}

function decrire(schema: z.ZodType): Readonly<Record<string, PreferenceFieldDescriptor>> {
  const json = z.toJSONSchema(schema, { io: 'input' }) as { properties?: Record<string, unknown> };
  return Object.fromEntries(
    Object.entries(json.properties ?? {}).map(([cle, champ]) => [cle, projeterChamp(champ)])
  );
}

export const PREFERENCE_DESCRIPTORS: Readonly<
  Record<PreferenceCategory, Readonly<Record<string, PreferenceFieldDescriptor>>>
> = {
  privacy: decrire(PrivacyPreferenceSchema),
  audio: decrire(AudioPreferenceSchema),
  message: decrire(MessagePreferenceSchema),
  notification: decrire(NotificationPreferenceSchema),
  video: decrire(VideoPreferenceSchema),
  document: decrire(DocumentPreferenceSchema),
  application: decrire(ApplicationPreferenceSchema),
};
