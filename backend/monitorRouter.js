// monitorRouter.js
const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./users.db');
const os = require('os');
const { execSync } = require('child_process'); // Para ejecutar df -k

// Variable global para guardar la última lectura de "/proc/stat"
let lastProcStat = null;

/**
 * Lee /proc/stat y devuelve un objeto { idle, total } de la línea "cpu" global.
 * /proc/stat -> línea ej: "cpu  3357 0 4313 1362393 ..." => user nice system idle ...
 */
function readProcStatCpu() {
  try {
    const lines = require('fs').readFileSync('/proc/stat', 'utf8').split('\n');
    // Buscamos la línea que empieza con "cpu " (espacio), la "global"
    for (let line of lines) {
      if (line.startsWith('cpu ')) {
        // Ej: "cpu  3357 0 4313 1362393 ..."
        const parts = line.trim().split(/\s+/);
        // parts => ["cpu", user, nice, system, idle, iowait, irq, softirq, steal, guest, guest_nice...]
        // Tomamos idle + iowait como "idle", y sumamos todo para "total"
        const user = parseInt(parts[1], 10) || 0;
        const nice = parseInt(parts[2], 10) || 0;
        const system = parseInt(parts[3], 10) || 0;
        const idle = parseInt(parts[4], 10) || 0;
        const iowait = parseInt(parts[5], 10) || 0;
        const irq = parseInt(parts[6], 10) || 0;
        const softirq = parseInt(parts[7], 10) || 0;
        const steal = parseInt(parts[8], 10) || 0;
        const guest = parseInt(parts[9], 10) || 0;
        const guestNice = parseInt(parts[10], 10) || 0;

        const idleAll = idle + iowait;
        const total = user + nice + system + idle + iowait + irq + softirq + steal + guest + guestNice;
        return { idle: idleAll, total };
      }
    }
  } catch (err) {
    console.error('Error reading /proc/stat:', err);
  }
  // Si algo falla, devolvemos null
  return null;
}

/**
 * Calcula el uso total de CPU (%) comparando la lectura actual con la previa.
 * Retorna un número 0..100 (aprox).
 */
function getCpuUsagePercent() {
  const current = readProcStatCpu();
  if (!current) {
    return 0;
  }
  if (!lastProcStat) {
    // primera vez => guardamos y retornamos 0
    lastProcStat = current;
    return 0;
  }

  // deltas
  const idleDelta = current.idle - lastProcStat.idle;
  const totalDelta = current.total - lastProcStat.total;

  // Actualizar lastProcStat para la próxima
  lastProcStat = current;

  if (totalDelta <= 0) {
    return 0;
  }
  const usage = 100 - (idleDelta / totalDelta) * 100;
  return usage;
}

