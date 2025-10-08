import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useCreateDomain } from '../../hooks/useDomains';
import { getErrorMessage } from '../../services/api';
import type { CreateDomainRequest } from '../../types/domain.types';

interface DomainCreateProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: number;
}

interface FormData {
  domain: string;
  hostname: string;
  dkim_selector: string;
}

export function DomainCreate({ isOpen, onClose, workspaceId }: DomainCreateProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createDomain = useCreateDomain();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      domain: '',
      hostname: '',
      dkim_selector: 'mail',
    },
  });

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);

    try {
      const request: CreateDomainRequest = {
        workspace_id: workspaceId,
        domain: data.domain,
        hostname: data.hostname,
        dkim_selector: data.dkim_selector || 'mail',
      };

      const result = await createDomain.mutateAsync(request);

      toast.success('Domain created successfully!', {
        description: `${result.domain} is now ready to use. Check DNS records for configuration.`,
      });

      reset();
      onClose();
    } catch (error) {
      toast.error('Failed to create domain', {
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
    <Modal isOpen={isOpen} onClose={handleClose} title="Create New Domain" size="md">
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-4">
          <Input
            label="Domain"
            placeholder="example.com"
            error={errors.domain?.message}
            helperText="The domain you want to send emails from"
            required
            {...register('domain', {
              required: 'Domain is required',
              pattern: {
                value: /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i,
                message: 'Please enter a valid domain (e.g., example.com)',
              },
            })}
          />

          <Input
            label="Hostname"
            placeholder="mail.example.com"
            error={errors.hostname?.message}
            helperText="The mail server hostname (MX record will point here)"
            required
            {...register('hostname', {
              required: 'Hostname is required',
              pattern: {
                value: /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i,
                message: 'Please enter a valid hostname (e.g., mail.example.com)',
              },
            })}
          />

          <Input
            label="DKIM Selector"
            placeholder="mail"
            error={errors.dkim_selector?.message}
            helperText="DKIM selector for email signing (default: mail)"
            {...register('dkim_selector', {
              pattern: {
                value: /^[a-z0-9]+$/i,
                message: 'Only alphanumeric characters allowed',
              },
            })}
          />

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">What happens next?</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• DKIM keys will be automatically generated</li>
              <li>• DNS records will be displayed for configuration</li>
              <li>• You'll need to add DNS records to your domain</li>
            </ul>
          </div>
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting}>
            Create Domain
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
