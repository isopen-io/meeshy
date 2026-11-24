/**
 * CE QUE LE SANG OUVRE, EN UNE LISTE VERSIONNÉE (#20362, directive porteur du 2026-11-22).
 *
 * Le rituel du Sang ne recueille plus quatre accords séparés : il recueille UN accord, à la
 * liste entière de ce que le palier ouvre, et la version de cette liste est la preuve de ce
 * qui a été montré (#14402). Changer la liste, c'est changer sa version : un accord donné à
 * une version antérieure ne vaut pas pour la nouvelle.
 *
 * La liste est celle du verrou (`RELATION_BLOOD_LOCKED_FEATURES`) : ce qu'on accepte au
 * rituel est exactement ce qui ne se coupe plus entre Sangs.
 */
import type { RelationFeature } from './relation-levels.js';

export const BLOOD_BUNDLE_VERSION = '2026-11-22' as const;

export const BLOOD_BUNDLE_FEATURES: readonly RelationFeature[] = [
  'location.live',
  'location.history',
  'location.proximity',
  'device.battery',
  'device.battery.pull',
  'device.unreachable',
  'device.call',
  'safety.inactivity',
  'health.fall',
  'listening.category',
  'listening.title',
  'talkie',
  'bring',
  'together',
];

export const isCurrentBloodBundle = (version: unknown): boolean => version === BLOOD_BUNDLE_VERSION;
