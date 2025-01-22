// smartChatbotManager.js
const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./users.db');
const { TextDecoder } = require('util');
const { Buffer } = require('buffer');
const {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand
} = require('@aws-sdk/client-bedrock-agent-runtime');

//
// 1) POST /  => Invocar chatbot + streaming SSE
//
router.post('/', async (req, res) => {
  console.log('POST /smart-chatbot => body:', req.body);

  const startTime = Date.now();
  const { userId } = req.user || {};
  const { userPrompt, sessionId } = req.body || {};

  if (!userPrompt || !userPrompt.trim()) {
    return res.status(400).json({ error: 'userPrompt is required' });
  }

  try {
    // Leer settings => bedrock
    const settings = await new Promise((resolve, reject) => {
      db.get(`
        SELECT agentRealId, agentAliasId,
               awsAccessKeyId, awsSecretAccessKey
        FROM settings
        LIMIT 1
      `, (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!settings) {
      return res.status(400).json({ error: 'No bedrock settings found.' });
    }
    const { agentRealId, agentAliasId, awsAccessKeyId, awsSecretAccessKey } = settings;

    if (!agentRealId || !agentAliasId) {
      return res.status(400).json({ error: 'No agentId/agentAliasId in settings' });
    }
    if (!awsAccessKeyId || !awsSecretAccessKey) {
      return res.status(400).json({ error: 'AWS credentials missing in settings' });
    }

    console.log(`${new Date().toISOString()} - userId=${userId || '(unknown)'}, agentId=${agentRealId}, aliasId=${agentAliasId}`);

    const agentRuntime = new BedrockAgentRuntimeClient({
      region: 'us-east-1',
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey
      }
    });

    const finalSessionId = sessionId || `sess-${Date.now()}`;
    const finalPrompt = `Human: ${userPrompt}\nAssistant:`;

    // Preparamos el comando => streaming
    const command = new InvokeAgentCommand({
      agentId: agentRealId,
      agentAliasId,
      sessionId: finalSessionId,
      inputText: finalPrompt,
      enableResponseStreaming: true,
      enableTrace: true
    });

    console.log(`${new Date().toISOString()} - Invoking agent: ${agentRealId}/${agentAliasId}, session=${finalSessionId}, streaming=true`);
    const response = await agentRuntime.send(command);
    console.log(`${new Date().toISOString()} - Agent response streaming initiated`);

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true'
    });

    let finalAnswer = '';
    let usage = { inputTokens: 0, outputTokens: 0 };

    const messageStream = response?.completion?.options?.messageStream;
    if (!messageStream) {
      console.log(`${new Date().toISOString()} - No streaming available. Check Bedrock config.`);
    } else {
      console.log(`${new Date().toISOString()} - Streaming is active.`);

      // Leer chunks
      for await (const chunk of messageStream) {
        if (chunk?.body && typeof chunk.body === 'object') {
          const byteArray = new Uint8Array(Object.values(chunk.body));
          const chunkStr = new TextDecoder('utf-8').decode(byteArray);

          try {
            const parsed = JSON.parse(chunkStr);
            // Extraer usage
            const usageObj = parsed?.trace?.orchestrationTrace?.modelInvocationOutput?.metadata?.usage;
            if (usageObj) {
              usage.inputTokens = usageObj.inputTokens || 0;
              usage.outputTokens = usageObj.outputTokens || 0;
            }

            // Extraer contenido
            if (parsed.bytes) {
              const asBuffer = Buffer.from(parsed.bytes, 'base64');
              const decodedText = new TextDecoder('utf-8').decode(asBuffer);
              try {
                const subParsed = JSON.parse(decodedText);
                if (subParsed.content) {
                  finalAnswer += subParsed.content;
                  console.log(`${new Date().toISOString()} - Sending chunk =>`, subParsed.content);
                  res.write(`data: ${JSON.stringify({ assistantContent: subParsed.content })}\n\n`);
                }
              } catch {
                // no era JSON => texto plano
                finalAnswer += decodedText;
                console.log(`${new Date().toISOString()} - Sending raw =>`, decodedText);
                res.write(`data: ${JSON.stringify({ assistantContent: decodedText })}\n\n`);
              }
            } else if (parsed.content) {
              finalAnswer += parsed.content;
              console.log(`${new Date().toISOString()} - Sending chunk =>`, parsed.content);
              res.write(`data: ${JSON.stringify({ assistantContent: parsed.content })}\n\n`);
            }
          } catch (parseErr) {
            console.log(`${new Date().toISOString()} - Error parsing chunk:`, parseErr, ', raw:', chunkStr);
          }
        }
      }
    }

    // Fin streaming => Insert usageLogs
    const endTime = Date.now();
    const latencyMs = endTime - startTime;

    const username = await new Promise((resolve) => {
      db.get(`SELECT name FROM users WHERE id = ?`, [userId], (err, row) => {
        if (err || !row) return resolve('(unknown user)');
        resolve(row.name || '(no name)');
      });
    });

    db.run(`
      INSERT INTO usageLogs (
        userId, username, prompt,
        inputTokens, outputTokens,
        latencyMs
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      userId || null,
      username,
      userPrompt,
      usage.inputTokens,
      usage.outputTokens,
      latencyMs
    ],
    function(err) {
      if (err) {
        console.error('Error inserting usage log:', err);
        // Aun así terminamos SSE
        res.end();
      } else {
        const usageLogId = this.lastID;
        console.log(`${new Date().toISOString()} - usageLogs => ID=${usageLogId}, userId=${userId}, prompt="${userPrompt}" (usage in/out = ${usage.inputTokens}/${usage.outputTokens}, lat=${latencyMs}ms)`);

        // Enviamos un último SSE con usageLogId
        res.write(`data: ${JSON.stringify({ done: true, usageLogId })}\n\n`);
        // Terminamos SSE
        res.end();
      }
    });

  } catch (error) {
    console.error(`${new Date().toISOString()} - Error calling AgentRuntime:`, error);
    // Enviar SSE con error
    res.write(`data: ${JSON.stringify({ error: 'Error calling AgentRuntime', details: error.message })}\n\n`);
    res.end();
  }
});

//
// 2) POST /feedback => Actualizar usageLogs.feedback
//
router.post('/feedback', (req, res) => {
  const { userId } = req.user; // authenticateToken => user con userId
  const { usageLogId, feedback } = req.body || {};

  console.log('POST /smart-chatbot/feedback =>', { userId, usageLogId, feedback });

  if (!usageLogId || !feedback) {
    return res.status(400).json({ error: 'usageLogId and feedback are required.' });
  }

  db.run(`
    UPDATE usageLogs
    SET feedback = ?
    WHERE id = ?
  `, [feedback, usageLogId], function(err) {
    if (err) {
      console.error('Error updating usageLogs feedback:', err);
      return res.status(500).json({ error: 'Database error updating feedback' });
    }
    if (this.changes === 0) {
      console.log('No usageLog row found with id=', usageLogId);
      return res.status(404).json({ error: 'usageLogId not found' });
    }
    console.log(`Feedback updated => usageLogId=${usageLogId}, feedback=${feedback}`);
    return res.json({ status: 'ok', message: 'Feedback updated' });
  });
});

module.exports = router;