// GET /admin/monitor
router.get('/', (req, res) => {
  // 1) Chequeo de autenticación
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admins only' });
  }

  // 2) Paginación
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const validLimits = [10, 50, 100];
  if (!validLimits.includes(limit)) {
    return res.status(400).json({ error: 'Invalid limit (use 10, 50, or 100)' });
  }
  const offset = (page - 1) * limit;

  // 3) Contar logs totales
  db.get(`SELECT COUNT(*) as total FROM usageLogs`, (errCount, rowCount) => {
    if (errCount) {
      console.error('Error counting usage logs:', errCount);
      return res.status(500).json({ error: 'Database error', details: errCount.message });
    }
    const totalLogs = rowCount ? rowCount.total : 0;
    const totalPages = Math.ceil(totalLogs / limit);

    // 4) Seleccionar logs paginados
    db.all(`
      SELECT
        id,
        userId,
        username,
        prompt,
        inputTokens,
        outputTokens,
        timestamp,
        latencyMs
      FROM usageLogs
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `, [limit, offset], (errLogs, logs) => {
      if (errLogs) {
        console.error('Error fetching usage logs:', errLogs);
        return res.status(500).json({ error: 'Database error', details: errLogs.message });
      }

      // 5) Stats de CPU/Memoria
      const memUsage = process.memoryUsage(); // { rss, heapTotal, heapUsed, external, ... }
      const cpuUsage = process.cpuUsage();    // { user, system } microsegundos => del proceso
      const loadAvg = os.loadavg();           // [1, 5, 15]
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const cpuCount = os.cpus().length;

      // a) Memoria del sistema
      const systemUsedMem = totalMem - freeMem;
      const systemUsedMemPercent = totalMem > 0
        ? (systemUsedMem / totalMem) * 100
        : 0;

      // b) CPU del proceso en microsegundos => user vs system (acumulado)
      const totalCpuMicro = cpuUsage.user + cpuUsage.system;
      let userPercent = 0, systemPercent = 0;
      if (totalCpuMicro > 0) {
        userPercent = (cpuUsage.user / totalCpuMicro) * 100;
        systemPercent = (cpuUsage.system / totalCpuMicro) * 100;
      }

      // c) loadAvg1mPercent (opcional)
      const loadAvg1mPercent = cpuCount > 0
        ? (loadAvg[0] / cpuCount) * 100
        : 0;

      // d) CPU usage total al estilo "htop" => leer /proc/stat, comparar con la lectura previa
      const cpuUtilPercent = getCpuUsagePercent();

      // 6) Revisar disco con df -k /
      let diskUsage = null;
      try {
        const dfOutput = execSync('df -k /').toString();
        // lines[0] => encabezado, lines[1] => /dev/sda1 1K-blocks used available ...
        const lines = dfOutput.trim().split('\n');
        if (lines.length > 1) {
          const cols = lines[1].split(/\s+/);
          const blocks1k = parseInt(cols[1], 10);
          const usedBlocks = parseInt(cols[2], 10);
          const freeBlocks = parseInt(cols[3], 10);

          const totalDiskBytes = blocks1k * 1024;
          const usedDiskBytes = usedBlocks * 1024;
          const freeDiskBytes = freeBlocks * 1024;
          const usedDiskPercent = totalDiskBytes > 0
            ? (usedDiskBytes / totalDiskBytes) * 100
            : 0;

          diskUsage = {
            total: totalDiskBytes,
            used: usedDiskBytes,
            free: freeDiskBytes,
            usedPercent: usedDiskPercent
          };
        }
      } catch (errDisk) {
        console.error('Error running df -k /:', errDisk);
        // diskUsage = null
      }

      // 7) stats final
      const stats = {
        // Memoria proceso
        processMemory: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external
        },
        // CPU proceso (acumulado)
        processCpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
          userPercent,
          systemPercent
        },
        // CPU usage total (estilo htop)
        cpuUtilPercent,  // <--- Este es el "grande"
        // Load average
        systemLoad: loadAvg,      // [1,5,15]
        loadAvg1mPercent,         // ~ saturación en 1m
        // Memoria del sistema
        systemMemory: {
          totalMem,
          freeMem,
          usedMem: systemUsedMem,
          usedPercent: systemUsedMemPercent
        },
        // CPU count
        cpuCount,
        // Disco
        diskUsage
      };

      // 8) “Queries by user, grouped by day”
      db.all(`
        SELECT
          DATE(timestamp) AS day,
          username,
          COUNT(*) AS count
        FROM usageLogs
        GROUP BY day, username
        ORDER BY day ASC
      `, (errGraph, rowsGraph) => {
        if (errGraph) {
          console.error('Error fetching graph data:', errGraph);
          return res.status(500).json({ error: 'Database error', details: errGraph.message });
        }

        // 9) “Tokens in-out by hour”
        db.all(`
          SELECT
            strftime('%Y-%m-%d %H:00', timestamp) AS hour,
            SUM(inputTokens) AS totalInput,
            SUM(outputTokens) AS totalOutput
          FROM usageLogs
          GROUP BY hour
          ORDER BY hour ASC
        `, (errTokens, rowsTokens) => {
          if (errTokens) {
            console.error('Error fetching tokensHourly data:', errTokens);
            return res.status(500).json({ error: 'Database error', details: errTokens.message });
          }

          // 10) Latencia (por request)
          db.all(`
            SELECT
              timestamp,
              latencyMs
            FROM usageLogs
            ORDER BY timestamp ASC
          `, (errLatency, rowsLatency) => {
            if (errLatency) {
              console.error('Error fetching latency data:', errLatency);
              return res.status(500).json({ error: 'Database error', details: errLatency.message });
            }

            // 11) Respuesta final
            return res.json({
              logs,
              stats,
              graphData: rowsGraph,
              tokensHourly: rowsTokens,
              latencyData: rowsLatency,
              pagination: {
                page,
                limit,
                total: totalLogs,
                totalPages
              }
            });
          });
        });
      });
    });
  });
});

module.exports = router;

