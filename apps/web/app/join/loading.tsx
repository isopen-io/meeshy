/**
 * Loading skeleton for join page
 * Enables React Suspense streaming for faster perceived load
 */
export default function LoadingJoin() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-8">
        {/* Logo/Icon placeholder */}
        <div className="flex justify-center mb-6">
          <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/30 animate-pulse" />
        </div>

        {/* Title */}
        <div className="text-center mb-8">
          <div className="h-7 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mx-auto mb-3" />
          <div className="h-4 w-64 bg-gray-100 dark:bg-gray-600 rounded animate-pulse mx-auto" />
        </div>

        {/* Group/Conversation info card */}
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-gray-200 dark:bg-gray-600 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-32 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
              <div className="h-3 w-24 bg-gray-100 dark:bg-gray-500 rounded animate-pulse" />
            </div>
          </div>
        </div>

        {/* Members preview */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="flex -space-x-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-600 border-2 border-white dark:border-gray-800 animate-pulse" />
            ))}
          </div>
          <div className="h-4 w-20 bg-gray-100 dark:bg-gray-600 rounded animate-pulse ml-2" />
        </div>

        {/* Action button */}
        <div className="h-12 w-full bg-blue-200 dark:bg-blue-700 rounded-lg animate-pulse mb-4" />

        {/* Secondary link */}
        <div className="h-4 w-32 bg-gray-100 dark:bg-gray-600 rounded animate-pulse mx-auto" />
      </div>
    </div>
  );
}
