import { useState } from 'react';
import { Plus, Trash2, Key as KeyIcon, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/Table';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { APIKeyCreate } from './APIKeyCreate';
import { useAPIKeys, useDeleteAPIKey } from '../../hooks/useAPIKeys';
import { formatDate } from '../../utils/helpers';
import { getErrorMessage } from '../../services/api';
import type { APIKey } from '../../types/apikey.types';

export function APIKeyList() {
  const { data: apiKeys, isLoading, error } = useAPIKeys();
  const deleteAPIKey = useDeleteAPIKey();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const handleDelete = async (apiKey: APIKey) => {
    if (!confirm(`Are you sure you want to revoke "${apiKey.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteAPIKey.mutateAsync(apiKey.id);
      toast.success('API key revoked', {
        description: `${apiKey.name} has been revoked and can no longer be used.`,
      });
    } catch (error) {
      toast.error('Failed to revoke API key', {
        description: getErrorMessage(error),
      });
    }
  };

  return (
    <>
      <Card>
        <CardHeader
          title="API Keys"
          description="Manage programmatic access to the Mailrice API"
          action={
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create API Key
            </Button>
          }
        />

        {/* Loading State */}
        {isLoading && (
          <div className="py-12">
            <LoadingSpinner />
            <p className="text-center text-gray-600 mt-4">Loading API keys...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">{getErrorMessage(error)}</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && apiKeys && apiKeys.length === 0 && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
              <KeyIcon className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No API keys yet</h3>
            <p className="text-gray-600 mb-4">
              Create an API key to access the Mailrice API programmatically
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create API Key
            </Button>
          </div>
        )}

        {/* API Keys Table */}
        {!isLoading && !error && apiKeys && apiKeys.length > 0 && (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <h4 className="font-medium text-blue-900 mb-2">🔐 Security Best Practices</h4>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>Never share your API keys publicly (e.g., in GitHub repos)</li>
                <li>Use environment variables to store keys in your applications</li>
                <li>Rotate keys regularly for enhanced security</li>
                <li>Revoke unused or compromised keys immediately</li>
              </ul>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key Prefix</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((apiKey) => (
                  <TableRow key={apiKey.id}>
                    <TableCell>
                      <div className="font-medium text-gray-900">{apiKey.name}</div>
                    </TableCell>
                    <TableCell>
                      <code className="px-2 py-1 bg-gray-100 rounded text-xs font-mono text-gray-800">
                        {apiKey.key_prefix}•••••••••••••••••••
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-gray-600">{formatDate(apiKey.created_at)}</div>
                    </TableCell>
                    <TableCell>
                      {apiKey.last_used_at ? (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Clock className="w-4 h-4" />
                          {formatDate(apiKey.last_used_at)}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Never used</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleDelete(apiKey)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Revoke API Key"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Stats */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">Total: {apiKeys.length} API keys</p>
            </div>
          </>
        )}
      </Card>

      {/* Create Modal */}
      <APIKeyCreate isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </>
  );
}
