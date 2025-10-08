import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Modal, ModalFooter } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useUpdateMailboxPassword } from '../../hooks/useMailboxes';
import { getErrorMessage } from '../../services/api';
import { calculatePasswordStrength } from '../../utils/helpers';
import type { Mailbox } from '../../types/mailbox.types';

interface MailboxPasswordProps {
  isOpen: boolean;
  onClose: () => void;
  mailbox: Mailbox;
}

interface FormData {
  new_password: string;
  confirm_password: string;
}

export function MailboxPassword({ isOpen, onClose, mailbox }: MailboxPasswordProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const updatePassword = useUpdateMailboxPassword();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      new_password: '',
      confirm_password: '',
    },
  });

  const watchPassword = watch('new_password');
  const passwordStrength = calculatePasswordStrength(watchPassword || '');

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);

    try {
      await updatePassword.mutateAsync({
        id: mailbox.id,
        data: { new_password: data.new_password },
      });

      toast.success('Password updated successfully!', {
        description: `Password for ${mailbox.email} has been changed.`,
      });

      reset();
      onClose();
    } catch (error) {
      toast.error('Failed to update password', {
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
    <Modal isOpen={isOpen} onClose={handleClose} title="Update Password" size="md">
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">
              Mailbox: <span className="font-medium text-gray-900">{mailbox.email}</span>
            </p>
          </div>

          <Input
            label="New Password"
            type="password"
            placeholder="••••••••"
            error={errors.new_password?.message}
            helperText="Password will be updated immediately"
            required
            autoFocus
            {...register('new_password', {
              required: 'New password is required',
              minLength: {
                value: 8,
                message: 'Password must be at least 8 characters',
              },
            })}
          />

          {watchPassword && (
            <div>
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

          <Input
            label="Confirm New Password"
            type="password"
            placeholder="••••••••"
            error={errors.confirm_password?.message}
            required
            {...register('confirm_password', {
              required: 'Please confirm your password',
              validate: (value) => value === watchPassword || 'Passwords do not match',
            })}
          />

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              ⚠️ The password will be changed immediately. Make sure to update your email client settings.
            </p>
          </div>
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting}>
            Update Password
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
