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

// Middleware para rol "admin"
router.use((req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});

router.post('/', async (req, res) => {
  const { action, knowledgeBaseName, dataSourceId, s3Uri } = req.body;

  switch (action) {
    // --------------------------------------------------------------------------
    // LISTAR AWS KNOWLEDGE BASES
    // --------------------------------------------------------------------------
    case 'list-aws-knowledge-bases':
      try {
        const bedrockAgentClient = new BedrockAgentClient({
          region: 'us-east-1',
          credentials: {
            accessKeyId: req.user.awsAccessKeyId,
            secretAccessKey: req.user.awsSecretAccessKey,
          },
        });

        // Listar KBs
        const listCommand = new ListKnowledgeBasesCommand({});
        const listResponse = await bedrockAgentClient.send(listCommand);

        if (
          !listResponse.knowledgeBaseSummaries ||
          listResponse.knowledgeBaseSummaries.length === 0
        ) {
          return res.json({ awsKnowledgeBases: [], message: 'No KB exists' });
        }

        const mappedKnowledgeBases = [];

        // Para cada KB, listar dataSources
        for (const kbSummary of listResponse.knowledgeBaseSummaries) {
          const dsCommand = new ListDataSourcesCommand({
            knowledgeBaseId: kbSummary.knowledgeBaseId,
          });
          const dataSourceResponse = await bedrockAgentClient.send(dsCommand);

          let dataSourceInfo = 'No data source associated';
          if (
            dataSourceResponse.dataSourceSummaries &&
            dataSourceResponse.dataSourceSummaries.length > 0
          ) {
            const firstDataSource = dataSourceResponse.dataSourceSummaries[0];
            dataSourceInfo = `${firstDataSource.name} (${firstDataSource.dataSourceId})`;
          }

          mappedKnowledgeBases.push({
            name: kbSummary.name,
            id: kbSummary.knowledgeBaseId,
            status: kbSummary.status || 'UNKNOWN',
            dataSource: dataSourceInfo,
          });

          console.log(
            'Data Sources for KB:',
            JSON.stringify(dataSourceResponse, null, 2)
          );
        }

        return res.json({ awsKnowledgeBases: mappedKnowledgeBases });
      } catch (error) {
        console.error('Error listing AWS knowledge bases or data sources:', error);
        return res.status(500).json({
          error: 'Failed to list AWS knowledge bases or data sources',
          message: 'No KB exists',
        });
      }

    // --------------------------------------------------------------------------
    // LISTAR DOCUMENTOS
    // --------------------------------------------------------------------------
    case 'list-documents':
      if (!knowledgeBaseName || !dataSourceId) {
        return res
          .status(400)
          .json({ error: 'knowledgeBaseName and dataSourceId are required' });
      }

      try {
        const bedrockAgentClient = new BedrockAgentClient({
          region: 'us-east-1',
          credentials: {
            accessKeyId: req.user.awsAccessKeyId,
            secretAccessKey: req.user.awsSecretAccessKey,
          },
        });

        // Buscar la KB por nombre
        const listCommand = new ListKnowledgeBasesCommand({});
        const listResponse = await bedrockAgentClient.send(listCommand);

        const kb = listResponse.knowledgeBaseSummaries.find(
          (k) => k.name === knowledgeBaseName
        );
        if (!kb) {
          return res.status(404).json({ error: 'Knowledge Base not found' });
        }

        console.log(
          'Listing documents for KB:',
          knowledgeBaseName,
          'with data source:',
          dataSourceId
        );

        // Listar documentos
        const listDocumentsCommand = new ListKnowledgeBaseDocumentsCommand({
          knowledgeBaseId: kb.knowledgeBaseId,
          dataSourceId,
        });
        const documentsResponse = await bedrockAgentClient.send(listDocumentsCommand);

        console.log('Documents Response:', JSON.stringify(documentsResponse, null, 2));

        if (
          !documentsResponse.documentDetails ||
          documentsResponse.documentDetails.length === 0
        ) {
          return res.json({
            documentDetails: [],
            message: 'No documents found for this data source',
          });
        }

        return res.json({
          documentDetails: documentsResponse.documentDetails.map((doc) => ({
            documentId: doc.identifier.s3.uri,
            name: doc.identifier.s3.uri.split('/').pop() || 'Unknown',
            status: doc.status,
            uri: doc.identifier.s3.uri,
          })),
        });
      } catch (error) {
        console.error('Error listing documents:', error);
        return res
          .status(500)
          .json({ error: 'Failed to list documents', message: error.message });
      }

    // --------------------------------------------------------------------------
    // AGREGAR DOCUMENTO AL KB
    // --------------------------------------------------------------------------
    case 'add-document':
      if (!knowledgeBaseName || !dataSourceId || !s3Uri) {
        return res.status(400).json({
          error: 'knowledgeBaseName, dataSourceId, and s3Uri are required',
        });
      }

      try {
        const bedrockAgentClient = new BedrockAgentClient({
          region: 'us-east-1',
          credentials: {
            accessKeyId: req.user.awsAccessKeyId,
            secretAccessKey: req.user.awsSecretAccessKey,
          },
        });

        // 1) Buscar la KB
        const listCommand = new ListKnowledgeBasesCommand({});
        const listResponse = await bedrockAgentClient.send(listCommand);

        const kb = listResponse.knowledgeBaseSummaries.find(
          (x) => x.name === knowledgeBaseName
        );
        if (!kb) {
          return res.status(404).json({ error: 'Knowledge Base not found' });
        }

        console.log(
          'Adding document to KB:',
          knowledgeBaseName,
          'with data source:',
          dataSourceId,
          'S3 URI:',
          s3Uri
        );

        // 2) Estructura que la API pide: dataSourceType='S3'
        const ingestCommand = new IngestKnowledgeBaseDocumentsCommand({
          knowledgeBaseId: kb.knowledgeBaseId,
          dataSourceId,
          documents: [
            {
              content: {
                dataSourceType: 'S3',
                s3: {
                  s3Location: {
                    uri: s3Uri,
                  },
                },
              },
              // contentType: "application/pdf", // si la API lo exige
            },
          ],
        });

        // 3) Enviar la solicitud
        const ingestResponse = await bedrockAgentClient.send(ingestCommand);
        console.log('Ingest response:', ingestResponse);

        return res.status(200).json({
          message: 'Document added successfully',
          s3Uri,
          ingestResponse,
        });
      } catch (error) {
        console.error('Error adding document:', error);
        return res
          .status(500)
          .json({ error: 'Failed to add document', message: error.message });
      }

    // --------------------------------------------------------------------------
    // ELIMINAR DOCUMENTO DE LA KB
    // --------------------------------------------------------------------------
    case 'delete-document':
      if (!knowledgeBaseName || !dataSourceId || !s3Uri) {
        return res.status(400).json({
          error: 'knowledgeBaseName, dataSourceId, and s3Uri are required',
        });
      }

      try {
        const bedrockAgentClient = new BedrockAgentClient({
          region: 'us-east-1',
          credentials: {
            accessKeyId: req.user.awsAccessKeyId,
            secretAccessKey: req.user.awsSecretAccessKey,
          },
        });

        // 1) Buscar la KB
        const listCmd = new ListKnowledgeBasesCommand({});
        const listResp = await bedrockAgentClient.send(listCmd);

        const kb = listResp.knowledgeBaseSummaries.find(
          (k) => k.name === knowledgeBaseName
        );
        if (!kb) {
          return res.status(404).json({ error: 'Knowledge Base not found' });
        }

        console.log('Deleting document =>', s3Uri);

        // 2) Llamar DeleteKnowledgeBaseDocumentsCommand
        const deleteCmd = new DeleteKnowledgeBaseDocumentsCommand({
          knowledgeBaseId: kb.knowledgeBaseId,
          dataSourceId,
          documentIdentifiers: [
            {
              dataSourceType: 'S3',
              s3: { uri: s3Uri },
            },
          ],
        });

        const deleteResp = await bedrockAgentClient.send(deleteCmd);
        console.log('Delete response =>', deleteResp);

        return res.json({
          message: 'Document successfully deleted',
          deleteResp,
        });
      } catch (error) {
        console.error('Error deleting document:', error);
        return res.status(500).json({
          error: 'Failed to delete document',
          details: error.message,
        });
      }

    // --------------------------------------------------------------------------
    // ACTION INVÁLIDA
    // --------------------------------------------------------------------------
    default:
      return res.status(400).json({ error: 'Invalid action' });
  }
});

module.exports = router;

