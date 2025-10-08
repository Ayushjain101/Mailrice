import { useState } from 'react';
import { Copy, Check, AlertCircle } from 'lucide-react';
import { Modal, ModalFooter } from '../ui/Modal';
import { Button } from '../ui/Button';
import { copyToClipboard } from '../../utils/helpers';
import { toast } from 'sonner';

interface APIKeyDisplayProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  keyName: string;
}

export function APIKeyDisplay({ isOpen, onClose, apiKey, keyName }: APIKeyDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(apiKey);
    if (success) {
      setCopied(true);
      toast.success('API key copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="API Key Created" size="md" showCloseButton={false}>
      <div className="space-y-4">
        {/* Success message */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-green-900">API key generated successfully!</h4>
            <p className="text-sm text-green-800 mt-1">Key name: {keyName}</p>
          </div>
        </div>

        {/* Warning */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-red-900">⚠️ Save this key now!</h4>
            <p className="text-sm text-red-800 mt-1">
              This is the only time you'll see this key. Make sure to copy it and store it securely.
            </p>
          </div>
        </div>

        {/* API Key display */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Your API Key</label>
          <div className="relative">
            <div className="bg-gray-50 border border-gray-300 rounded-lg p-4 pr-12">
              <code className="text-sm text-gray-900 break-all font-mono">{apiKey}</code>
            </div>
            <button
              onClick={handleCopy}
              className="absolute top-1/2 right-3 -translate-y-1/2 p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-200 transition-colors"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check className="w-5 h-5 text-green-600" />
              ) : (
                <Copy className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Usage example */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Usage Example</label>
          <div className="bg-gray-900 rounded-lg p-4">
            <code className="text-sm text-green-400 font-mono">
              curl -H "X-API-Key: {apiKey.substring(0, 20)}..." \<br />
              &nbsp;&nbsp;https://mail.your-domain.com/api/domains
            </code>
          </div>
        </div>
      </div>

      <ModalFooter>
        <Button onClick={onClose} className="w-full">
          I've saved my API key
        </Button>
      </ModalFooter>
    </Modal>
  );
}
