import { z } from 'zod';

import { normalizeLanguageForDedup } from '../utils/language-normalize.js';

/**
 * LA FORME D'UNE DEMANDE DE JONCTION PAR LIEN — écrite UNE fois, opposable des
 * deux côtés de la frontière.
 *
 * Elle vivait dans `services/gateway/src/routes/anonymous.ts`
 * (`joinAnonymousSchema`), c'est-à-dire hors de portée de tout client. Un
 * formulaire web qui veut refuser AVANT l'aller-retour — ce que le rôle premier
 * exige sur un téléphone en 3G — n'avait alors que deux options, et les deux
 * fabriquent une jumelle : recopier les contraintes (elle dérive au premier
 * `max(50)` déplacé), ou ne rien valider (le lecteur découvre le refus après le
 * voyage). La conception § 2 tranche : « `<form>` natif + **Zod** partagé
 * (`packages/shared`) exécuté serveur ».
 *
 * CE QUE LE SCHÉMA NE DIT PAS, ET QUI N'EST PAS UN OUBLI. Il ne juge ni le
 * lien, ni l'identité, ni les exigences que l'HÔTE a posées
 * (`requireEmail`/`requireBirthday`/`requireNickname`, `allowedLanguages`) :
 * celles-là dépendent de la ligne `ConversationShareLink`, que seul le serveur
 * lit — c'est la même séparation que celle du doc-tête de
 * `services/conversations/linkAdmission.ts`, où la loi d'ACCÈS ne prend aucun
 * corps de requête. Ce schéma est la loi de FORME, et rien d'autre.
 *
 * `birthday` attend un instant ISO COMPLET. Un `<input type="date">` rend
 * `YYYY-MM-DD` : la conversion appartient au client, et le fait qu'elle soit
 * NÉCESSAIRE ne se découvre qu'en lisant ce schéma — raison de plus pour qu'il
 * soit lisible d'ailleurs que du service.
 *
 * La LANGUE est canonicalisée ici, jamais chez l'appelant : elle alimente
 * l'ensemble des cibles de traduction (`MessageTranslationService`), clé en
 * minuscules et sans sous-étiquette de région. Un `fr-FR` stocké verbatim y
 * injecterait une cible NLLB qui ne matche jamais — un défaut de Prisme
 * (règle 1) écrit à la frontière d'écriture.
 */
export const linkJoinProfileSchema = z.object({
  firstName: z.string().min(1, 'Le prenom est requis').max(50),
  lastName: z.string().min(1, 'Le nom est requis').max(50),
  username: z.string().optional(),
  email: z.email().optional().or(z.literal('')),
  birthday: z.iso.datetime().optional().or(z.literal('')),
  language: z
    .string()
    .transform((valeur) => normalizeLanguageForDedup(valeur))
    .default('fr'),
  deviceFingerprint: z.string().optional(),
});

export type LinkJoinProfileInputShape = z.input<typeof linkJoinProfileSchema>;
export type LinkJoinProfileShape = z.output<typeof linkJoinProfileSchema>;
