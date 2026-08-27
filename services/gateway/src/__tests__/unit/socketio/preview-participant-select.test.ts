/**
 * Cliquet — la projection du participant de l'aperçu poussé n'oublie AUCUNE de
 * ses deux SSOT.
 *
 * `PREVIEW_PARTICIPANT_SELECT` est le seul site du dépôt qui compose DEUX
 * sources de vérité déclarant chacune leur propre `user` :
 * `PREVIEW_PRISM_PARTICIPANT_SELECT` (les préférences de langue, sans quoi il
 * n'y a pas de Prisme à résoudre) et `HISTORY_FLOOR_PARTICIPANT_SELECT` (ce qui
 * décide du plancher d'historique de chaque lecteur, `User.role` compris depuis
 * #3892). Un spread naïf fait gagner la DERNIÈRE, et perd l'autre en silence —
 * c'est exactement le défaut que #3892 a trouvé ici.
 *
 * La fusion explicite le corrige et FIGE la liste : un champ ajouté demain à
 * l'un des deux `select.user` n'arrivera pas ici, et rien ne rougira. `tsc` ne
 * voit que la moitié Prisme (`PreviewPrismParticipant` l'exige) ;
 * `HistoryFloorJoin.user` est OPTIONNEL, donc la perte de son côté compile
 * parfaitement — un « appelant qui ne charge pas un champ obtient le verdict
 * qu'aurait rendu son absence », soit ici un bypass ADMIN/BIGBOSS mort.
 *
 * Ce témoin compare les DEUX valeurs plutôt que de lister les clés à la main :
 * il tombe pour un champ qui n'existe pas encore. Jumeau de
 * `routes/links/prisma-queries.test.ts` § « étale
 * HISTORY_FLOOR_PARTICIPANT_SELECT », le seul des deux sites que #3892 avait
 * gardé.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { PREVIEW_PARTICIPANT_SELECT } from '../../../socketio/emitConversationPreviewUpdate';
import { HISTORY_FLOOR_PARTICIPANT_SELECT } from '../../../services/historyFloor';
import { PREVIEW_PRISM_PARTICIPANT_SELECT } from '../../../socketio/utils/lastMessagePreviewPrism';

const select = PREVIEW_PARTICIPANT_SELECT as Record<string, any>;

describe('PREVIEW_PARTICIPANT_SELECT — les deux SSOT survivent au double spread', () => {
  it('balaie bien deux SSOT NON VIDES qui déclarent chacune un `user`', () => {
    // Une garde de comparaison reste verte si les deux côtés sont vides.
    expect(Object.keys(HISTORY_FLOOR_PARTICIPANT_SELECT).length).toBeGreaterThan(0);
    expect(Object.keys(PREVIEW_PRISM_PARTICIPANT_SELECT).length).toBeGreaterThan(0);
    expect((HISTORY_FLOOR_PARTICIPANT_SELECT as Record<string, any>).user).toBeTruthy();
    expect((PREVIEW_PRISM_PARTICIPANT_SELECT as Record<string, any>).user).toBeTruthy();
  });

  it('porte tout HISTORY_FLOOR_PARTICIPANT_SELECT hors `user`', () => {
    for (const [key, value] of Object.entries(HISTORY_FLOOR_PARTICIPANT_SELECT)) {
      if (key === 'user') continue;
      expect(select[key]).toEqual(value);
    }
  });

  it('porte tout PREVIEW_PRISM_PARTICIPANT_SELECT hors `user`', () => {
    for (const [key, value] of Object.entries(PREVIEW_PRISM_PARTICIPANT_SELECT)) {
      if (key === 'user') continue;
      expect(select[key]).toEqual(value);
    }
  });

  it('son `user` est le SUPERSET des deux `user` — aucune moitié ne gagne', () => {
    const merged = select.user.select as Record<string, unknown>;
    const halves = [HISTORY_FLOOR_PARTICIPANT_SELECT, PREVIEW_PRISM_PARTICIPANT_SELECT] as ReadonlyArray<
      Record<string, any>
    >;

    for (const half of halves) {
      for (const [key, value] of Object.entries(half.user.select as Record<string, unknown>)) {
        expect(merged[key]).toEqual(value);
      }
    }
  });

  it('`role` y est — sans lui le bypass plateforme du plancher (#3892) est MORT et muet', () => {
    expect(select.user.select.role).toBe(true);
  });
});
