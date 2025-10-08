import { useState } from 'react';
import { Copy, Check, AlertCircle } from 'lucide-react';
import { Modal, ModalFooter } from '../ui/Modal';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { useDNSRecords } from '../../hooks/useDomains';
import { copyToClipboard } from '../../utils/helpers';
import type { DNSRecord } from '../../types/domain.types';

interface DomainDNSProps {
  isOpen: boolean;
  onClose: () => void;
  domainId: number;
  domainName: string;
}

export function DomainDNS({ isOpen, onClose, domainId, domainName }: DomainDNSProps) {
  const { data, isLoading, error } = useDNSRecords(domainId);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = async (text: string, index: number) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
  };

  const DNSRecordRow = ({ record, index }: { record: DNSRecord; index: number }) => {
    const isCopied = copiedIndex === index;

    return (
      <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {record.type}
              </span>
              <span className="text-sm font-medium text-gray-900">{record.name || '@'}</span>
            </div>

            <div className="bg-gray-50 rounded p-2 mb-2">
              <code className="text-xs text-gray-800 break-all">{record.value}</code>
            </div>

            {record.priority && (
              <p className="text-xs text-gray-600">Priority: {record.priority}</p>
            )}
            {record.ttl && (
              <p className="text-xs text-gray-600">TTL: {record.ttl}</p>
            )}
          </div>

          <button
            onClick={() => handleCopy(record.value, index)}
            className="flex-shrink-0 p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            title="Copy to clipboard"
          >
            {isCopied ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`DNS Records - ${domainName}`} size="lg">
      <div className="space-y-4">
        {isLoading && (
          <div className="py-8">
            <LoadingSpinner />
            <p className="text-center text-gray-600 mt-4">Loading DNS records...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-900">Failed to load DNS records</h4>
              <p className="text-sm text-red-800 mt-1">{error.message}</p>
            </div>
          </div>
        )}

        {data && (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">📋 Configuration Instructions</h4>
              <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                <li>Log in to your DNS provider (Cloudflare, Route53, etc.)</li>
                <li>Add each record below to your DNS zone</li>
                <li>Wait 5-10 minutes for DNS propagation</li>
                <li>Test email sending and DKIM validation</li>
              </ol>
            </div>

            <div className="space-y-3">
              {data.records.map((record, index) => (
                <DNSRecordRow key={index} record={record} index={index} />
              ))}
            </div>

            {data.records.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p>No DNS records found</p>
              </div>
            )}
          </>
        )}
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
}
