import type { ReactNode } from 'react';

import type { ParticipantPermissions } from '@meeshy/shared/types/participant';

import { Glyph, GlyphSvg } from './glyph';
import { COMPOSER_GLYPHS } from './glyphs-composer';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { mayAttach } from '@/lib/send/attachments';

/**
 * LE PANNEAU DES SOURCES (#7280) — extrait de `composer-tray.tsx`, qui
 * approchait son budget AVANT que ce lot n'y ajoute quatre tuiles : on
 * extrait D'ABORD, on ajoute ENSUITE (CLAUDE.md racine, § budget de taille).
 *
 * ## SEPT SOURCES CHEZ IOS, TROIS SUR LE WEB
 *
 * `UniversalComposerBar+Attachments.swift:246-298` fait foi, et son ORDRE
 * avec lui (dimension 6, « est-ce à la place où l'utilisateur la
 * chercherait ») : photo · caméra · fichier · position · vocal · emoji ·
 * sticker. Le web servait photo, fichier, vocal ; #7280 a ajouté caméra,
 * position et emoji, et #7938 le STICKER : sa tuile ouvre « Mes stickers »
 * (`composer-sticker-sheet.tsx`), la bibliothèque SERVEUR que l'on remplit
 * depuis une image ou un collage, et dont un choix compose un message à lui
 * seul. Elle est gardée par le droit « Photos » : un sticker part en image.
 *
 * ## LOI 4 — UNE TUILE N'EXISTE QUE SI SON GESTE A UN EFFET
 *
 * Chaque tuile est gardée par ce qui la rendrait vaine : le DROIT d'envoi
 * (`mayAttach`, le MÊME chemin que la passerelle appliquera), le moteur
 * d'enregistrement pour le vocal, et `navigator.geolocation` pour la
 * position. Jamais grisée — iOS ne liste pas une tuile dont l'hôte n'a pas
 * câblé le rappel, et une porte fermée qu'on montre quand même est pire que
 * l'absence de porte.
 *
 * ## AUCUN LIBELLÉ EN DUR
 *
 * Les trois libellés historiques (`label="Photos"`, `"Fichier"`, `"Vocal"`)
 * vivaient ici même, en français, pour sept langues servies. Ils passent par
 * `composer.attach.*` comme les quatre nouveaux — la dette #6310 ne se
 * répand pas par le lot qui l'aurait triplée.
 */

const TILE_SIZE = 58;

/* LA CAMÉRA N'A PAS DE GARDE D'ENVIRONNEMENT, ET C'EST VOULU — `capture` est
   un attribut que le navigateur honore ou ignore, et l'ignorer ne casse rien
   (le champ retombe sur le sélecteur de fichiers). La tuile reste donc
   offerte partout où l'image l'est. C'est la POSITION, qui demande une
   PERMISSION, qui a besoin d'une garde : `locationSupported()`
   (`lib/view/use-location-request.ts`), site unique. */

