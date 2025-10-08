import { MailboxList } from '../components/mailboxes/MailboxList';

export function Mailboxes() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Mailboxes</h1>
        <p className="mt-2 text-gray-600">
          Create and manage email accounts for your domains
        </p>
      </div>

      <MailboxList />
    </div>
  );
}
