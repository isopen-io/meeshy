/**
 * Le pont ✦ — la forme qui survit au Prisme — et l'appel en cours (Scène) sur le rang.
 *
 * Contrat gelé, définitions reprises mot pour mot.
 * @see tasks/lentille-implementation-contract.md §3.2 (pont) et §3.3 (appel en cours)
 */
import { z } from 'zod'

/**
 * export type ConversationBridgeData = {
 *   authors: string[];            // 2 au plus
 *   extraAuthorCount: number;     // le « +N »
 *   messageCount: number;
 *   mediaCounts?: { images?: number; audio?: number; files?: number };
 * };
 */
export const ConversationBridgeDataSchema = z.object({
  authors: z.array(z.string()).max(2),
  extraAuthorCount: z.number().int().nonnegative(),
  messageCount: z.number().int().nonnegative(),
  mediaCounts: z
    .object({
      images: z.number().int().nonnegative().optional(),
      audio: z.number().int().nonnegative().optional(),
      files: z.number().int().nonnegative().optional(),
    })
    .optional(),
})
export type ConversationBridgeData = z.infer<typeof ConversationBridgeDataSchema>

/**
 * export type ConversationBridge = {
 *   kind: 'agent' | 'fallback';
 *   unreadCount: number;                    // le chiffre vit ICI, plus dans un badge
 *   suggestedMode: 'focal' | 'resume';      // décision d'orchestrateur précalculée
 *
 *   // kind === 'fallback' — des DONNÉES, formatées par l'i18n du client.
 *   // Rien à traduire : la phrase naît déjà dans la langue du lecteur.
 *   data?: ConversationBridgeData;
 *
 *   // kind === 'agent' — une vraie phrase, donc soumise au Prisme.
 *   // MÊME paire que `lastMessagePreview` : le client réapplique
 *   // `resolveLastMessagePreview()`. Aucune loi de langue nouvelle.
 *   text?: string;
 *   translations?: Record<string, string>;
 *   originalLanguage?: string;
 * };
 *
 * Un champ s'ajoute au contrat gelé (REV-1, blocage 6) :
 *
 *   isComplete?: boolean;   // absent = complet
 *
 * La partialité doit voyager JUSQU'AU RANG, avec le pont qu'elle qualifie.
 * `LocalBridgeProvider` (le substitut, borné aux messages déjà en cache) rend
 * un pont dont la fenêtre de calcul ne couvre pas forcément tout l'intervalle
 * non lu ; le rang porte alors la mention « sur les N derniers messages »,
 * jamais un chiffre extrapolé. Portée par une enveloppe de retour du provider,
 * cette qualification se serait perdue dès la première mise en cache du pont,
 * dès son passage par le socket, dès son entrée dans un modèle de liste — le
 * rang aurait affiché un décompte partiel comme un décompte total.
 *
 * ABSENT = COMPLET, et non `false` : le gateway (`GatewayBridgeProvider`,
 * G-124) calcule sur toute la fenêtre non lue et n'a rien à annoncer ; un
 * client ancien qui ignore le champ lit donc la vérité par défaut, et aucun
 * pont déjà en circulation n'a besoin d'être réécrit.
 */
const BaseConversationBridgeSchema = z.object({
  kind: z.enum(['agent', 'fallback']),
  unreadCount: z.number().int().nonnegative(),
  suggestedMode: z.enum(['focal', 'resume']),
  isComplete: z.boolean().optional(),
  data: ConversationBridgeDataSchema.optional(),
  text: z.string().optional(),
  translations: z.record(z.string(), z.string()).optional(),
  originalLanguage: z.string().optional(),
})

export const ConversationBridgeSchema = BaseConversationBridgeSchema.superRefine((data, ctx) => {
  if (data.kind === 'fallback' && !data.data) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "kind 'fallback' requires 'data' to be present",
      path: ['data'],
    })
  }
  if (data.kind === 'agent' && !data.text) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "kind 'agent' requires 'text' to be present",
      path: ['text'],
    })
  }
})
export type ConversationBridge = z.infer<typeof BaseConversationBridgeSchema>

/**
 * export type ConversationLiveCall = {
 *   voices: number;      // participants qui parlent ou écoutent
 *   startedAt: string;   // ISO — le client calcule « depuis 12 min » via le ticker 60 s existant
 *   joined: boolean;     // false → bouton Rejoindre ; true → rien de plus
 * };
 *
 * Placement : §3.3 ne nomme pas de fichier dédié et C-010 n'attribue que
 * `reading-modes.ts` et `conversation-bridge.ts`. `ConversationLiveCall` est
 * une donnée éphémère « sur le rang », comme le pont — elle est colocalisée
 * ici plutôt que dans `reading-modes.ts`, qui porte le catalogue des modes.
 */
export const ConversationLiveCallSchema = z.object({
  voices: z.number().int().nonnegative(),
  startedAt: z.iso.datetime(),
  joined: z.boolean(),
})
export type ConversationLiveCall = z.infer<typeof ConversationLiveCallSchema>
