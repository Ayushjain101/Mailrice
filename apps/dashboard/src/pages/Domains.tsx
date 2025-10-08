import { DomainList } from '../components/domains/DomainList';

export function Domains() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Domains</h1>
        <p className="mt-2 text-gray-600">
          Manage email domains, DNS configuration, and DKIM signing
        </p>
      </div>

      <DomainList />
    </div>
  );
}
