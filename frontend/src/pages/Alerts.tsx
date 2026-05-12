export default function Alerts() {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Alerts</h2>
      <p className="text-gray-600">Alerts and notifications management - Coming soon</p>
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
          <div className="text-3xl font-bold text-yellow-600">0</div>
          <div className="text-gray-600 mt-2">Warning</div>
        </div>
        <div className="bg-red-50 rounded-lg p-4 border border-red-200">
          <div className="text-3xl font-bold text-red-600">0</div>
          <div className="text-gray-600 mt-2">Critical</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <div className="text-3xl font-bold text-blue-600">0</div>
          <div className="text-gray-600 mt-2">Info</div>
        </div>
      </div>
    </div>
  );
}
