// knowledgeBaseManager.js

const express = require('express');
const {
  BedrockAgentClient,
  ListKnowledgeBasesCommand,
  ListDataSourcesCommand,
  ListKnowledgeBaseDocumentsCommand,
  IngestKnowledgeBaseDocumentsCommand,
  DeleteKnowledgeBaseDocumentsCommand
} = require('@aws-sdk/client-bedrock-agent');

const router = express.Router();

// Helper function to find KB by name
async function findKnowledgeBaseByName(name, client) {
  const listCommand = new ListKnowledgeBasesCommand({});
  const listResponse = await client.send(listCommand);
  return listResponse.knowledgeBaseSummaries.find(k => k.name === name);
}

// Middleware para rol "admin"
router.use((req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ status: 'error', error: 'Forbidden' });
  }
  next();
});

router.post('/', async (req, res) => {
  const { action, knowledgeBaseName, dataSourceId, s3Uri } = req.body;

  try {
    const bedrockAgentClient = new BedrockAgentClient({
      region: 'us-east-1',
      credentials: {
        accessKeyId: req.user.awsAccessKeyId,
        secretAccessKey: req.user.awsSecretAccessKey,
      },
    });

    switch (action) {
      // --------------------------------------------------------------------------
      // LISTAR AWS KNOWLEDGE BASES
      // --------------------------------------------------------------------------
      case 'list-aws-knowledge-bases':
        const listCommand = new ListKnowledgeBasesCommand({});
        const listResponse = await bedrockAgentClient.send(listCommand);

        if (!listResponse.knowledgeBaseSummaries || listResponse.knowledgeBaseSummaries.length === 0) {
          return res.json({ awsKnowledgeBases: [], message: 'No KB exists' });
        }

        const mappedKnowledgeBases = await Promise.all(listResponse.knowledgeBaseSummaries.map(async (kbSummary) => {
          const dsCommand = new ListDataSourcesCommand({ knowledgeBaseId: kbSummary.knowledgeBaseId });
          const dataSourceResponse = await bedrockAgentClient.send(dsCommand);
          
          let dataSourceInfo = 'No data source associated';
          if (dataSourceResponse.dataSourceSummaries && dataSourceResponse.dataSourceSummaries.length > 0) {
            const firstDataSource = dataSourceResponse.dataSourceSummaries[0];
            dataSourceInfo = `${firstDataSource.name} (${firstDataSource.dataSourceId})`;
          }

          return {
            name: kbSummary.name,
            id: kbSummary.knowledgeBaseId,
            status: kbSummary.status || 'UNKNOWN',
            dataSource: dataSourceInfo,
          };
        }));

        return res.json({ awsKnowledgeBases: mappedKnowledgeBases });

      // --------------------------------------------------------------------------
      // LISTAR DOCUMENTOS
      // --------------------------------------------------------------------------
      case 'list-documents':
        if (!knowledgeBaseName || !dataSourceId) {
          return res.status(400).json({ status: 'error', error: 'knowledgeBaseName and dataSourceId are required' });
        }

        const kb = await findKnowledgeBaseByName(knowledgeBaseName, bedrockAgentClient);
        if (!kb) {
          return res.status(404).json({ status: 'error', error: 'Knowledge Base not found' });
        }

        const listDocumentsCommand = new ListKnowledgeBaseDocumentsCommand({
          knowledgeBaseId: kb.knowledgeBaseId,
          dataSourceId,
        });
        const documentsResponse = await bedrockAgentClient.send(listDocumentsCommand);

        if (!documentsResponse.documentDetails || documentsResponse.documentDetails.length === 0) {
          return res.json({
            documentDetails: [],
            message: 'No documents found for this data source'
          });
        }

        return res.json({
          documentDetails: documentsResponse.documentDetails.map(doc => ({
            documentId: doc.identifier.s3.uri,
            name: doc.identifier.s3.uri.split('/').pop() || 'Unknown',
            status: doc.status,
            uri: doc.identifier.s3.uri,
          }))
        });

      // --------------------------------------------------------------------------
      // AGREGAR DOCUMENTO AL KB
      // --------------------------------------------------------------------------
      case 'add-document':
        if (!knowledgeBaseName || !dataSourceId || !s3Uri) {
          return res.status(400).json({ status: 'error', error: 'knowledgeBaseName, dataSourceId, and s3Uri are required' });
        }

        const kbToAdd = await findKnowledgeBaseByName(knowledgeBaseName, bedrockAgentClient);
        if (!kbToAdd) {
          return res.status(404).json({ status: 'error', error: 'Knowledge Base not found' });
        }

        const ingestCommand = new IngestKnowledgeBaseDocumentsCommand({
          knowledgeBaseId: kbToAdd.knowledgeBaseId,
          dataSourceId,
          documents: [{
            content: {
              dataSourceType: 'S3',
              s3: {
                s3Location: { uri: s3Uri },
              },
            },
          }],
        });

        const ingestResponse = await bedrockAgentClient.send(ingestCommand);
        return res.status(200).json({
          status: 'success',
          message: 'Document added successfully',
          s3Uri,
          ingestResponse,
        });

      // --------------------------------------------------------------------------
      // ELIMINAR DOCUMENTO DE LA KB
      // --------------------------------------------------------------------------
      case 'delete-document':
        if (!knowledgeBaseName || !dataSourceId || !s3Uri) {
          return res.status(400).json({ status: 'error', error: 'knowledgeBaseName, dataSourceId, and s3Uri are required' });
        }

        const kbToDelete = await findKnowledgeBaseByName(knowledgeBaseName, bedrockAgentClient);
        if (!kbToDelete) {
          return res.status(404).json({ status: 'error', error: 'Knowledge Base not found' });
        }

        const deleteCmd = new DeleteKnowledgeBaseDocumentsCommand({
          knowledgeBaseId: kbToDelete.knowledgeBaseId,
          dataSourceId,
          documentIdentifiers: [{
            dataSourceType: 'S3',
            s3: { uri: s3Uri },
          }],
        });

        const deleteResp = await bedrockAgentClient.send(deleteCmd);
        return res.json({
          status: 'success',
          message: 'Document successfully deleted',
          deleteResp,
        });

      default:
        return res.status(400).json({ status: 'error', error: 'Invalid action' });
    }
  } catch (error) {
    console.error(`Error during ${action}:`, error);
    return res.status(500).json({
      status: 'error',
      error: 'An unexpected error occurred',
      details: error.message
    });
  }
});

module.exports = router;
