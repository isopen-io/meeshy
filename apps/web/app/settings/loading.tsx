/**
 * Loading skeleton for settings page
 * Enables React Suspense streaming for faster perceived load
 * Respects prefers-reduced-motion via CSS
 */
export default function LoadingSettings() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900" role="status" aria-label="Chargement des paramètres">
      <span className="sr-only">Chargement des paramètres en cours...</span>

      {/* Header skeleton */}
      <div className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center px-6">
        <div className="h-8 w-28 bg-gray-200 dark:bg-gray-700 rounded motion-safe:animate-pulse" />
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar navigation */}
          <div className="lg:w-64 space-y-1">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg motion-safe:animate-pulse" />
            ))}
          </div>

          {/* Settings content */}
          <div className="flex-1 space-y-6">
            {/* Profile section */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <div className="h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded motion-safe:animate-pulse mb-6" />

              <div className="flex items-center gap-4 mb-6">
                <div className="h-20 w-20 rounded-full bg-gray-200 dark:bg-gray-700 motion-safe:animate-pulse" />
                <div className="space-y-2">
                  <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded motion-safe:animate-pulse" />
                  <div className="h-4 w-48 bg-gray-100 dark:bg-gray-600 rounded motion-safe:animate-pulse" />
                </div>
              </div>

              <div className="space-y-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded motion-safe:animate-pulse" />
                    <div className="h-10 w-full bg-gray-100 dark:bg-gray-700 rounded-lg motion-safe:animate-pulse" />
                  </div>
                ))}
              </div>
            </div>

            {/* Preferences section */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <div className="h-6 w-28 bg-gray-200 dark:bg-gray-700 rounded motion-safe:animate-pulse mb-6" />

              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between py-3">
                    <div className="space-y-1">
                      <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded motion-safe:animate-pulse" />
                      <div className="h-3 w-48 bg-gray-100 dark:bg-gray-600 rounded motion-safe:animate-pulse" />
                    </div>
                    <div className="h-6 w-11 bg-gray-200 dark:bg-gray-700 rounded-full motion-safe:animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
