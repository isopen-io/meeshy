/**
 * Loading skeleton for groups page
 * Enables React Suspense streaming for faster perceived load
 */
export default function LoadingGroups() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header skeleton */}
      <div className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6">
        <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="h-10 w-36 bg-blue-200 dark:bg-blue-700 rounded-lg animate-pulse" />
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Search */}
        <div className="h-10 w-full max-w-md bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse mb-6" />

        {/* Groups grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
              {/* Banner */}
              <div className="h-24 bg-gray-200 dark:bg-gray-700 animate-pulse" />

              {/* Content */}
              <div className="p-4 space-y-3">
                <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-3 w-full bg-gray-100 dark:bg-gray-600 rounded animate-pulse" />
                <div className="h-3 w-3/4 bg-gray-100 dark:bg-gray-600 rounded animate-pulse" />

                <div className="flex items-center justify-between pt-2">
                  <div className="flex -space-x-2">
                    {[...Array(3)].map((_, j) => (
                      <div key={j} className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 border-2 border-white dark:border-gray-800 animate-pulse" />
                    ))}
                  </div>
                  <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
