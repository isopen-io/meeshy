/**
 * Le lecteur d'une requête, avec ceux qu'un blocage sépare de lui (#16894),
 * lus par la même loi que le filtre de liste (`blockedIdsAroundViewer`). Module
 * à part : `postReferences` n'importe que la règle pure, jamais l'annuaire.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { blockedIdsAroundViewer } from '../ContactDirectoryService';
import { wireReaderFromRequest, type WireReader } from './storyEffectsV3';

/**
 * Ce que la loi de séparation INTERROGE, et rien de plus. Le type porte la
 * mesure : une porte qui veut servir la séparation n'a pas besoin d'un client
 * entier, donc l'exiger ferait payer à ses doubles de test une surface qui ne
 * décide de rien.
 */
export type SeparatedReaderPrisma = Pick<PrismaClient, 'user'>;

/**
 * Le lecteur d'une requête, avec ceux qu'un blocage sépare de lui. Sans compte,
 * personne. Une lecture qui échoue fait échouer la requête : on ne sert pas un
 * fil sans savoir ce qu'il doit taire.
 */
export async function readerSeparatedFrom(
  prisma: SeparatedReaderPrisma,
  viewerId: string | undefined,
  reader: WireReader | undefined,
): Promise<WireReader> {
  const separated = viewerId ? await blockedIdsAroundViewer(prisma, viewerId) : [];
  return { ...(reader ?? {}), separatedUserIds: new Set(separated) };
}

/**
 * LE LECTEUR D'UNE PORTE UNITAIRE (#20204).
 *
 * Les dix portes de LISTE paient déjà la lecture des blocages pour leur filtre
 * `authorId: { notIn }` et passent le même ensemble au post servi. Les portes
 * UNITAIRES — la fiche d'une publication, la réponse d'un like ou d'une
 * réaction, la réponse d'une création — n'ont pas de filtre de liste : elles
 * composaient donc leur lecteur par `wireReaderFromRequest` seul, dont la
 * séparation est ABSENTE, et servaient la source republiée d'un auteur séparé
 * et ses commentaires en aperçu.
 *
 * Cette fonction est la forme que ces portes doivent appeler. Elle compose les
 * deux moitiés d'un lecteur — la négociation de scène (en-tête de capacités,
 * langue) ET la séparation — pour qu'il n'y ait PAS de façon d'obtenir la
 * première sans la seconde à ces portes.
 *
 * FERMÉ sur l'échec, par `readerSeparatedFrom` : on ne sert pas une
 * publication sans savoir ce qu'elle doit taire.
 */
export async function servedWireReader(
  prisma: SeparatedReaderPrisma,
  request: {
    readonly headers: { readonly [name: string]: unknown };
    readonly authContext?: {
      readonly userLanguage?: string;
      readonly registeredUser?: { readonly id?: string } | null;
    } | null;
  },
): Promise<WireReader> {
  return readerSeparatedFrom(
    prisma,
    request.authContext?.registeredUser?.id,
    wireReaderFromRequest({ headers: request.headers, authContext: request.authContext ?? undefined }),
  );
}
