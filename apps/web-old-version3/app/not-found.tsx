export default function NotFound() {
  return (
    <main id="main-content">
      <h1>Page introuvable</h1>
      <p>Ce lien ne mène à rien — il a peut-être expiré, ou son adresse a changé.</p>
      {/*
        Un `<a>` réel, jamais un `<Link>` : `/` est servi par le legacy jusqu'à
        l'étape 7 du § 4.9, et la navigation client de Next ne traverse pas une
        frontière de zone. La classe n'est pas décorative — sans elle, le lien
        est peint par le navigateur (`#0000EE`), soit 2,05:1 sur le fond sombre.
        Voir `app/globals.css`, `.sortie`.

        Aucun `rel` : `nofollow` vers sa PROPRE page d'accueil ne veut rien dire
        (elle est indexable, et c'est la destination qu'on souhaite), et
        `noreferrer` priverait le legacy du `Referer` sur le franchissement de
        zone — précisément le saut qu'on cherche à pouvoir tracer (§ 4.9).
        Les deux étaient cimentés par une assertion de test sans qu'aucune
        raison ne soit écrite. [revue #4414]
      */}
      <a className="sortie" href="/">
        Retourner à l’accueil
      </a>
    </main>
  );
}
