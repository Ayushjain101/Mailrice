import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useRotateDKIM } from '../../hooks/useDomains';
import { getErrorMessage } from '../../services/api';
import { AlertCircle } from 'lucide-react';
import type { RotateDKIMRequest } from '../../types/domain.types';

interface DKIMRotateProps {
  isOpen: boolean;
  onClose: () => void;
  domainId: number;
  domainName: string;
  currentSelector: string;
}

interface FormData {
  new_selector: string;
}

export function DKIMRotate({
  isOpen,
  onClose,
  domainId,
  domainName,
  currentSelector,
}: DKIMRotateProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const rotateDKIM = useRotateDKIM();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      new_selector: '',
    },
  });

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);

    try {
      const request: RotateDKIMRequest = {
        new_selector: data.new_selector,
      };

      const result = await rotateDKIM.mutateAsync({ domainId, data: request });

      toast.success('DKIM key rotated successfully!', {
        description: `New DKIM selector: ${result.new_selector}. Update your DNS records.`,
      });

      reset();
      onClose();
    } catch (error) {
      toast.error('Failed to rotate DKIM key', {
        description: getErrorMessage(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      reset();
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Rotate DKIM Key" size="md">
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Domain: <span className="font-medium text-gray-900">{domainName}</span>
            </p>
            <p className="text-sm text-gray-600">
              Current selector: <span className="font-medium text-gray-900">{currentSelector}</span>
            </p>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-yellow-900">⚠️ Important</h4>
              <ul className="text-sm text-yellow-800 mt-2 space-y-1 list-disc list-inside">
                <li>A new DKIM key pair will be generated</li>
                <li>You must update your DNS TXT record</li>
                <li>Keep the old record until fully transitioned</li>
                <li>Email signing will use the new key immediately</li>
              </ul>
            </div>
          </div>

          <Input
            label="New DKIM Selector"
            placeholder={`mail${new Date().getFullYear()}`}
            error={errors.new_selector?.message}
            helperText="Example: mail2025, default, etc."
            required
            {...register('new_selector', {
              required: 'New selector is required',
              pattern: {
                value: /^[a-z0-9]+$/i,
                message: 'Only alphanumeric characters allowed',
              },
              validate: (value) =>
                value !== currentSelector || 'New selector must be different from current',
            })}
          />
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" isLoading={isSubmitting} disabled={isSubmitting}>
            Rotate DKIM Key
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
