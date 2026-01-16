/**
 * Loading skeleton for chat page
 * Enables React Suspense streaming for faster perceived load
 */
export default function LoadingChat() {
  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="h-16 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center px-4 gap-3">
          <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
          <div className="flex-1">
            <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1" />
            <div className="h-3 w-20 bg-gray-100 dark:bg-gray-600 rounded animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
            <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 p-4 space-y-4 overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
              <div className="flex gap-2 max-w-[70%]">
                {i % 2 === 0 && (
                  <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse flex-shrink-0" />
                )}
                <div
                  className={`rounded-2xl bg-gray-200 dark:bg-gray-700 animate-pulse ${
                    i % 2 === 0 ? 'rounded-tl-sm' : 'rounded-tr-sm'
                  }`}
                  style={{
                    height: `${40 + (i % 3) * 20}px`,
                    width: `${120 + (i % 4) * 40}px`
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Input area */}
        <div className="h-20 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
          <div className="flex-1 h-12 bg-gray-100 dark:bg-gray-700 rounded-full animate-pulse" />
          <div className="h-10 w-10 rounded-full bg-blue-200 dark:bg-blue-700 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
