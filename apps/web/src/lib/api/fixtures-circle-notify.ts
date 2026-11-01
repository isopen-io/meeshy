import { CIRCLE_NOTIFY_DEFAULTS, type RelationAudienceChoice } from '@meeshy/shared/utils/relation-levels';

import type { CircleNotifyEdit, CircleNotifyPreferences } from './circle-notify-preferences';

/**
 * **LE LECTEUR DE RECETTE, SON ENTOURAGE PRÉVENU** (#14063) — servi par le
 * même chemin que la passerelle (`circle-notify-preferences.ts`), élagué de
 * tout build `VITE_DATA_SOURCE=gateway`. Il part des défauts partagés ; une
 * écriture tient le temps de l'onglet.
 */

const state: { preferences: CircleNotifyPreferences } = { preferences: CIRCLE_NOTIFY_DEFAULTS };

export function fixtureCircleNotify(): CircleNotifyPreferences {
  return state.preferences;
}

export function fixturePatchCircleNotify(edit: CircleNotifyEdit): RelationAudienceChoice {
  state.preferences = { ...state.preferences, [edit.key]: edit.value };
  return edit.value;
}
