/**
 * Les PLANS de projection sont-ils cohérents avec les `select` qu'ils projettent ? (#4173)
 *
 * ## Le défaut que ce fichier attrape, et qu'aucun autre témoin ne peut voir
 *
 * `selectForFields` PROJETTE le littéral : une colonne nommée dans
 * `ColumnPlan.columns` mais absente de `full` est simplement IGNORÉE. Le
 * symptôme n'est donc ni une erreur ni un test rouge — c'est un champ SERVI
 * dont la colonne n'a jamais été chargée, qui sort `null`. La loi le dit
 * elle-même : « Un champ que le schéma DÉCLARE et que la requête ne CHARGE pas
 * sort absent, et le symptôme est un champ manquant, pas une erreur. »
 *
 * Une faute de frappe dans une carte de dix-huit entrées (celle de
 * `participants`) se paierait donc en silence, sur la seule collection dont la
 * ligne servie est FABRIQUÉE — c'est-à-dire celle où l'on ne peut pas relire la
 * carte en la comparant au `select`.
 *
 * Ces témoins sont MÉCANIQUES : ils parcourent les vocabulaires plutôt que d'en
 * geler une copie. Un champ ajoué demain est couvert le jour où il est ajouté.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { selectForFields } from '../../../utils/sparse-fieldset';
import { syncMessagePlan, SYNC_MESSAGE_SERVED_FIELDS } from '../../../routes/sync/messages';
import { syncConversationPlan, SYNC_CONVERSATION_SERVED_FIELDS } from '../../../routes/sync/conversations';
import { syncReactionPlan, SYNC_REACTION_SERVED_FIELDS } from '../../../routes/sync/reactions';
import { syncParticipantPlan, SYNC_PARTICIPANT_SERVED_FIELDS } from '../../../routes/sync/participants';
import {
  conversationDetailPlan,
  CONVERSATION_DETAIL_SERVED_FIELDS,
} from '../../../routes/conversations/core-detail';

const PLANS = [
  ['conversations/{id}', conversationDetailPlan, CONVERSATION_DETAIL_SERVED_FIELDS],
  ['sync/messages', syncMessagePlan, SYNC_MESSAGE_SERVED_FIELDS],
  ['sync/conversations', syncConversationPlan, SYNC_CONVERSATION_SERVED_FIELDS],
  ['sync/reactions', syncReactionPlan, SYNC_REACTION_SERVED_FIELDS],
  ['sync/participants', syncParticipantPlan, SYNC_PARTICIPANT_SERVED_FIELDS],
] as const;

describe('#4173 — chaque colonne DÉCLARÉE par un plan existe dans le `select` qu’il projette', () => {
  it.each(PLANS.map(([nom, plan]) => [nom, plan] as const))(
    '%s : aucune colonne fantôme dans `columns` ni dans `pinned`',
    (_nom, plan) => {
      const colonnes = Object.keys(plan.full);
      for (const colonne of plan.pinned) expect(colonnes).toContain(colonne);
      for (const [cle, source] of Object.entries(plan.columns ?? {})) {
        for (const colonne of source) {
          // Le message d'échec doit NOMMER la clé fautive : une carte de
          // dix-huit entrées ne se relit pas à l'œil.
          expect({ cle, colonne, existe: colonnes.includes(colonne) })
            .toEqual({ cle, colonne, existe: true });
        }
      }
    },
  );

  it.each(PLANS)(
    '%s : demander UNE clé charge TOUTES les colonnes que le plan lui attribue',
    (_nom, plan, vocabulaire) => {
      for (const cle of vocabulaire) {
        const attendues = plan.columns?.[cle] ?? [cle];
        const charge = Object.keys(selectForFields(plan, new Set([cle])));
        const manquantes = attendues.filter((colonne) => !charge.includes(colonne));
        // Une clé FABRIQUÉE (tableau vide) n'attend rien, et passe donc ce
        // témoin sans exception à écrire : `[]` n'a aucune colonne manquante.
        expect({ cle, manquantes }).toEqual({ cle, manquantes: [] });
      }
    },
  );

  it.each(PLANS)(
    '%s : aucune clé du vocabulaire n’est SILENCIEUSE — soit elle a une colonne, soit elle est déclarée FABRIQUÉE',
    (_nom, plan, vocabulaire) => {
      // La différence avec le témoin précédent : celui-ci attrape la clé qu'on
      // aurait ajoutée au vocabulaire en OUBLIANT de l'inscrire au plan, alors
      // qu'aucune colonne ne porte son nom. Elle sortirait toujours `null`.
      const orphelines = vocabulaire.filter((cle) => {
        const declaree = plan.columns?.[cle];
        if (declaree !== undefined) return false; // fabriquée ou cartographiée
        return !(cle in plan.full);
      });
      expect(orphelines).toEqual([]);
    },
  );

  it.each(PLANS)(
    '%s : sans projection, le `select` est le littéral COMPLET — par identité de référence',
    (_nom, plan) => {
      expect(selectForFields(plan, null)).toBe(plan.full);
    },
  );
});
