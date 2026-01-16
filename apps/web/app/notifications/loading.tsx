/**
 * Loading skeleton for notifications page
 * Enables React Suspense streaming for faster perceived load
 */
export default function LoadingNotifications() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header skeleton */}
      <div className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6">
        <div className="h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Filters skeleton */}
        <div className="flex gap-2 mb-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-9 w-20 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
          ))}
        </div>

        {/* Notifications list */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm divide-y divide-gray-200 dark:divide-gray-700">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-start gap-4 p-4">
              <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-3 w-1/2 bg-gray-100 dark:bg-gray-600 rounded animate-pulse" />
                <div className="h-3 w-20 bg-gray-100 dark:bg-gray-600 rounded animate-pulse" />
              </div>
              <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
