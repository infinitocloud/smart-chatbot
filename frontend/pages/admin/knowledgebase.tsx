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

  // KB activa (o null si no hay)
  const [activeKnowledgeBase, setActiveKnowledgeBase] = useState<AWSKnowledgeBase | null>(null);

  // Lista de documentos en la KB
  const [documents, setDocuments] = useState<DocumentData[]>([]);

  // Estado para mensajes en la UI (subiendo, error, éxito, etc.)
  const [uploadStatus, setUploadStatus] = useState('');

  // 1) Listar documentos (useCallback para que sea dependencia estable)
  const fetchDocuments = useCallback(async (knowledgeBaseName: string, dataSourceId: string) => {
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
        setDocuments(data.documentDetails);
      } else {
        setDocuments([]);
        console.log('No documents found or documentDetails is empty.');
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      setDocuments([]);
    }
  }, [setDocuments]);

  // 2) Obtener la KB activa (useCallback también)
  const fetchActiveKnowledgeBase = useCallback(async () => {
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

      // Si tenemos KB activa => cargar sus documentos
      if (activeKB) {
        const match = activeKB.dataSource.match(/\(([^)]+)\)/);
        const dataSourceId = match?.[1];
        if (dataSourceId) {
          fetchDocuments(activeKB.name, dataSourceId);
        }
      }
    } catch (error) {
      console.error('Error fetching AWS knowledge bases:', error);
      setActiveKnowledgeBase(null);
    }
  }, [fetchDocuments, setActiveKnowledgeBase]);

  // 3) useEffect => sólo se activa cuando cambien token, role o router
  //    (y se reejecuta si fetchActiveKnowledgeBase cambia su referencia, cosa que no ocurrirá
  //     mientras mantengas la misma dependencia array en useCallback)
  useEffect(() => {
    // Si no hay token o no es admin, redirigir
    if (!token || role !== 'admin') {
      router.push('/');
      return;
    }
    fetchActiveKnowledgeBase();
  }, [token, role, router, fetchActiveKnowledgeBase]);

  // 4) Subir archivo => /file-upload-manager => luego add-document
  //    (no está en un useEffect, así que no hace falta useCallback a menos que quieras)
  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploadStatus('Uploading file...');

    // 1) Subimos el archivo al endpoint /file-upload-manager
    const formData = new FormData();
    formData.append('file', files[0]);

    const uploadRes = await myFetch('/file-upload-manager', {
      method: 'POST',
      body: formData,
    });

    if (uploadRes.status === 'error') {
      console.error('Upload Error:', uploadRes.message);
      setUploadStatus(uploadRes.message || 'Failed to upload file');
      return;
    }

    const uploadResp = uploadRes.data || {};
    setUploadStatus('File uploaded successfully');

    // 2) Construir s3Uri
    try {
      const location = uploadResp.location;
      if (!location) {
        setUploadStatus('No location in upload response');
        return;
      }

      const urlObj = new URL(location);
      const bucketName = urlObj.host.split('.')[0];
      const pathName = urlObj.pathname.startsWith('/')
        ? urlObj.pathname.substring(1)
        : urlObj.pathname;
      const s3Uri = `s3://${bucketName}/${pathName}`;

      // 3) Agregar documento a la KB (si existe)
      if (!activeKnowledgeBase) {
        setUploadStatus('No active KB found to index document');
        return;
      }
      setUploadStatus('Indexing document into KB...');
      const match = activeKnowledgeBase.dataSource.match(/\(([^)]+)\)/);
      const dataSourceId = match?.[1];
      if (!dataSourceId) {
        console.error('Could not parse dataSourceId');
        setUploadStatus('Error: Could not parse dataSourceId');
        return;
      }

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
        console.error('Add Document Error:', addDocRes.message);
        setUploadStatus(addDocRes.message || 'Failed to add document');
        return;
      }

      // ok
      setUploadStatus(`Document successfully indexed: ${files[0].name}`);

      // 4) Refrescar la lista
      fetchDocuments(activeKnowledgeBase.name, dataSourceId);
    } catch (err) {
      console.error('Error constructing s3Uri or adding doc:', err);
      setUploadStatus(String(err));
    }
  }

  // 5) Eliminar un documento => (delete-document)
  async function handleRemoveDocument(documentId: string) {
    if (!activeKnowledgeBase) return;
    const match = activeKnowledgeBase.dataSource.match(/\(([^)]+)\)/);
    const dataSourceId = match?.[1];
    if (!dataSourceId) {
      console.error('Could not parse dataSourceId for deleting doc');
      return;
    }

    console.log('Deleting doc =>', documentId);
    if (!confirm(`Are you sure you want to remove document: ${documentId}?`)) {
      return;
    }

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
    // Re-listar
    fetchDocuments(activeKnowledgeBase.name, dataSourceId);
  }

  // ===========================================================================
  // Render principal
  // ===========================================================================
  if (!token || role !== 'admin') return null;

  return (
    <AdminLayout userRole={role} activeMenu="Knowledge Base">
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

              {documents.length > 0 ? (
                <div className="space-y-4">
                  {/* Tabla con tamaño limitado (similar a "settings") */}
                  <div className="max-w-sm overflow-x-auto border rounded bg-white">
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

                  {/* Botón Add Document */}
                  <label className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 cursor-pointer inline-block">
                    Add Document
                    <input
                      type="file"
                      onChange={handleFileUpload}
                      accept=".pdf,.doc,.docx,.html,.xls,.xlsx,.csv"
                      className="hidden"
                    />
                  </label>
                  <p className="text-sm text-gray-600">{uploadStatus}</p>
                </div>
              ) : (
                <>
                  <p>No documents found.</p>

                  <label className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 cursor-pointer inline-block">
                    Add Document
                    <input
                      type="file"
                      onChange={handleFileUpload}
                      accept=".pdf,.doc,.docx,.html,.xls,.xlsx,.csv"
                      className="hidden"
                    />
                  </label>

                  <p className="mt-2 text-sm text-gray-600">{uploadStatus}</p>
                </>
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

