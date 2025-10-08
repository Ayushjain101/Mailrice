import { Card, CardHeader } from '../components/ui/Card';
import { Globe, Mail, Key, Activity } from 'lucide-react';

export function Dashboard() {
  // TODO: Fetch actual stats from backend
  const stats = [
    {
      name: 'Total Domains',
      value: '0',
      icon: Globe,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      name: 'Total Mailboxes',
      value: '0',
      icon: Mail,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      name: 'Active API Keys',
      value: '0',
      icon: Key,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      name: 'System Status',
      value: 'Healthy',
      icon: Activity,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">Overview of your email infrastructure</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Card key={stat.name} className="hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{stat.value}</p>
              </div>
              <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader
          title="Quick Actions"
          description="Common tasks to manage your email platform"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-left">
            <Globe className="w-8 h-8 text-primary-600 mb-2" />
            <h3 className="font-semibold text-gray-900">Create Domain</h3>
            <p className="text-sm text-gray-600 mt-1">Add a new domain with DKIM</p>
          </button>

          <button className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-left">
            <Mail className="w-8 h-8 text-primary-600 mb-2" />
            <h3 className="font-semibold text-gray-900">Create Mailbox</h3>
            <p className="text-sm text-gray-600 mt-1">Set up a new email account</p>
          </button>

          <button className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-left">
            <Key className="w-8 h-8 text-primary-600 mb-2" />
            <h3 className="font-semibold text-gray-900">Generate API Key</h3>
            <p className="text-sm text-gray-600 mt-1">Create programmatic access</p>
          </button>
        </div>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader
          title="Recent Activity"
          description="Latest changes to your email infrastructure"
        />
        <div className="text-center py-8 text-gray-500">
          <Activity className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p>No recent activity</p>
          <p className="text-sm mt-1">Activity will appear here once you start managing domains and mailboxes</p>
        </div>
      </Card>
    </div>
  );
}
