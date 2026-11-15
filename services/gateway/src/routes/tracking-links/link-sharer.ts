import type { ResolvedLinkTarget } from '../../services/TrackingLinkService';

/**
 * **QUI A PARTAGÉ CE CONTENU** (#9149) — l'identité PUBLIQUE du créateur d'un
 * lien de partage, servie par `GET /tracking-links/:token/resolve` à la page
 * qui l'ouvre, connectée ou non : « Alice vous a partagé ce réel ».
 *
 * Elle ne nomme quelqu'un que pour un partage de CONTENU — publication, réel,
 * story, humeur — d'un lien encore actif, et d'un partageur encore actif. Un
 * lien vers une adresse externe peut être né dans un message privé : en nommer
 * l'auteur révélerait qui parle dans une conversation à quiconque tient le
 * jeton. Une invitation de conversation a sa propre page.
 *
 * Ce qui sort est fermé par construction : trois champs, jamais l'identifiant
 * (`sharerId` reste hors du schéma de réponse), jamais la présence — la
 * visibilité de la présence ne s'ouvre pas par un lien (CLAUDE.md racine,
 * § Visibilité de la présence).
 */

export type LinkSharer = {
  readonly displayName: string | null;
  readonly username: string;
  readonly avatar: string | null;
};

const SHARED_CONTENT_TYPES: ReadonlySet<string> = new Set(['POST', 'REEL', 'STORY', 'STATUS']);

export function sharerToName(resolved: ResolvedLinkTarget): string | null {
  if (resolved.kind !== 'tracking' || !resolved.isActive) return null;
  if (!SHARED_CONTENT_TYPES.has(resolved.targetType)) return null;
  return resolved.sharerId;
}

type SharerRow = {
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
  readonly isActive: boolean;
  readonly deletedAt: Date | null;
  readonly deactivatedAt: Date | null;
};

export type LinkSharerPrisma = {
  readonly user: {
    readonly findUnique: (args: {
      where: { id: string };
      select: { username: true; displayName: true; avatar: true; isActive: true; deletedAt: true; deactivatedAt: true };
    }) => Promise<SharerRow | null>;
  };
};

export async function resolveLinkSharer(prisma: LinkSharerPrisma, resolved: ResolvedLinkTarget): Promise<LinkSharer | null> {
  const sharerId = sharerToName(resolved);
  if (sharerId === null) return null;
  const user = await prisma.user.findUnique({
    where: { id: sharerId },
    select: { username: true, displayName: true, avatar: true, isActive: true, deletedAt: true, deactivatedAt: true },
  });
  if (user === null || !user.isActive || user.deletedAt !== null || user.deactivatedAt !== null) return null;
  return { displayName: user.displayName ?? null, username: user.username, avatar: user.avatar ?? null };
}
