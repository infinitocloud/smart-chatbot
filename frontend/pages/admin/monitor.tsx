// pages/admin/monitor.tsx

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { useRouter } from 'next/router';
import AdminLayout from '../../components/AdminLayout';
import { myFetch } from '../../utils/myFetch';

// Chart.js + react-chartjs-2
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

// ======= Tipos de datos (simplificados) =========
interface UsageLog {
  id: number;
  userId: number | null;
  username: string | null;
  prompt: string;
  inputTokens: number;
  outputTokens: number;
  timestamp: string;
  latencyMs: number | null;
  feedback?: string; // <-- NUEVO campo opcional
}

interface SystemStats {
  cpuUtilPercent?: number;  // 0..100
  systemMemory: {
    totalMem: number;
    freeMem: number;
    usedMem: number;
    usedPercent: number; // 0..100
  };
  diskUsage?: {
    total: number;
    used: number;
    free: number;
    usedPercent: number; // 0..100
  };
}

interface GraphDataItem {
  day: string;
  username: string | null;
  count: number;
}

interface TokensHourlyItem {
  hour: string;   // p.ej. "2025-01-04 06:00"
  totalInput: number;
  totalOutput: number;
}

interface LatencyItem {
  timestamp: string;  // p.ej. "2025-01-04 06:12:34"
  latencyMs: number;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function MonitorPage() {
  const { token, role } = useAuth();
  const router = useRouter();

  // Logs y Stats
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);

  // Tres gráficos (Queries, Tokens, Latencia)
  const [graphData, setGraphData] = useState<GraphDataItem[]>([]);
  const [tokensHourly, setTokensHourly] = useState<TokensHourlyItem[]>([]);
  const [latencyData, setLatencyData] = useState<LatencyItem[]>([]);

