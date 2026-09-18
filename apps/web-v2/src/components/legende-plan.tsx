import { useMemo, useRef, useState } from 'react';

import { Glyph } from '@/components/glyph';
import { ComposerLanguagePill } from '@/components/composer-language-pill';
import { LanguageSheet } from '@/components/language-sheet';
import { previewUrlFor } from '@/lib/send/attachment-preview-url';
import type { PendingAttachment } from '@/lib/send/attachments';
import type { ComposeProtection } from '@/lib/send/compose-protection';
import { envoisLegendes, type IntentionEnvoi, type LegendeSaisie } from '@/lib/send/legendes';

/**
 * **LE PLAN DE LÉGENDAGE** (#6956) — plein écran, ouvert au moment de la
 * SÉLECTION, où l'auteur écrit une légende par image avant de les envoyer.
 *
 * Directive porteur du 2026-09-18 :
 *
 * > « Au moment de la sélection de l'attachement, ouvrir en plein écran avec
 * > listing des images dans l'ordre de sélection en bas et en dessous la zone
 * > de saisie de légende. On entre la légende ou non et on envoie le ou les
 * > attachements. »
 *
 * ```
 * ┌──────────────────────────┐
 * │      image en grand      │
 * ├──────────────────────────┤
 * │  [▪] [▫] [▫] [▫]         │  la pellicule, ordre de SÉLECTION
 * ├──────────────────────────┤
 * │  🇫🇷  légende…        ➤   │  la saisie, sous la pellicule
 * └──────────────────────────┘
 * ```
 *
 * ## Ce que ce composant NE décide pas
 *
 * Le découpage d'une sélection en N envois est une LOI, pas un rendu : elle
 * vit dans `lib/send/legendes.ts`, se mesure sans navigateur, et ce plan ne
 * fait que l'appeler à la validation. L'ordre des envois, la langue portée par
 * chaque légende et le sort d'une saisie orpheline s'y prouvent par mutation.
 *
 * ## L'aperçu est LOCAL — rien n'attend le réseau
 *
 * `previewUrlFor` (site unique de `URL.createObjectURL`, mémoïsé par `localId`)
 * rend l'image immédiatement : l'auteur tape sa légende pendant que rien n'a
 * encore été téléversé. Une lenteur est un BUG (CLAUDE.md, dimension 2) — faire
 * attendre l'upload avant d'autoriser la frappe en serait une, et le dépôt
 * chiffre le coût : ~80 s pour une photo de 4 Mo sur Fast 3G.
 *
 * Ce plan ne RÉVOQUE aucune URL : elles sont partagées avec la bulle optimiste
 * (`attachmentPreviewOf`), et la révocation reste au geste qui sait qu'elle ne
 * sert plus jamais — retirer la pièce.
 */
export type LegendePlanProps = {
  readonly pending: readonly PendingAttachment[];
  /** La langue d'écriture du composeur — ce sur quoi retombe une image non
   * légendée. */
  readonly langueParDefaut: string;
  readonly protection: ComposeProtection;
  readonly onAnnuler: () => void;
  readonly onRetirer: (localId: string) => void;
  readonly onEnvoyer: (envois: readonly IntentionEnvoi[]) => void;
};

