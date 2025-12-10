/**
 * Page de chargement pendant la redirection du lien de tracking
 */

export default function LoadingTrackingLink() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="text-center space-y-6 p-8">
        {/* Logo ou icône */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-4 border-blue-200 dark:border-blue-800"></div>
            <div className="absolute top-0 h-16 w-16 animate-spin rounded-full border-4 border-transparent border-t-blue-600 dark:border-t-blue-400"></div>
          </div>
        </div>

        {/* Texte */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
            Redirection en cours...
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Vous allez être redirigé vers votre destination
          </p>
        </div>

        {/* Animation de points */}
        <div className="flex justify-center gap-2">
          <div className="h-3 w-3 animate-bounce rounded-full bg-blue-600 dark:bg-blue-400 [animation-delay:-0.3s]"></div>
          <div className="h-3 w-3 animate-bounce rounded-full bg-blue-600 dark:bg-blue-400 [animation-delay:-0.15s]"></div>
          <div className="h-3 w-3 animate-bounce rounded-full bg-blue-600 dark:bg-blue-400"></div>
        </div>
      </div>
    </div>
  );
}
