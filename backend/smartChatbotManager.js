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

router.post('/', async (req, res) => {
  console.log('POST /smart-chatbot => body:', req.body);

  const startTime = Date.now();

  // userId sacado de JWT
  const { userId } = req.user || {};

  // Solo userPrompt, sin systemPrompt
  const { userPrompt, sessionId } = req.body || {};
  if (!userPrompt || !userPrompt.trim()) {
    return res.status(400).json({ error: 'userPrompt is required' });
  }

  try {
    // 1) Carga config
    const settings = await new Promise((resolve, reject) => {
      db.get(`
        SELECT agentRealId, agentAliasId, awsAccessKeyId, awsSecretAccessKey
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
    const {
      agentRealId,
      agentAliasId,
      awsAccessKeyId,
      awsSecretAccessKey
    } = settings;

    if (!agentRealId || !agentAliasId) {
      return res.status(400).json({ error: 'No agentId/agentAliasId in settings' });
    }
    if (!awsAccessKeyId || !awsSecretAccessKey) {
      return res.status(400).json({ error: 'AWS credentials missing in settings' });
    }

    console.log(`UserID=${userId || '(unknown)'} => agentId=${agentRealId}, aliasId=${agentAliasId}`);

    // 2) Creamos client
    const agentRuntime = new BedrockAgentRuntimeClient({
      region: 'us-east-1',
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey
      }
    });

    // 3) sessionId
    const finalSessionId = sessionId || `sess-${Date.now()}`;

    // 4) finalPrompt => sin systemPrompt, si deseas un “Human:…” formateado, hazlo:
    const finalPrompt = `Human: ${userPrompt}\nAssistant:`;

    console.log('Final prompt =>\n', finalPrompt);

    // 5) Invocar con streaming
    const command = new InvokeAgentCommand({
      agentId: agentRealId,
      agentAliasId,
      sessionId: finalSessionId,
      inputText: finalPrompt, 
      enableResponseStreaming: true,  // streaming
      enableTrace: true               // logs tokens usage
    });

    console.log(`Invoking agent: ${agentRealId}/${agentAliasId}, session=${finalSessionId}, streaming=true`);

    const response = await agentRuntime.send(command);
    console.log('Agent raw response =>', JSON.stringify(response, null, 2));

    let finalAnswer = '';
    let usage = { inputTokens: 0, outputTokens: 0 };

    const messageStream = response?.completion?.options?.messageStream;
    const utf8Decoder = new TextDecoder('utf-8');

    if (messageStream) {
      console.log('=== Receiving streamed content... ===');

      for await (const chunk of messageStream) {
        if (chunk?.body && typeof chunk.body === 'object') {
          const byteArray = new Uint8Array(Object.values(chunk.body));
          const chunkStr = utf8Decoder.decode(byteArray);
          try {
            const parsed = JSON.parse(chunkStr);

            // usage
            const usageObj = parsed?.trace?.orchestrationTrace?.modelInvocationOutput?.metadata?.usage;
            if (usageObj) {
              usage = {
                inputTokens: usageObj.inputTokens || 0,
                outputTokens: usageObj.outputTokens || 0
              };
              console.log('Detected usage stats =>', usage);
            }

            // finalResponse
            const finalResp = parsed?.trace?.orchestrationTrace?.observation?.finalResponse?.text;
            if (finalResp) {
              finalAnswer = finalResp;
              console.log('Detected finalResponse =>', finalAnswer);
            }

            // parse chunk => subParsed
            if (parsed.bytes) {
              const asBuffer = Buffer.from(parsed.bytes, 'base64');
              const decodedText = utf8Decoder.decode(asBuffer);
              try {
                const subParsed = JSON.parse(decodedText);
                if (subParsed.content && !finalResp) {
                  finalAnswer += subParsed.content;
                }
                console.log('Decoded chunk =>', subParsed.content || decodedText);
              } catch {
                console.log('Decoded chunk =>', decodedText);
              }
            } else if (parsed.content && !finalResp) {
              finalAnswer += parsed.content;
              console.log('parsed.content =>', parsed.content);
            }
          } catch {
            console.log('DEBUG chunkStr =>', chunkStr);
          }
        }
      }
    } else {
      if (response.generatedText) {
        finalAnswer = response.generatedText;
      } else {
        finalAnswer = '(No streamed content or generatedText found)';
      }
    }

    console.log('=== Final Assembled Answer ===', finalAnswer);

    // latencia
    const endTime = Date.now();
    const latencyMs = endTime - startTime;

    // logs usage
    const username = await new Promise((resolve) => {
      db.get(`SELECT name FROM users WHERE id = ?`, [userId], (err, row) => {
        if (err || !row) return resolve('(unknown user)');
        resolve(row.name || '(no name)');
      });
    });

    db.run(`
      INSERT INTO usageLogs (userId, username, prompt, inputTokens, outputTokens, latencyMs)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [ 
      userId || null,
      username,
      userPrompt, // Solo el userPrompt
      usage.inputTokens,
      usage.outputTokens,
      latencyMs
    ],
    (err) => {
      if (err) {
        console.error('Error inserting usage log:', err);
      } else {
        console.log(`Usage log => userId=${userId}, prompt="${userPrompt}", usage=(${usage.inputTokens}/${usage.outputTokens}), latencyMs=${latencyMs}`);
      }
    });

    // Devolver la respuesta final
    return res.json({
      message: 'OK from /smart-chatbot (Agent streaming no systemPrompt)',
      sessionId: finalSessionId,
      assistantContent: finalAnswer
    });

  } catch (error) {
    console.error('Error calling AgentRuntime:', error);
    return res.status(500).json({
      error: 'Error calling AgentRuntime',
      details: error.message
    });
  }
});

module.exports = router;

