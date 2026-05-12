export default function Commands() {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Commands</h2>
      <p className="text-gray-600">Command queue management - Coming soon</p>
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <div className="text-3xl font-bold text-blue-600">0</div>
          <div className="text-gray-600 mt-2">Pending</div>
        </div>
        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
          <div className="text-3xl font-bold text-green-600">0</div>
          <div className="text-gray-600 mt-2">Completed</div>
        </div>
        <div className="bg-red-50 rounded-lg p-4 border border-red-200">
          <div className="text-3xl font-bold text-red-600">0</div>
          <div className="text-gray-600 mt-2">Failed</div>
        </div>
      </div>
    </div>
  );
}
