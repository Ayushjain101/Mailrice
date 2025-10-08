import { useState } from 'react';
import { Plus, Eye, RotateCw, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/Table';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { DomainCreate } from './DomainCreate';
import { DomainDNS } from './DomainDNS';
import { DKIMRotate } from './DKIMRotate';
import { useDomains, useDeleteDomain } from '../../hooks/useDomains';
import { formatDate } from '../../utils/helpers';
import { getErrorMessage } from '../../services/api';
import type { Domain } from '../../types/domain.types';

export function DomainList() {
  const { data: domains, isLoading, error } = useDomains();
  const deleteDomain = useDeleteDomain();

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [dnsModalDomain, setDnsModalDomain] = useState<Domain | null>(null);
  const [dkimModalDomain, setDkimModalDomain] = useState<Domain | null>(null);

  // Filter domains by search query
  const filteredDomains = domains?.filter((domain) =>
    domain.domain.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async (domain: Domain) => {
    if (!confirm(`Are you sure you want to delete ${domain.domain}? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteDomain.mutateAsync(domain.id);
      toast.success('Domain deleted', {
        description: `${domain.domain} has been removed.`,
      });
    } catch (error) {
      toast.error('Failed to delete domain', {
        description: getErrorMessage(error),
      });
    }
  };

  return (
    <>
      <Card>
        <CardHeader
          title="Domains"
          description="Manage your email domains and DNS configuration"
          action={
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Domain
            </Button>
          }
        />

        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search domains..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="py-12">
            <LoadingSpinner />
            <p className="text-center text-gray-600 mt-4">Loading domains...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">{getErrorMessage(error)}</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && filteredDomains && filteredDomains.length === 0 && !searchQuery && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
              <Plus className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No domains yet</h3>
            <p className="text-gray-600 mb-4">Get started by creating your first domain</p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Domain
            </Button>
          </div>
        )}

        {/* No Search Results */}
        {!isLoading && !error && filteredDomains && filteredDomains.length === 0 && searchQuery && (
          <div className="text-center py-12">
            <p className="text-gray-600">No domains found matching "{searchQuery}"</p>
          </div>
        )}

        {/* Domains Table */}
        {!isLoading && !error && filteredDomains && filteredDomains.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Hostname</TableHead>
                <TableHead>DKIM Selector</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDomains.map((domain) => (
                <TableRow key={domain.id}>
                  <TableCell>
                    <div className="font-medium text-gray-900">{domain.domain}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-gray-600">{domain.hostname}</div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {domain.dkim_selector}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-gray-600">{formatDate(domain.created_at)}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setDnsModalDomain(domain)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="View DNS Records"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDkimModalDomain(domain)}
                        className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                        title="Rotate DKIM Key"
                      >
                        <RotateCw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(domain)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Domain"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Stats */}
        {!isLoading && !error && domains && domains.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Showing {filteredDomains?.length || 0} of {domains.length} domains
            </p>
          </div>
        )}
      </Card>

      {/* Modals */}
      <DomainCreate
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        workspaceId={1} // TODO: Get from context or props
      />

      {dnsModalDomain && (
        <DomainDNS
          isOpen={!!dnsModalDomain}
          onClose={() => setDnsModalDomain(null)}
          domainId={dnsModalDomain.id}
          domainName={dnsModalDomain.domain}
        />
      )}

      {dkimModalDomain && (
        <DKIMRotate
          isOpen={!!dkimModalDomain}
          onClose={() => setDkimModalDomain(null)}
          domainId={dkimModalDomain.id}
          domainName={dkimModalDomain.domain}
          currentSelector={dkimModalDomain.dkim_selector}
        />
      )}
    </>
  );
}