function Tile({ label, color, children }: { readonly label: string; readonly color: string; readonly children: ReactNode }) {
  return (
    <>
      <span
        className="grid place-items-center rounded-full text-white shadow-sm"
        style={{
          width: TILE_SIZE,
          height: TILE_SIZE,
          background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 70%, transparent))`,
        }}
      >
        {children}
      </span>
      <span data-composer-source-label className="text-check">
        {label}
      </span>
    </>
  );
}

/**
 * UNE SOURCE QUI OUVRE UN SÉLECTEUR DE FICHIERS — le `<label>` porte le champ
 * caché ; `capture` le détourne vers l'appareil photo quand il est fourni
 * (`'environment'` = la caméra ARRIÈRE, celle qu'on pointe sur le monde).
 * `e.currentTarget.value = ''` après chaque choix : sans lui, rechoisir le
 * MÊME fichier ne lève aucun `change`.
 */
function FileSource({
  id,
  label,
  action,
  color,
  accept,
  capture,
  multiple,
  onPick,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly action: string;
  readonly color: string;
  readonly accept?: string;
  readonly capture?: 'environment';
  readonly multiple?: boolean;
  readonly onPick: (files: FileList | null) => void;
  readonly children: ReactNode;
}) {
  return (
    <label data-composer-source={id} className="flex flex-col items-center gap-1.5" style={{ width: TILE_SIZE + 8 }}>
      <Tile label={label} color={color}>
        {children}
      </Tile>
      <input
        type="file"
        {...(accept === undefined ? {} : { accept })}
        {...(capture === undefined ? {} : { capture })}
        {...(multiple === true ? { multiple: true } : {})}
        className="sr-only"
        aria-label={action}
        onChange={(e) => {
          onPick(e.currentTarget.files);
          e.currentTarget.value = '';
        }}
      />
    </label>
  );
}

/** UNE SOURCE QUI DÉCLENCHE UN GESTE — vocal, position, emoji : rien à
 * choisir dans un système de fichiers, donc un bouton, pas un champ. */
function GestureSource({
  id,
  label,
  action,
  color,
  onTrigger,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly action: string;
  readonly color: string;
  readonly onTrigger: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      data-composer-source={id}
      type="button"
      onClick={onTrigger}
      className="flex flex-col items-center gap-1.5"
      style={{ width: TILE_SIZE + 8 }}
      aria-label={action}
    >
      <Tile label={label} color={color}>
        {children}
      </Tile>
    </button>
  );
}

export type ComposerAttachmentPanelProps = {
  readonly onPickPhotos: (files: FileList | null) => void;
  readonly onPickCamera: (files: FileList | null) => void;
  readonly onPickFile: (files: FileList | null) => void;
  readonly onRequestLocation: () => void;
  readonly onRequestEmoji: () => void;
  /** ABSENT ⇒ PAS DE TUILE (loi 4) : un hôte qui ne monte pas « Mes stickers »
   * ne montre pas une porte qui ne mène nulle part. */
  readonly onRequestSticker?: () => void;
  readonly onStartVoice: () => void;
  readonly canRecord: boolean;
  /** `navigator.geolocation` existe DANS CE NAVIGATEUR — reçu, jamais lu ici :
   * l'hôte le mesure une fois (`locationSupported`) et le sert, motif de
   * `canRecord`. */
  readonly canLocate: boolean;
  readonly rights?: ParticipantPermissions;
};

export function ComposerAttachmentPanel({
  onPickPhotos,
  onPickCamera,
  onPickFile,
  onRequestLocation,
  onRequestEmoji,
  onRequestSticker,
  onStartVoice,
  canRecord,
  canLocate,
  rights,
}: ComposerAttachmentPanelProps) {
  /* `translate` SE LIT AVEC UNE CLÉ LITTÉRALE, jamais par un raccourci
     `say(key)` : c'est la clé LITTÉRALE qui TYPE les paramètres attendus
     (`TranslateArgs<K>`, `i18n-catalog.ts`), et un helper générique rend ce
     contrôle impossible — le compilateur ne saurait plus dire qu'un `{name}`
     manque. */
  const language = currentInterfaceLanguage();

  /* LE DROIT SE LIT PAR LE MÊME CHEMIN QUE CELUI QU'APPLIQUERA LA PASSERELLE
     (`mayAttach`, miroir `attachmentSendRightForMimeType`) — jamais une
     seconde table écrite ici. La CAMÉRA produit une image : elle partage le
     droit de « Photos », sans quoi une tuile ouvrirait l'objectif pour un
     envoi que le serveur refuserait en 403 après téléversement. */
  const canImages = mayAttach(rights, 'image/*');
  const canFiles = mayAttach(rights, 'application/octet-stream');
  const canAudios = canRecord && mayAttach(rights, 'audio/*');

  return (
    /* `data-composer-panel` — L'ANCRE STRUCTURELLE DU PANNEAU (#7280), même
       convention que `data-composer`/`data-message`. Les gates le
       désignaient par son `aria-label` français en dur ; depuis que ce
       libellé vient du catalogue, il vaut « Attachment types » sur un
       Chromium en anglais — et une garde qui reconnaît par le NOM s'inverse
       au premier renommage (`tasks/lessons.md`). L'ancre, elle, ne se traduit
       pas. */
    <div
      data-composer-panel
      role="group"
      aria-label={translate(language, 'composer.attach.group')}
      style={{ paddingInline: 18, paddingBlock: 12 }}
    >
      {/* La POIGNÉE du panneau iOS (`+Attachments.swift`, en tête du
          carrousel) : purement décorative, elle dit « ceci est un tiroir ». */}
      <span
        aria-hidden
        className="mx-auto mb-3 block h-1 w-9 rounded-full"
        style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 35%, transparent)' }}
      />
      {/* LES SOURCES DÉFILENT (revue #7280) — six tuiles de 66 px tiennent sur
          un écran large, jamais sur 320 px : iOS les porte dans un carrousel
          horizontal (`+Attachments.swift`, `ScrollView(.horizontal)`), et sans
          lui la sixième sortait de l'écran sans moyen de l'atteindre. */}
      <div className="scrollbar-none flex gap-3.5 overflow-x-auto">
        {canImages ? (
          <FileSource
            id="photo"
            label={translate(language, 'composer.attach.photo')}
            action={translate(language, 'composer.attach.photo.action')}
            color="var(--ios-tile-photo)"
            accept="image/*"
            multiple
            onPick={onPickPhotos}
          >
            <Glyph name="image" size={26} />
          </FileSource>
        ) : null}

        {canImages ? (
          <FileSource
            id="camera"
            label={translate(language, 'composer.attach.camera')}
            action={translate(language, 'composer.attach.camera.action')}
            color="var(--ios-tile-camera)"
            accept="image/*"
            capture="environment"
            onPick={onPickCamera}
          >
            <GlyphSvg glyph={COMPOSER_GLYPHS.camera} size={26} />
          </FileSource>
        ) : null}

        {canFiles ? (
          <FileSource
            id="file"
            label={translate(language, 'composer.attach.file')}
            action={translate(language, 'composer.attach.file.action')}
            color="var(--ios-tile-file)"
            multiple
            onPick={onPickFile}
          >
            <Glyph name="file" size={26} />
          </FileSource>
        ) : null}

        {canLocate ? (
          <GestureSource
            id="location"
            label={translate(language, 'composer.attach.location')}
            action={translate(language, 'composer.attach.location.action')}
            color="var(--ios-tile-location)"
            onTrigger={onRequestLocation}
          >
            <GlyphSvg glyph={COMPOSER_GLYPHS.mapPin} size={26} />
          </GestureSource>
        ) : null}

        {canAudios ? (
          <GestureSource
            id="voice"
            label={translate(language, 'composer.attach.voice')}
            action={translate(language, 'composer.attach.voice.action')}
            color="var(--ios-tile-voice)"
            onTrigger={onStartVoice}
          >
            <Glyph name="microphone" size={26} />
          </GestureSource>
        ) : null}

        <GestureSource
          id="emoji"
          label={translate(language, 'composer.attach.emoji')}
          action={translate(language, 'composer.attach.emoji.action')}
          color="var(--ios-tile-emoji)"
          onTrigger={onRequestEmoji}
        >
          <Glyph name="smiley" size={26} />
        </GestureSource>

        {canImages && onRequestSticker !== undefined ? (
          <GestureSource
            id="sticker"
            label={translate(language, 'composer.attach.sticker')}
            action={translate(language, 'composer.attach.sticker.action')}
            color="var(--ios-tile-sticker)"
            onTrigger={onRequestSticker}
          >
            <GlyphSvg glyph={COMPOSER_GLYPHS.sticker} size={26} />
          </GestureSource>
        ) : null}
      </div>
    </div>
  );
}
