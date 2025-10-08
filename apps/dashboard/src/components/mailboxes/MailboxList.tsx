import { useState } from 'react';
import { Plus, Key, Trash2, Search, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/Table';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { MailboxCreate } from './MailboxCreate';
import { MailboxPassword } from './MailboxPassword';
import { useMailboxes, useDeleteMailbox } from '../../hooks/useMailboxes';
import { useDomains } from '../../hooks/useDomains';
import { formatDate, formatBytes } from '../../utils/helpers';
import { getErrorMessage } from '../../services/api';
import type { Mailbox } from '../../types/mailbox.types';

export function MailboxList() {
  const { data: mailboxes, isLoading, error } = useMailboxes();
  const { data: domains } = useDomains();
  const deleteMailbox = useDeleteMailbox();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<number | 'all'>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [passwordModalMailbox, setPasswordModalMailbox] = useState<Mailbox | null>(null);

  // Filter mailboxes
  const filteredMailboxes = mailboxes?.filter((mailbox) => {
    const matchesSearch = mailbox.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDomain = selectedDomain === 'all' || mailbox.domain_id === selectedDomain;
    return matchesSearch && matchesDomain;
  });

  const handleDelete = async (mailbox: Mailbox) => {
    if (!confirm(`Are you sure you want to delete ${mailbox.email}? This cannot be undone.`)) {
      return;
    }

    try {
      await deleteMailbox.mutateAsync(mailbox.id);
      toast.success('Mailbox deleted', {
        description: `${mailbox.email} has been removed.`,
      });
    } catch (error) {
      toast.error('Failed to delete mailbox', {
        description: getErrorMessage(error),
      });
    }
  };

  return (
    <>
      <Card>
        <CardHeader
          title="Mailboxes"
          description="Manage email accounts and their settings"
          action={
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Mailbox
            </Button>
          }
        />

        {/* Filters */}
        <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search mailboxes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div>
            <select
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Domains</option>
              {domains?.map((domain) => (
                <option key={domain.id} value={domain.id}>
                  {domain.domain}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="py-12">
            <LoadingSpinner />
            <p className="text-center text-gray-600 mt-4">Loading mailboxes...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">{getErrorMessage(error)}</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && filteredMailboxes && filteredMailboxes.length === 0 && !searchQuery && selectedDomain === 'all' && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
              <Mail className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No mailboxes yet</h3>
            <p className="text-gray-600 mb-4">Create your first mailbox to get started</p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Mailbox
            </Button>
          </div>
        )}

        {/* No Search/Filter Results */}
        {!isLoading && !error && filteredMailboxes && filteredMailboxes.length === 0 && (searchQuery || selectedDomain !== 'all') && (
          <div className="text-center py-12">
            <p className="text-gray-600">No mailboxes found with current filters</p>
          </div>
        )}

        {/* Mailboxes Table */}
        {!isLoading && !error && filteredMailboxes && filteredMailboxes.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Quota</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMailboxes.map((mailbox) => (
                <TableRow key={mailbox.id}>
                  <TableCell>
                    <div className="font-medium text-gray-900">{mailbox.email}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-gray-600">{formatBytes(mailbox.quota_mb * 1024 * 1024)}</div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        mailbox.enabled
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {mailbox.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-gray-600">{formatDate(mailbox.created_at)}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setPasswordModalMailbox(mailbox)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Update Password"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(mailbox)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Mailbox"
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
        {!isLoading && !error && mailboxes && mailboxes.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Showing {filteredMailboxes?.length || 0} of {mailboxes.length} mailboxes
            </p>
          </div>
        )}
      </Card>

      {/* Modals */}
      <MailboxCreate
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        workspaceId={1} // TODO: Get from context or props
        preselectedDomainId={selectedDomain !== 'all' ? selectedDomain : undefined}
      />

      {passwordModalMailbox && (
        <MailboxPassword
          isOpen={!!passwordModalMailbox}
          onClose={() => setPasswordModalMailbox(null)}
          mailbox={passwordModalMailbox}
        />
      )}
    </>
  );
}
