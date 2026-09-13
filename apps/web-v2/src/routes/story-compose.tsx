import { useState } from 'react';

import { httpTransport } from '@/lib/api/client';
import { appQueryClient } from '@/lib/api/query-client';
import { STORY_TRAY_QUERY_KEY } from '@/lib/api/stories';
import { navigate } from '@/lib/router';
import { Link } from '@/routes/route-table';

/**
 * **CRÉER UNE STORY** (#6080) — la destination du premier bouton flottant.
 *
 * **Ce que cet écran fait, et ce qu'il ne fait pas encore.** Il publie une
 * story de TEXTE : `POST /api/v1/posts` avec `type: 'STORY'`
 * (`services/gateway/src/routes/posts/core.ts`), dont la visibilité par défaut
 * SUIT le type côté serveur (`:326`) — on ne la force donc pas ici, sous peine
 * d'avoir deux vérités sur « à qui s'adresse une story ».
 *
 * La story MÉDIA demande la chaîne de téléversement (sélection, upload,
 * `uploadContext`), qui est un lot à elle seule : elle fait l'objet d'une issue
 * compagnon. Un bouton « photo » inerte aurait été pire que son absence — loi
 * 4 : un contrôle existe s'il a un effet.
 *
 * Au succès, le plateau est INVALIDÉ plutôt que patché à la main : le rail
 * refait sa requête et la story apparaît, sans qu'aucun écran n'ait à savoir
 * comment le plateau se compose.
 */
export default function StoryComposeScreen() {
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const vide = texte.trim() === '';

  async function publier() {
    if (vide || envoi) return;
    setEnvoi(true);
    setErreur(null);
    const resultat = await httpTransport.request<{ readonly id: string }>({
      method: 'POST',
      path: '/api/v1/posts',
      body: { content: texte.trim(), type: 'STORY' },
    });
    setEnvoi(false);
    if (!resultat.ok) {
      setErreur("La story n'a pas pu être publiée.");
      return;
    }
    await appQueryClient.invalidateQueries({ queryKey: STORY_TRAY_QUERY_KEY });
    navigate('/stories');
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden pt-safe">
      <header className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2">
        <Link
          to="list"
          aria-label="Annuler"
          className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ outlineColor: 'var(--color-ios-brand)' }}
        >
          <span aria-hidden="true" className="text-lg leading-none">✕</span>
        </Link>
        <h1 className="flex-1 text-body font-semibold" style={{ color: 'var(--color-ios-ink-1)' }}>
          Nouvelle story
        </h1>
        <button
          type="button"
          onClick={() => void publier()}
          disabled={vide || envoi}
          className="grid place-items-center rounded-chip px-4 py-2 text-body font-semibold text-white disabled:opacity-40"
          style={{ background: 'var(--color-ios-brand)' }}
        >
          {envoi ? 'Publication…' : 'Publier'}
        </button>
      </header>

      <div className="scrollbar-none flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-safe">
        <label htmlFor="story-texte" className="offscreen">
          Texte de la story
        </label>
        <textarea
          id="story-texte"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="Quoi de neuf ?"
          rows={6}
          className="w-full rounded-card px-3 py-2.5 text-body"
          style={{ backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink-1)' }}
        />
        <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          Une story reste visible vingt-quatre heures.
        </p>
        {erreur !== null ? (
          <p role="alert" className="text-check" style={{ color: 'var(--color-ios-ink-2)' }}>
            {erreur}
          </p>
        ) : null}
      </div>
    </main>
  );
}
