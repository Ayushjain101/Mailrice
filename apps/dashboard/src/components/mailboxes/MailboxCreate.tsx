import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useCreateMailbox } from '../../hooks/useMailboxes';
import { useDomains } from '../../hooks/useDomains';
import { getErrorMessage } from '../../services/api';
import { calculatePasswordStrength } from '../../utils/helpers';
import type { CreateMailboxRequest } from '../../types/mailbox.types';

interface MailboxCreateProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: number;
  preselectedDomainId?: number;
}

interface FormData {
  domain_id: number;
  local_part: string;
  password: string;
  confirm_password: string;
  quota_mb: number;
}

export function MailboxCreate({ isOpen, onClose, workspaceId, preselectedDomainId }: MailboxCreateProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createMailbox = useCreateMailbox();
  const { data: domains } = useDomains();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      domain_id: preselectedDomainId || undefined,
      local_part: '',
      password: '',
      confirm_password: '',
      quota_mb: 1024,
    },
  });

  const watchPassword = watch('password');
  const passwordStrength = calculatePasswordStrength(watchPassword || '');

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);

    try {
      const request: CreateMailboxRequest = {
        workspace_id: workspaceId,
        domain_id: Number(data.domain_id),
        local_part: data.local_part,
        password: data.password,
        quota_mb: data.quota_mb,
      };

      const result = await createMailbox.mutateAsync(request);

      toast.success('Mailbox created successfully!', {
        description: `${result.email} is now ready to use.`,
      });

      reset();
      onClose();
    } catch (error) {
      toast.error('Failed to create mailbox', {
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
    <Modal isOpen={isOpen} onClose={handleClose} title="Create New Mailbox" size="md">
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-4">
          {/* Domain Selection */}
          <div>
            <label htmlFor="domain_id" className="block text-sm font-medium text-gray-700 mb-1">
              Domain <span className="text-red-500">*</span>
            </label>
            <select
              id="domain_id"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              {...register('domain_id', { required: 'Domain is required' })}
            >
              <option value="">Select a domain</option>
              {domains?.map((domain) => (
                <option key={domain.id} value={domain.id}>
                  {domain.domain}
                </option>
              ))}
            </select>
            {errors.domain_id && (
              <p className="mt-1 text-sm text-red-600">{errors.domain_id.message}</p>
            )}
          </div>

          {/* Local Part (username) */}
          <Input
            label="Username (local part)"
            placeholder="john"
            error={errors.local_part?.message}
            helperText="The part before @ in the email address"
            required
            {...register('local_part', {
              required: 'Username is required',
              pattern: {
                value: /^[a-z0-9._-]+$/i,
                message: 'Only letters, numbers, dots, hyphens, and underscores allowed',
              },
              minLength: {
                value: 2,
                message: 'Username must be at least 2 characters',
              },
            })}
          />

          {/* Password */}
          <div>
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              error={errors.password?.message}
              required
              {...register('password', {
                required: 'Password is required',
                minLength: {
                  value: 8,
                  message: 'Password must be at least 8 characters',
                },
              })}
            />
            {watchPassword && (
              <div className="mt-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        passwordStrength.score <= 1
                          ? 'bg-red-500'
                          : passwordStrength.score === 2
                          ? 'bg-yellow-500'
                          : passwordStrength.score === 3
                          ? 'bg-green-500'
                          : 'bg-green-600'
                      }`}
                      style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                    />
                  </div>
                  <span className={`text-xs font-medium ${passwordStrength.color}`}>
                    {passwordStrength.label}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <Input
            label="Confirm Password"
            type="password"
            placeholder="••••••••"
            error={errors.confirm_password?.message}
            required
            {...register('confirm_password', {
              required: 'Please confirm your password',
              validate: (value) => value === watchPassword || 'Passwords do not match',
            })}
          />

          {/* Quota */}
          <Input
            label="Mailbox Quota (MB)"
            type="number"
            placeholder="1024"
            error={errors.quota_mb?.message}
            helperText="Storage limit for this mailbox (default: 1024 MB = 1 GB)"
            {...register('quota_mb', {
              valueAsNumber: true,
              min: {
                value: 100,
                message: 'Minimum quota is 100 MB',
              },
              max: {
                value: 102400,
                message: 'Maximum quota is 102400 MB (100 GB)',
              },
            })}
          />

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">📧 Email Credentials</h4>
            <p className="text-sm text-blue-800">
              After creation, use these settings:
            </p>
            <ul className="text-sm text-blue-800 mt-2 space-y-1">
              <li>• <strong>IMAP:</strong> Port 993 (SSL/TLS)</li>
              <li>• <strong>SMTP:</strong> Port 587 (STARTTLS) or 465 (SSL)</li>
            </ul>
          </div>
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting}>
            Create Mailbox
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
