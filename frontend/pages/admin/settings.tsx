// pages/admin/settings.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthProvider';
import AdminLayout from '../../components/AdminLayout';
import { myFetch } from '../../utils/myFetch';  // <-- nuestro helper con lógica 401/403

interface AwsAgentAlias {
  aliasId: string;
  aliasName?: string;
  associatedVersion?: string;
}

interface AwsAgent {
  agentId: string;
  name: string;
  aliases: AwsAgentAlias[];
}

// QuickChatButton => solo buttonName
interface QuickChatButton {
  buttonName: string;
}

export default function SettingsPage() {
  const { token, role } = useAuth();
  const router = useRouter();

  // AWS Creds
  const [awsAccessKeyId, setAwsAccessKeyId] = useState('');
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState('');
  const [awsS3Bucket, setAwsS3Bucket] = useState('');

  // Agents
  const [awsAgents, setAwsAgents] = useState<AwsAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedAgentAliases, setSelectedAgentAliases] = useState<AwsAgentAlias[]>([]);
  const [selectedAliasId, setSelectedAliasId] = useState('');

  // De la DB: agentRealId, agentAliasId
  const [dbAgentRealId, setDbAgentRealId] = useState('');
  const [dbAgentAliasId, setDbAgentAliasId] = useState('');

  // Quick Chat Buttons => solo buttonName
  const [quickChatButtons, setQuickChatButtons] = useState<QuickChatButton[]>([]);

  const [saving, setSaving] = useState(false);

  // Verificar auth
  useEffect(() => {
    if (!token || role !== 'admin') {
      router.push('/');
      return;
    }
    fetchSettings();
    fetchAgents();
  }, [token, role, router]);

  // 1) Cargar /admin/settings
  const fetchSettings = async () => {
    const result = await myFetch('/admin/settings', {
      method: 'GET',
    });
    if (result.status === 'error') {
      console.error('Error fetching settings:', result.message);
      // Si es 401/403, myFetch ya hace logout
      return;
    }

    const data = result.data;
    // data => { awsAccessKeyId, awsSecretAccessKey, awsS3Bucket, agentRealId, agentAliasId, quickChatButtons }

    setAwsAccessKeyId(data.awsAccessKeyId || '');
    setAwsSecretAccessKey(data.awsSecretAccessKey || '');
    setAwsS3Bucket(data.awsS3Bucket || '');

    if (data.agentRealId) setDbAgentRealId(data.agentRealId);
    if (data.agentAliasId) setDbAgentAliasId(data.agentAliasId);

    if (Array.isArray(data.quickChatButtons)) {
      setQuickChatButtons(data.quickChatButtons);
    } else {
      setQuickChatButtons([]);
    }
  };

  // 2) Cargar /admin/list-agents
  const fetchAgents = async () => {
    const result = await myFetch('/admin/list-agents', {
      method: 'GET',
    });
    if (result.status === 'error') {
      console.error('Error fetching AWS agents+aliases:', result.message);
      return;
    }
    const data = result.data;
    setAwsAgents(data.agents || []);
  };

  // Reconstruir Agent/Alias con lo guardado en DB
  useEffect(() => {
    if (dbAgentRealId && awsAgents.length > 0) {
      const foundAgent = awsAgents.find(a => a.agentId === dbAgentRealId);
      if (foundAgent) {
        setSelectedAgentId(foundAgent.agentId);
        setSelectedAgentAliases(foundAgent.aliases || []);
      }
    }
  }, [dbAgentRealId, awsAgents]);

  useEffect(() => {
    if (dbAgentAliasId && selectedAgentAliases.length > 0) {
      const foundAlias = selectedAgentAliases.find(alias => alias.aliasId === dbAgentAliasId);
      if (foundAlias) {
        setSelectedAliasId(foundAlias.aliasId);
      }
    }
  }, [dbAgentAliasId, selectedAgentAliases]);

  // Manejadores agent
  const handleAgentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const agentId = e.target.value;
    setSelectedAgentId(agentId);

    const foundAgent = awsAgents.find(a => a.agentId === agentId);
    if (foundAgent) {
      setSelectedAgentAliases(foundAgent.aliases || []);
      setSelectedAliasId('');
    } else {
      setSelectedAgentAliases([]);
      setSelectedAliasId('');
    }
  };

  const handleAliasChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedAliasId(e.target.value);
  };

  // QuickChatButtons => solo un "buttonName"
  const handleAddButton = () => {
    setQuickChatButtons(prev => [
      ...prev,
      { buttonName: 'New Button' }
    ]);
  };

  const handleRemoveButton = (index: number) => {
    setQuickChatButtons(prev => {
      const newArr = [...prev];
      newArr.splice(index, 1);
      return newArr;
    });
  };

  const handleChangeButtonName = (index: number, newName: string) => {
    setQuickChatButtons(prev => {
      const newArr = [...prev];
      newArr[index] = { buttonName: newName };
      return newArr;
    });
  };

  // Guardar => /admin/settings
  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        provider: 'aws-bedrock',
        model: 'AWS Bedrock',
        awsAccessKeyId,
        awsSecretAccessKey,
        awsS3Bucket,
        agentRealId: selectedAgentId,
        agentAliasId: selectedAliasId,
        quickChatButtons,
      };

      const result = await myFetch('/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (result.status === 'error') {
        alert(`Error saving settings: ${result.message}`);
      } else {
        // Éxito => Actualizar agents (y opcionalmente re-cargar settings)
        await fetchAgents();
        // await fetchSettings(); // si quieres recargar todo de nuevo
        alert('Settings saved successfully');
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      alert('Error saving settings. Check console for details.');
    } finally {
      setSaving(false);
    }
  };

  if (!token || role !== 'admin') return null;

  return (
    <AdminLayout userRole={role} activeMenu="Settings">
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Model &amp; Authentication</h1>

        {/* Sección principal => AWS */}
        <div className="space-y-4 max-w-sm">
          <div>
            <label className="block font-semibold mb-1">AWS Access Key ID:</label>
            <input
              type="text"
              value={awsAccessKeyId}
              onChange={(e) => setAwsAccessKeyId(e.target.value)}
              className="border p-2 rounded w-full"
              placeholder="Enter AWS Access Key ID"
            />
          </div>

          <div>
            <label className="block font-semibold mb-1">AWS Secret Access Key:</label>
            <input
              type="password"
              value={awsSecretAccessKey}
              onChange={(e) => setAwsSecretAccessKey(e.target.value)}
              className="border p-2 rounded w-full"
              placeholder="Enter AWS Secret Access Key"
            />
          </div>

          <div>
            <label className="block font-semibold mb-1">Amazon S3 Bucket:</label>
            <input
              type="text"
              value={awsS3Bucket}
              onChange={(e) => setAwsS3Bucket(e.target.value)}
              className="border p-2 rounded w-full"
              placeholder="s3://your-s3-bucket/"
            />
          </div>

          <div>
            <label className="block font-semibold mb-1">AWS Agent:</label>
            <select
              className="border p-2 rounded w-full"
              value={selectedAgentId}
              onChange={handleAgentChange}
            >
              <option value="">(Select an agent)</option>
              {awsAgents.map(agent => (
                <option key={agent.agentId} value={agent.agentId}>
                  {agent.name} ({agent.agentId})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1">Agent Alias:</label>
            <select
              className="border p-2 rounded w-full"
              value={selectedAliasId}
              onChange={handleAliasChange}
            >
              <option value="">(Select an alias)</option>
              {selectedAgentAliases.map(alias => (
                <option key={alias.aliasId} value={alias.aliasId}>
                  {alias.aliasName
                    ? `${alias.aliasName} (${alias.aliasId})`
                    : alias.aliasId}
                  {alias.associatedVersion
                    ? ` - version ${alias.associatedVersion}`
                    : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Chat Buttons => SOLO buttonName */}
        <div className="mt-6 max-w-sm">
          <label className="block font-semibold mb-2 text-lg">
            Quick Chat Buttons:
          </label>

          <div className="overflow-x-auto border rounded bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="py-2 px-4 text-left">Button Name</th>
                  <th className="py-2 px-2 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody>
                {quickChatButtons.map((btn, index) => (
                  <tr key={index} className="border-b">
                    <td className="py-2 px-4">
                      <input
                        className="border p-1 rounded w-full"
                        type="text"
                        value={btn.buttonName}
                        onChange={(e) => handleChangeButtonName(index, e.target.value)}
                      />
                    </td>
                    <td className="py-2 px-2 w-12 text-center align-middle">
                      <button
                        onClick={() => handleRemoveButton(index)}
                        className="text-red-600 hover:text-red-800 p-0"
                        style={{ lineHeight: '1' }}
                        title="Remove"
                      >
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="p-2">
              <button
                onClick={handleAddButton}
                className="px-3 py-1 text-blue-600 border border-blue-600 rounded hover:text-blue-800 hover:border-blue-800"
                title="Add New Button"
              >
                <i className="fa-solid fa-plus" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={handleSave}
            className={`bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 ${
              saving ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}

