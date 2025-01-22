// pages/admin/knowledgebase.tsx

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthProvider';
import AdminLayout from '../../components/AdminLayout';
import { myFetch } from '../../utils/myFetch';

interface AWSKnowledgeBase {
  name: string;
  id: string;
  status: string;
  dataSource: string; // e.g. "S3 (12345-uuid...)"
}

interface DocumentData {
  documentId: string;
  name: string;
  status: string;
  uri: string | null;
}

export default function KnowledgeBasePage() {
  const { token, role } = useAuth();
  const router = useRouter();

  const [activeKnowledgeBase, setActiveKnowledgeBase] = useState<AWSKnowledgeBase | null>(null);
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [uploadStatus, setUploadStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Function to fetch documents for a given knowledge base and data source
  const fetchDocuments = useCallback(async (knowledgeBaseName: string, dataSourceId: string) => {
    setIsLoading(true);
    try {
      const bodyPayload = {
        action: 'list-documents',
        knowledgeBaseName,
        dataSourceId,
      };
      const result = await myFetch('/admin/knowledge-base-manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      if (result.status === 'error') {
        console.error('Error listing documents:', result.message);
        return;
      }

      const data = result.data || {};
      if (data.documentDetails && data.documentDetails.length > 0) {
        // Sort documents alphabetically by name
        setDocuments([...data.documentDetails].sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        setDocuments([]);
        console.log('No documents found or documentDetails is empty.');
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Helper to extract data source ID from the string format
  const extractDataSourceId = (dataSource: string): string | null => {
    const match = dataSource.match(/\(([^)]+)\)/);
    return match ? match[1] : null;
  };

  // Function to fetch active knowledge base
  const fetchActiveKnowledgeBase = useCallback(async () => {
    setIsLoading(true);
    try {
      const bodyPayload = { action: 'list-aws-knowledge-bases' };
      const result = await myFetch('/admin/knowledge-base-manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      if (result.status === 'error') {
        console.error('Error listing KBs:', result.message);
        return;
      }

      const data = result.data || {};
      const activeKB = data.awsKnowledgeBases?.find(
        (kb: AWSKnowledgeBase) => kb.status === 'ACTIVE'
      );
      setActiveKnowledgeBase(activeKB || null);

      if (activeKB) {
        const dataSourceId = extractDataSourceId(activeKB.dataSource);
        if (dataSourceId) {
          fetchDocuments(activeKB.name, dataSourceId);
        }
      }
    } catch (error) {
      console.error('Error fetching AWS knowledge bases:', error);
      setActiveKnowledgeBase(null);
    } finally {
      setIsLoading(false);
    }
  }, [fetchDocuments]);

  useEffect(() => {
    if (!token || role !== 'admin') {
      router.push('/');
      return;
    }
    fetchActiveKnowledgeBase();
    // Clear upload status when component mounts or re-mounts
    setUploadStatus('');
  }, [token, role, router, fetchActiveKnowledgeBase]);

  // Function to handle file upload for multiple files in batches with retry
  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploadStatus("Uploading Documents...");

    const fileBatches = [];
    for (let i = 0; i < files.length; i += 10) {
      fileBatches.push(Array.from(files).slice(i, i + 10));
    }

    let hasErrors = false;
    for (let batchIndex = 0; batchIndex < fileBatches.length; batchIndex++) {
      const batch = fileBatches[batchIndex];

      try {
        const uploadPromises = batch.map(file => {
          const formData = new FormData();
          formData.append('file', file);
          return myFetch('/file-upload-manager', {
            method: 'POST',
            body: formData,
          });
        });

        const uploadResponses = await Promise.all(uploadPromises);

        // Handle document addition with retry strategy
        const addDocumentPromises = uploadResponses.map(async (uploadRes, index) => {
          let retries = 0;
          const maxRetries = 3;
          const baseDelay = 1000; // 1 second initial delay

          while (retries < maxRetries) {
            try {
              if (uploadRes.status === 'error') {
                throw new Error(uploadRes.message || 'Failed to upload file');
              }
              const uploadData = uploadRes.data || {};
              const location = uploadData.files
                ? uploadData.files[0].location
                : (uploadData.location || (uploadData.locations && uploadData.locations[0]));
              if (!location) throw new Error('No location in upload response');

              if (!activeKnowledgeBase) throw new Error('No active KB found to index document');

              const dataSourceId = extractDataSourceId(activeKnowledgeBase.dataSource);
              if (!dataSourceId) throw new Error('Could not parse dataSourceId');

              const urlObj = new URL(location);
              const bucketName = urlObj.host.split('.')[0];
              const pathName = urlObj.pathname.startsWith('/')
                ? urlObj.pathname.substring(1)
                : urlObj.pathname;
              const s3Uri = `s3://${bucketName}/${pathName}`;

              const addDocRes = await myFetch('/admin/knowledge-base-manager', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'add-document',
                  knowledgeBaseName: activeKnowledgeBase.name,
                  dataSourceId,
                  s3Uri,
                }),
              });

              if (addDocRes.status === 'error') {
                throw new Error(addDocRes.message || 'Failed to add document');
              }

              // Si llegó aquí, se subió y agregó exitosamente => devolver nombre de archivo
              return batch[index].name;

            } catch (error: unknown) {
              // Type guard para acceder a error.message
              if (
                error instanceof Error &&
                error.message.includes('max number of documentLevelAPI request')
              ) {
                retries++;
                const delay = baseDelay * Math.pow(2, retries); // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, delay));
              } else {
                // Para otros errores, dejamos de reintentar
                throw error;
              }
            }
          }

          throw new Error(`Failed to add document after ${maxRetries} retries`);
        });

        const results = await Promise.allSettled(addDocumentPromises);

        const batchErrors = results
          .filter(result => result.status === 'rejected')
          .map(
            (result, index) =>
              `${batch[index].name}: ${(result as PromiseRejectedResult).reason.message}`
          );

        if (batchErrors.length > 0) {
          hasErrors = true;
        }

        // Add a delay before starting the next batch to avoid hitting rate limits immediately
        if (batchIndex < fileBatches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay before next batch
        }
      } catch (err) {
        hasErrors = true;
        console.error(`Error processing batch ${batchIndex + 1}:`, err);
        break; // Stop processing if there's an overarching error
      }
    }

    // Final status message - this will persist until the page is refreshed or navigated away
    setUploadStatus(hasErrors ? "Upload completed with issues" : "Upload complete");

    // Refresh documents list after all batches are processed
    if (activeKnowledgeBase) {
      const dataSourceId = extractDataSourceId(activeKnowledgeBase.dataSource);
      if (dataSourceId) {
        fetchDocuments(activeKnowledgeBase.name, dataSourceId);
      }
    }
  }

  // Function to handle document removal
  async function handleRemoveDocument(documentId: string) {
    if (!activeKnowledgeBase) return;
    const dataSourceId = extractDataSourceId(activeKnowledgeBase.dataSource);
    if (!dataSourceId) {
      console.error('Could not parse dataSourceId for deleting doc');
      return;
    }

    if (!confirm(`Are you sure you want to remove document: ${documentId}?`)) {
      return;
    }

    try {
      const removeRes = await myFetch('/admin/knowledge-base-manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete-document',
          knowledgeBaseName: activeKnowledgeBase.name,
          dataSourceId,
          s3Uri: documentId,
        }),
      });

      if (removeRes.status === 'error') {
        alert(`Error deleting document: ${removeRes.message}`);
        return;
      }

      alert('Document deleted successfully');
      fetchDocuments(activeKnowledgeBase.name, dataSourceId);
    } catch (err) {
      console.error('Error deleting document:', err);
      alert('An error occurred while deleting the document');
    }
  }

  if (!token || role !== 'admin') return null;

  return (
    // NOTA: Ya no pasamos activeMenu
    <AdminLayout userRole={role}>
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Knowledge Base</h1>

        {activeKnowledgeBase ? (
          <>
            <div className="mb-4">
              <h2 className="text-lg font-semibold mb-2">Name:</h2>
              <p>
                {activeKnowledgeBase.name} (status: {activeKnowledgeBase.status})
              </p>
            </div>

            <div className="mb-4">
              <h2 className="text-lg font-semibold mb-2">Documents:</h2>

              {isLoading ? (
                <p>Loading documents...</p>
              ) : (
                <div className="space-y-4">
                  {documents.length > 0 ? (
                    <div className="max-w-lg overflow-x-auto border rounded bg-white">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 border-b">
                          <tr>
                            <th className="py-2 px-4 text-left">Document</th>
                            <th className="py-2 px-2 w-12 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {documents.map((doc) => (
                            <tr key={doc.documentId} className="border-b">
                              <td className="py-2 px-4">{doc.name}</td>
                              <td className="py-2 px-2 w-12 text-center align-middle">
                                <button
                                  onClick={() => handleRemoveDocument(doc.documentId)}
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
                    </div>
                  ) : (
                    <p>No documents found.</p>
                  )}

                  <label className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 cursor-pointer inline-block">
                    Add Documents
                    <input
                      type="file"
                      onChange={handleFileUpload}
                      accept=".pdf,.doc,.docx,.html,.xls,.xlsx,.csv,.txt"
                      multiple
                      className="hidden"
                    />
                  </label>
                  {uploadStatus && <p className="text-sm text-gray-600">{uploadStatus}</p>}
                </div>
              )}
            </div>
          </>
        ) : (
          <p>No active knowledge base found.</p>
        )}
      </div>
    </AdminLayout>
  );
}