export function LegendePlan({
  pending,
  langueParDefaut,
  protection,
  onAnnuler,
  onRetirer,
  onEnvoyer,
}: LegendePlanProps) {
  const [page, setPage] = useState(0);
  const [saisies, setSaisies] = useState<readonly LegendeSaisie[]>([]);
  const [choixLangueOuvert, setChoixLangueOuvert] = useState(false);
  const pastilleRef = useRef<HTMLButtonElement>(null);

  /** La page COURANTE est bornée par la sélection : retirer la dernière image
   * pendant qu'on la légende laisserait sinon un index hors du tableau. */
  const index = Math.min(page, Math.max(0, pending.length - 1));
  const courante = pending[index];

  const saisieCourante = useMemo(
    () => saisies.find((s) => s.localId === courante?.localId),
    [saisies, courante?.localId],
  );
  const texte = saisieCourante?.texte ?? '';
  const langue = saisieCourante?.langue ?? langueParDefaut;

  const apercus = useMemo(
    () =>
      pending.map((piece) => ({
        piece,
        url: piece.kind === 'image' ? previewUrlFor(piece.localId, piece.file) : undefined,
      })),
    [pending],
  );

  if (courante === undefined) return null;

  /** Une saisie REMPLACE celle de sa pièce — jamais de doublon dans la liste :
   * la loi garde la dernière, mais laisser le tableau enfler ferait diverger ce
   * qu'on voit de ce qu'on envoie. */
  const noter = (champs: { readonly texte?: string; readonly langue?: string }) => {
    setSaisies((precedentes) => [
      ...precedentes.filter((s) => s.localId !== courante.localId),
      {
        localId: courante.localId,
        texte: champs.texte ?? texte,
        langue: champs.langue ?? langue,
      },
    ]);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Légender les images avant l’envoi"
      data-legende-plan
    >
      <div className="flex items-center justify-between px-2 py-2">
        {/* REVENIR, pas fermer — `caretLeft` dit qu'on retourne d'où l'on
            vient (le composeur garde sa sélection). Le `x` est réservé au
            RETRAIT, sens que `PreviewTile` lui donne déjà dans le tiroir
            (`composer-tray.tsx:398-410`) : deux gestes voisins ne peuvent pas
            porter la même icône. */}
        <button
          type="button"
          onClick={onAnnuler}
          className="grid size-11 place-items-center"
          aria-label="Revenir au composeur sans envoyer"
        >
          <Glyph name="caretLeft" size={20} />
        </button>
        <span className="text-mini opacity-80" data-legende-compteur>
          {index + 1} / {pending.length}
        </span>
        <button
          type="button"
          onClick={() => onRetirer(courante.localId)}
          className="grid size-11 place-items-center"
          aria-label={`Retirer ${courante.name} de l’envoi`}
        >
          <span
            className="grid size-[22px] place-items-center rounded-full text-white"
            style={{ backgroundColor: 'var(--color-error)' }}
            aria-hidden
          >
            <Glyph name="x" size={12} />
          </span>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-2" data-legende-scene>
        {apercus[index]?.url !== undefined ? (
          <img
            src={apercus[index]?.url}
            alt={courante.name}
            className="max-h-full max-w-full object-contain"
            data-legende-image
          />
        ) : (
          <Glyph name={courante.kind === 'audio' ? 'microphone' : 'file'} size={64} />
        )}
      </div>

      {/* LA PELLICULE — dans l'ordre de la SÉLECTION, jamais celui des saisies. */}
      <div
        className="flex gap-2 overflow-x-auto px-3 py-2"
        role="tablist"
        aria-label="Images à envoyer, dans l’ordre de sélection"
        data-legende-pellicule
      >
        {apercus.map(({ piece, url }, i) => (
          <button
            key={piece.localId}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Image ${i + 1} sur ${pending.length} : ${piece.name}`}
            onClick={() => setPage(i)}
            className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-[10px]"
            style={{ outline: i === index ? '2px solid var(--accent)' : 'none', opacity: i === index ? 1 : 0.55 }}
            data-legende-vignette
          >
            {url !== undefined ? (
              <img src={url} alt="" className="size-full object-cover" />
            ) : (
              <Glyph name={piece.kind === 'audio' ? 'microphone' : 'file'} size={22} />
            )}
          </button>
        ))}
      </div>

      {/* LA SAISIE — sous la pellicule, comme la directive le demande. */}
      <div className="flex items-end gap-2 px-3 pb-safe pt-1">
        <ComposerLanguagePill
          code={langue}
          onOpen={() => setChoixLangueOuvert(true)}
          buttonRef={pastilleRef}
        />
        <textarea
          value={texte}
          onInput={(event) => noter({ texte: (event.target as HTMLTextAreaElement).value })}
          placeholder="Ajouter une légende à cette image…"
          rows={1}
          className="min-h-11 flex-1 resize-none rounded-[18px] bg-white/10 px-3 py-2 text-body placeholder:text-white/50"
          aria-label={`Légende de ${courante.name}`}
          data-legende-champ
        />
        <button
          type="button"
          onClick={() =>
            onEnvoyer(envoisLegendes({ pending, legendes: saisies, langueParDefaut, protection }))
          }
          className="grid size-11 shrink-0 place-items-center rounded-full"
          style={{ backgroundColor: 'var(--accent)' }}
          aria-label={
            pending.length === 1 ? 'Envoyer l’image' : `Envoyer les ${pending.length} images`
          }
          data-legende-envoyer
        >
          <Glyph name="arrowUp" size={18} />
        </button>
      </div>

      {choixLangueOuvert ? (
        <LanguageSheet
          title="Langue de la légende"
          selected={langue}
          onSelect={(code) => {
            noter({ langue: code });
            setChoixLangueOuvert(false);
          }}
          onClose={() => setChoixLangueOuvert(false)}
        />
      ) : null}
    </div>
  );
}
