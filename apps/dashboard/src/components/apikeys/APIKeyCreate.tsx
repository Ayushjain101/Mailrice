import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { APIKeyDisplay } from './APIKeyDisplay';
import { useCreateAPIKey } from '../../hooks/useAPIKeys';
import { getErrorMessage } from '../../services/api';
import type { CreateAPIKeyRequest, CreateAPIKeyResponse } from '../../types/apikey.types';

interface APIKeyCreateProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FormData {
  name: string;
}

export function APIKeyCreate({ isOpen, onClose }: APIKeyCreateProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreateAPIKeyResponse | null>(null);
  const createAPIKey = useCreateAPIKey();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      name: '',
    },
  });

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);

    try {
      const request: CreateAPIKeyRequest = {
        name: data.name,
        scopes: [], // Default empty scopes
      };

      const result = await createAPIKey.mutateAsync(request);

      // Show the created key in display mode
      setCreatedKey(result);
      reset();
    } catch (error) {
      toast.error('Failed to create API key', {
        description: getErrorMessage(error),
      });
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting && !createdKey) {
      reset();
      onClose();
    }
  };

  const handleAfterCopy = () => {
    setCreatedKey(null);
    setIsSubmitting(false);
    onClose();
  };

  // If key was created, show display modal instead
  if (createdKey) {
    return (
      <APIKeyDisplay
        isOpen={isOpen}
        onClose={handleAfterCopy}
        apiKey={createdKey.api_key}
        keyName={createdKey.name}
      />
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create API Key" size="md">
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-4">
          <Input
            label="Key Name"
            placeholder="Production API Key"
            error={errors.name?.message}
            helperText="A descriptive name to identify this API key"
            required
            autoFocus
            {...register('name', {
              required: 'Key name is required',
              minLength: {
                value: 3,
                message: 'Name must be at least 3 characters',
              },
              maxLength: {
                value: 100,
                message: 'Name must be less than 100 characters',
              },
            })}
          />

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-medium text-yellow-900 mb-2">⚠️ Important</h4>
            <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
              <li>The API key will be shown only once</li>
              <li>Make sure to copy and store it securely</li>
              <li>You cannot retrieve it again after closing</li>
              <li>You can revoke and create new keys anytime</li>
            </ul>
          </div>
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting}>
            Generate API Key
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