  // Paginación
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pagination, setPagination] = useState<Partial<PaginationInfo>>({});

  // Manejo de error
  const [error, setError] = useState('');

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Historial local para CPU/Mem/Disk (para el 4to gráfico)
  interface HardwareSnapshot {
    timestamp: string; // "HH:mm:ss"
    cpu: number;
    mem: number;
    disk: number;
  }
  const [hardwareSnapshots, setHardwareSnapshots] = useState<HardwareSnapshot[]>([]);

  // --------------------------------------------------------------------------------
  // fetchMonitorData
  // --------------------------------------------------------------------------------
  const fetchMonitorData = useCallback(async () => {
    if (!token) return;
    setError('');

    const queryString = `?page=${page}&limit=${limit}`;
    const result = await myFetch(`/admin/monitor${queryString}`, {
      method: 'GET',
    });

    if (result.status === 'error') {
      setError(result.message || 'Failed to fetch monitor data');
      return;
    }

    const data = result.data || {};
    // 1) Logs & stats
    setLogs(data.logs || []);
    setStats(data.stats || null);

    // 2) Graph data
    setGraphData(data.graphData || []);
    setTokensHourly(data.tokensHourly || []);
    setLatencyData(data.latencyData || []);

    // 3) Paginación
    if (data.pagination) {
      setPagination(data.pagination);
    }

    // 4) CPU/Mem/Disk snapshot
    if (data.stats) {
      const cpuVal = data.stats.cpuUtilPercent ?? 0;
      const memVal = data.stats.systemMemory?.usedPercent ?? 0;
      const diskVal = data.stats.diskUsage?.usedPercent ?? 0;

      const snap: HardwareSnapshot = {
        timestamp: new Date().toLocaleTimeString(),
        cpu: cpuVal,
        mem: memVal,
        disk: diskVal
      };
      setHardwareSnapshots(prev => [...prev, snap]);
    }
  }, [token, page, limit]);

  // --------------------------------------------------------------------------------
  // Efecto: chequeo de token => fetchMonitorData
  // --------------------------------------------------------------------------------
  useEffect(() => {
    if (!token) {
      router.push('/');
    } else {
      fetchMonitorData();
    }
  }, [token, router, fetchMonitorData]);

  // --------------------------------------------------------------------------------
  // Efecto: autoRefresh => setInterval / clearInterval
  // --------------------------------------------------------------------------------
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (autoRefresh) {
      // Llamamos fetchMonitorData una vez de entrada
      fetchMonitorData();

      // Luego iniciamos intervalo
      intervalRef.current = setInterval(() => {
        fetchMonitorData();
      }, refreshInterval * 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, refreshInterval, fetchMonitorData]);

  // --------------------------------------------------------------------------------
  // Paginación
  // --------------------------------------------------------------------------------
  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
  };
  const handlePrevPage = () => {
    if (page > 1) {
      setPage(p => p - 1);
    }
  };
  const handleNextPage = () => {
    if (pagination.totalPages && page < pagination.totalPages) {
      setPage(p => p + 1);
    }
  };

  // ===================== #1 QUERIES (Bar) =====================
  const queriesChartData = (() => {
    const allDays = Array.from(new Set(graphData.map(d => d.day))).sort();
    const allUsers = Array.from(new Set(graphData.map(d => d.username || 'Unknown'))).sort();

    const baseColor = '#1677FF'; // Azul principal

    const datasets = allUsers.map((user) => {
      const dataPerDay = allDays.map(day => {
        const found = graphData.find(
          item => item.day === day && (item.username || 'Unknown') === user
        );
        return found ? found.count : 0;
      });
      return {
        label: user,
        data: dataPerDay,
        backgroundColor: baseColor
      };
    });

    return {
      labels: allDays,
      datasets
    };
  })();

  const queriesChartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'bottom' as const },
      title: {
        display: true,
        text: 'Queries by user, grouped by day'
      }
    }
  };

  // ===================== #2 TOKENS => line =====================
  const firstTokensDate = tokensHourly[0]
    ? tokensHourly[0].hour.split(' ')[0]
    : '';

  const tokensLineOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'bottom' as const },
      title: {
        display: true,
        text: firstTokensDate
          ? `Total Tokens (Input vs Output) (${firstTokensDate})`
          : 'Total Tokens (Input vs Output)'
      }
    },
    scales: {
      x: {
        ticks: {
          callback: (value: unknown, idx: number) => {
            const rawLabel = tokensHourly[idx]?.hour || '';
            const splitted = rawLabel.split(' ');
            const timePart = splitted[1] || '';
            return timePart || rawLabel;
          }
        }
      }
    }
  };

  const tokensLineData = {
    labels: tokensHourly.map(d => d.hour),
    datasets: [
      {
        label: 'Total Input Tokens',
        data: tokensHourly.map(d => d.totalInput),
        borderColor: '#1677FF',
        backgroundColor: '#1677FF20',
        fill: false
      },
      {
        label: 'Total Output Tokens',
        data: tokensHourly.map(d => d.totalOutput),
        borderColor: '#A0C8FF',
        backgroundColor: '#A0C8FF20',
        fill: false
      }
    ]
  };

  // ===================== #3 LATENCY => line =====================
  const firstLatencyDate = latencyData[0]
    ? latencyData[0].timestamp.split(' ')[0]
    : '';

  const latencyLineOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'bottom' as const },
      title: {
        display: true,
        text: firstLatencyDate
          ? `Chat Latency per Request (${firstLatencyDate})`
          : 'Chat Latency per Request'
      }
    },
    scales: {
      x: {
        ticks: {
          callback: (value: unknown, idx: number) => {
            const rawLabel = latencyData[idx]?.timestamp || '';
            const splitted = rawLabel.split(' ');
            if (splitted.length > 1) {
              return splitted[1].slice(0, 5); // "HH:mm"
            }
            return rawLabel;
          }
        }
      }
    }
  };

  const latencyLineData = {
    labels: latencyData.map(d => d.timestamp),
    datasets: [
      {
        label: 'Latency (ms)',
        data: latencyData.map(d => d.latencyMs),
        borderColor: '#FF4D4F',
        backgroundColor: '#FF4D4F20',
        fill: false
      }
    ]
  };

  // ===================== #4 CPU/MEM/DISK => line =====================
  const hwLabels = hardwareSnapshots.map(s => s.timestamp);
  const hwLineData = {
    labels: hwLabels,
    datasets: [
      {
        label: 'CPU (%)',
        data: hardwareSnapshots.map(s => s.cpu),
        borderColor: '#FF4D4F',
        backgroundColor: '#FF4D4F20',
        fill: false
      },
      {
        label: 'Mem (%)',
        data: hardwareSnapshots.map(s => s.mem),
        borderColor: '#1677FF',
        backgroundColor: '#1677FF20',
        fill: false
      },
      {
        label: 'Disk (%)',
        data: hardwareSnapshots.map(s => s.disk),
        borderColor: '#A0C8FF',
        backgroundColor: '#A0C8FF20',
        fill: false
      }
    ]
  };

  const hwLineOptions = {
    responsive: true,
    scales: {
      y: {
        suggestedMin: 0,
        suggestedMax: 100
      }
    },
    plugins: {
      legend: { position: 'bottom' as const },
      title: {
        display: true,
        text: 'CPU / Mem / Disk usage (0-100%)'
      }
    }
  };

  // Si no es admin => no puede ver la página
  if (role !== 'admin') {
    return (
      <AdminLayout userRole={role}>
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-4">Monitor</h1>
          <p className="text-red-600">You are not authorized to view this page.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout userRole={role}>
      <div className="p-4">

        {/* Título "Monitor" + Auto-refresh en la misma línea */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Monitor</h1>

          <div className="flex items-center space-x-2">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              <span>Auto-refresh every</span>
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1"
              >
                <option value={1}>1</option>
                <option value={5}>5</option>
                <option value={30}>30</option>
                <option value={60}>60</option>
              </select>
              <span>seconds</span>
            </label>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-red-600 mb-4">Error: {error}</p>
        )}

        {/* Grilla de 4 gráficos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-8">
          {/* #1 Queries (Bar) */}
          <div className="bg-white p-2 rounded border">
            {graphData.length === 0 && !error && (
              <p>No queries graph data found.</p>
            )}
            {graphData.length > 0 && (
              <Bar data={queriesChartData} options={queriesChartOptions} />
            )}
          </div>

          {/* #2 Tokens (Line) */}
          <div className="bg-white p-2 rounded border">
            {tokensHourly.length === 0 && !error && (
              <p>No tokens data found.</p>
            )}
            {tokensHourly.length > 0 && (
              <Line data={tokensLineData} options={tokensLineOptions} />
            )}
          </div>

          {/* #3 Latency (Line) */}
          <div className="bg-white p-2 rounded border">
            {latencyData.length === 0 && !error && (
              <p>No latency data found.</p>
            )}
            {latencyData.length > 0 && (
              <Line data={latencyLineData} options={latencyLineOptions} />
            )}
          </div>

          {/* #4 CPU / Mem / Disk (Line) */}
          <div className="bg-white p-2 rounded border">
            {hardwareSnapshots.length === 0 && !error && (
              <p>No hardware usage data yet. Please wait for auto-refresh...</p>
            )}
            {hardwareSnapshots.length > 0 && (
              <Line data={hwLineData} options={hwLineOptions} />
            )}
          </div>
        </div>

        {/* ============ Usage Logs (tabla) ============ */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-2">Usage Logs</h2>
          {logs.length === 0 && !error && (
            <p>No usage logs found.</p>
          )}
          {logs.length > 0 && (
            <div className="overflow-auto">
              <table className="min-w-full bg-white border border-gray-300">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="py-2 px-4 border-b">ID</th>
                    <th className="py-2 px-4 border-b">UserID</th>
                    <th className="py-2 px-4 border-b">Username</th>
                    <th className="py-2 px-4 border-b">Prompt</th>
                    <th className="py-2 px-4 border-b">Input Tokens</th>
                    <th className="py-2 px-4 border-b">Output Tokens</th>
                    <th className="py-2 px-4 border-b">Timestamp</th>
                    <th className="py-2 px-4 border-b">Latency (ms)</th>
                    {/* NUEVA COLUMNA: Feedback */}
                    <th className="py-2 px-4 border-b">Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="py-2 px-4 border-b text-center">{log.id}</td>
                      <td className="py-2 px-4 border-b text-center">{log.userId}</td>
                      <td className="py-2 px-4 border-b">{log.username || 'Unknown'}</td>
                      <td className="py-2 px-4 border-b">{log.prompt}</td>
                      <td className="py-2 px-4 border-b text-center">{log.inputTokens}</td>
                      <td className="py-2 px-4 border-b text-center">{log.outputTokens}</td>
                      <td className="py-2 px-4 border-b text-center">{log.timestamp}</td>
                      <td className="py-2 px-4 border-b text-center">
                        {log.latencyMs ?? '-'}
                      </td>
                      {/* Valor de la columna feedback */}
                      <td className="py-2 px-4 border-b text-center">
                        {log.feedback || ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginación */}
          <div className="mt-2 flex flex-col sm:flex-row sm:justify-between items-start sm:items-center text-sm text-gray-600">
            <div className="mb-2 sm:mb-0 flex items-center space-x-2">
              <span>Rows per page:</span>
              <select
                value={limit}
                onChange={(e) => handleLimitChange(Number(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1"
              >
                <option value={10}>10</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePrevPage}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                disabled={page <= 1}
              >
                Prev
              </button>
              <span>
                Page {pagination.page || page} / {pagination.totalPages || 1}
              </span>
              <button
                onClick={handleNextPage}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                disabled={
                  !pagination.totalPages || (pagination.totalPages || 1) <= page
                }
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Info textual de CPU/Mem/Disk */}
        {stats && (
          <div>
            <h2 className="text-xl font-semibold mb-2">
              CPU / Mem / Disk Stats (raw data)
            </h2>
            <div className="space-y-2">
              <div>
                <strong>CPU (htop style):</strong>{' '}
                {stats.cpuUtilPercent?.toFixed(1)} %
              </div>
              <div>
                <strong>MemUsed:</strong>{' '}
                {stats.systemMemory?.usedPercent?.toFixed(1)} %
              </div>
              {stats.diskUsage && (
                <div>
                  <strong>DiskUsed:</strong>{' '}
                  {stats.diskUsage.usedPercent?.toFixed(1)} %
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

