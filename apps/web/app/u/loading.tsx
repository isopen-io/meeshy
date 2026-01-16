/**
 * Loading skeleton for user profile page
 * Enables React Suspense streaming for faster perceived load
 */
export default function LoadingUserProfile() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header skeleton */}
      <div className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center px-6">
        <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mr-4" />
        <div className="h-6 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Profile header */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden mb-6">
          {/* Cover image */}
          <div className="h-32 bg-gradient-to-r from-blue-200 to-indigo-200 dark:from-blue-900/30 dark:to-indigo-900/30 animate-pulse" />

          {/* Profile info */}
          <div className="px-6 pb-6">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12">
              <div className="h-24 w-24 rounded-full bg-gray-200 dark:bg-gray-700 border-4 border-white dark:border-gray-800 animate-pulse" />
              <div className="flex-1 space-y-2 sm:mb-2">
                <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-4 w-32 bg-gray-100 dark:bg-gray-600 rounded animate-pulse" />
              </div>
              <div className="h-10 w-28 bg-blue-200 dark:bg-blue-700 rounded-lg animate-pulse" />
            </div>

            {/* Bio */}
            <div className="mt-4 space-y-2">
              <div className="h-4 w-full bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
            </div>

            {/* Stats */}
            <div className="flex gap-6 mt-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="text-center">
                  <div className="h-6 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mx-auto mb-1" />
                  <div className="h-3 w-16 bg-gray-100 dark:bg-gray-600 rounded animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
          ))}
        </div>

        {/* Content grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
                <div className="space-y-1">
                  <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  <div className="h-3 w-16 bg-gray-100 dark:bg-gray-600 rounded animate-pulse" />
                </div>
              </div>
              <div className="h-4 w-full bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
