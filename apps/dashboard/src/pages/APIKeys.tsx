import { APIKeyList } from '../components/apikeys/APIKeyList';

export function APIKeys() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">API Keys</h1>
        <p className="mt-2 text-gray-600">
          Generate and manage API keys for programmatic access to Mailrice
        </p>
      </div>

      <APIKeyList />
    </div>
  );
}
