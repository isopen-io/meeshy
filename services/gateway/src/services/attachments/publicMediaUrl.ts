import { STORAGE_KEY_SHAPE } from './mediaUrlNormalization';

/**
 * L'ADRESSE PUBLIQUE D'UN MÉDIA, COMPOSÉE PAR LE SERVEUR (#7022).
 *
 * L'AUTRE MOITIÉ DE LA NORMALISATION. `mediaUrlNormalization.ts` retire de la
 * DONNÉE ce qui n'y a rien à faire — l'hôte, le préfixe d'API, la version
 * (#4324) ; il faut donc que quelqu'un les REPOSE au moment de servir. Les
 * clients web le font déjà (`resolveAttachmentSrc`, `apps/web-v2`) et le
 * legacy aussi (`buildAttachmentUrl`) : ils ont une base configurée.
 *
 * **L'EXTENSION DE NOTIFICATION iOS N'EN A AUCUNE.** Elle reçoit
 * `data.attachmentUrl` et le descend tel quel : une clé de stockage nue n'y est
 * pas une adresse, et le média ne s'attache plus. Précision mesurée sur le
 * lecteur réel (`NotificationPayloadHelpers.resolveRemoteMediaURL`) : un chemin
 * en BARRE INITIALE, lui, est résolu par la NSE elle-même contre son origine de
 * confiance — c'est la clé NUE, et elle seule, qu'elle ne sait pas adresser
 * (elle en ferait `<base>/2026/09/…`, la racine de la passerelle, qui ne sert
 * aucun fichier). C'est ce que le script de
 * normalisation ferait partir À CÔTÉ de la colonne qu'il répare — 964 lignes
 * d'attachement sont absolues aujourd'hui et fonctionnent, elles deviendraient
 * toutes des clés (mesuré le 2026-09-18). La vignette de l'écran verrouillé
 * passerait de « la moitié » à « jamais ».
 *
 * OÙ ELLE S'APPLIQUE, ET OÙ ELLE NE S'APPLIQUE PAS. Sur la CHARGE PUSH
 * (`createNotification` → `data.attachmentUrl`), dont le lecteur n'a pas de
 * base ; et sur la vignette d'un post (`resolvePostMedia`), qui alimente la
 * même charge. JAMAIS sur le `context` PERSISTÉ de la notification : celui-ci
 * est servi à des clients qui composent l'adresse eux-mêmes
 * (`resolveAttachmentSrc` web-v2, `buildAttachmentUrl` legacy,
 * `MeeshyConfig.resolveMediaURL` iOS), et y absolutiser regraverait l'hôte de
 * déploiement dans la donnée — exactement ce que #7022 retire. Deux
 * applications successives sont sans effet : le résultat est absolu, donc
 * inchangé par la seconde.
 *
 * FAIL-CLOSED PAR LA FORME. Seule une clé de l'arborescence DATÉE
 * (`STORAGE_KEY_SHAPE` — le MÊME prédicat que la migration, jamais un second)
 * reçoit la route de flux. Tout le reste garde exactement le comportement qu'il
 * avait : une adresse absolue (CDN tiers, magasin statique) traverse
 * INCHANGÉE, un chemin en barre initiale est simplement posé derrière la base,
 * et une clé d'une autre arborescence (`translated/…`, `avatars/…`) aussi. Une
 * forme dont on ne sait rien n'est jamais réécrite : se tromper d'adresse perd
 * le fichier, alors que la laisser telle quelle ne fait que reconduire l'état
 * antérieur.
 */

/** La route de flux VERSIONNÉE — #4324 : recomposer, c'est poser une route. */
const ATTACHMENT_STREAM_PATH = '/api/v1/attachments/file';

/**
 * La clé est encodée d'UN SEUL coup, barres comprises (`%2F`) — la forme que
 * la passerelle sérialise déjà pour 539 de ses lignes, et celle que
 * `streamSrc` compose côté web (`apps/web-v2/src/lib/api/media-url.ts`). Deux
 * encodages différents pour la même route divergeraient au premier nom de
 * fichier accentué.
 */
export function publicMediaUrl(value: string, base: string): string {
  if (value === '') return value;
  if (/^https?:\/\//i.test(value)) return value;
  const racine = base.replace(/\/$/, '');
  if (value.startsWith('/')) return `${racine}${value}`;
  if (STORAGE_KEY_SHAPE.test(value)) return `${racine}${ATTACHMENT_STREAM_PATH}/${encodeURIComponent(value)}`;
  return `${racine}/${value}`;
}

/**
 * LA MÊME COMPOSITION, LA BASE PRISE DE L'ENVIRONNEMENT (#7022).
 *
 * Le repli `https://gate.meeshy.me` vivait dans `NotificationService`, c'est-à-dire
 * qu'un nom d'hôte de DÉPLOIEMENT était écrit dans un service de domaine — très
 * exactement ce que ce lot retire de la donnée. Il vit désormais à côté de la règle
 * qu'il sert, en un seul endroit : un appelant ne nomme plus jamais d'hôte.
 */
export function publicMediaUrlFromEnv(value: string): string {
  return publicMediaUrl(value, process.env.API_PUBLIC_URL || 'https://gate.meeshy.me');
}
