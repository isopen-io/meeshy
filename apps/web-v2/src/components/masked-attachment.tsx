import type { Attachment } from '@/lib/api/types';
import { TRANSCRIPT_TEXT_OPACITY } from '@/lib/reading-mode/metrics';
import { kindOf } from '@/lib/view/message';

import { Glyph } from './glyph';

/**
 * LE SUBSTITUT D'UNE PIÈCE MASQUÉE (#6189) — EXTRAIT d'`attachment-
 * blocks.tsx` (#6221, § 5 étape 3) : `media-grid.tsx` en a besoin pour
 * REMPLIR une case de la grille, et `attachment-blocks.tsx` en a besoin pour
 * un vocal/fichier masqué HORS grille — un import circulaire entre les deux
 * aurait suivi si ce composant était resté logé chez l'un des deux.
 *
 * Ce qui ne sort PAS, et c'est la liste du cycle 125 : le fichier, son URL,
 * sa vignette, son NOM d'origine, sa TAILLE, sa DURÉE. « Une protection de
 * contenu se mesure sur tout ce que la charge TRANSPORTE, jamais sur sa
 * seule chaîne. »
 *
 * Ce qui sort : le TYPE (une photo, un vocal, un fichier) et le fait qu'elle
 * est protégée. Le type seul ne dit rien du contenu et rend le substitut
 * lisible — c'est ce que fait la bannière serveur, qui sert « 👁️ 🖼️ ».
 *
 * `fill` (#6221) — DANS une grille, le substitut REMPLIT sa case (la cote
 * est celle de la MISE EN PAGE, pas de la pièce, D-41 tenu) ; HORS grille
 * (vocal/fichier masqué), il garde son côté FIXE historique
 * (`MASKED_TILE_SIZE`).
 *
 * PAS D'AFFORDANCE DE RÉVÉLATION dans ce lot : la fenêtre de 5 s d'iOS
 * (`FocalAttachmentBlock.swift`, `isRevealed`) suppose une consommation
 * serveur par PIÈCE que le web n'appelle pas encore. Un bouton qui ne
 * révèle rien serait un contrôle inerte — la loi 4 l'interdit. Suivi #6189.
 */
const MASKED_TILE_SIZE = 140;

export function MaskedAttachment({ attachment, fill = false }: { readonly attachment: Attachment; readonly fill?: boolean }) {
  const kind = kindOf(attachment);
  const libelle = kind === 'audio' ? 'Vocal protégé' : kind === 'image' ? 'Photo protégée' : 'Pièce protégée';
  const glyphe = kind === 'audio' ? 'microphone' : kind === 'image' ? 'image' : 'file';

  return (
    <div
      data-media-tile
      data-protected-attachment="hidden"
      role="img"
      aria-label={libelle}
      className={`flex items-center justify-center gap-2 rounded-2xl ${fill ? 'size-full' : ''}`}
      style={
        fill
          ? { backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)' }
          : {
              width: MASKED_TILE_SIZE,
              height: MASKED_TILE_SIZE,
              maxWidth: '100%',
              backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
            }
      }
    >
      <span className="flex flex-col items-center gap-1" style={{ opacity: TRANSCRIPT_TEXT_OPACITY }}>
        <Glyph name={glyphe} size={24} />
        <Glyph name="eyeSlash" size={14} />
        <span className="text-mini">{libelle}</span>
      </span>
    </div>
  );
}
