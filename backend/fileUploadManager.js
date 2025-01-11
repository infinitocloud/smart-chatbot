// fileUploadManager.js
const express = require('express');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const path = require('path');

const router = express.Router();

/**
 * Quita el prefijo "s3://" y cualquier "/" final para normalizar el bucket.
 * Ejemplos:
 *   "s3://test-smart-chatbot/" => "test-smart-chatbot"
 *   "s3://my-bucket"          => "my-bucket"
 *   "my-bucket"               => "my-bucket"
 */
function normalizeBucketName(rawBucket) {
  if (!rawBucket) return '';
  let bucket = rawBucket.trim();

  // Quitar prefijo s3:// si existe
  if (bucket.toLowerCase().startsWith('s3://')) {
    bucket = bucket.substring(5);
  }

  // Quitar último slash si existe
  if (bucket.endsWith('/')) {
    bucket = bucket.slice(0, -1);
  }

  return bucket;
}

// Función para configurar multer + S3
function createMulterUpload(s3Config) {
  const normalizedBucket = normalizeBucketName(s3Config.awsS3Bucket);
  console.log('Using bucket:', normalizedBucket); // No imprimimos credenciales

  const s3Client = new S3Client({
    region: 'us-east-1',
    credentials: {
      accessKeyId: s3Config.awsAccessKeyId,
      secretAccessKey: s3Config.awsSecretAccessKey
    }
  });

  return multer({
    storage: multerS3({
      s3: s3Client,
      bucket: normalizedBucket,
      key: function (req, file, cb) {
        console.log(`Uploading file with original name: "${file.originalname}"`);
        cb(null, file.originalname);
      }
    }),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB máx
    fileFilter: function (req, file, cb) {
      const allowedTypes = /pdf|doc|docx|html|xls|xlsx|csv/i;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype.toLowerCase());

      console.log(
        `fileFilter => extname=${extname}, mimetype=${mimetype}, file.mimetype="${file.mimetype}"`
      );

      if (extname && mimetype) {
        cb(null, true);
      } else {
        const errMsg = `Only PDF, DOC, DOCX, HTML, XLS, XLSX, and CSV files are allowed! (Got ext="${path.extname(
          file.originalname
        )}", mimetype="${file.mimetype}")`;
        console.error(errMsg);
        cb(new Error(errMsg));
      }
    }
  });
}

// POST /
router.post('/', (req, res) => {
  console.log('POST /file-upload-manager');

  try {
    // Tomamos credenciales desde req.user (asignadas por loadBedrockSettings)
    const { awsAccessKeyId, awsSecretAccessKey, awsS3Bucket } = req.user || {};

    // Log mínimo: solo el bucket
    console.log('Using AWS S3 Bucket:', awsS3Bucket || '(not configured)');

    // Validamos config
    if (!awsAccessKeyId || !awsSecretAccessKey) {
      console.warn('AWS credentials missing in settings.');
      return res.status(400).json({ error: 'AWS credentials are missing in settings.' });
    }

    if (!awsS3Bucket) {
      console.warn('S3 bucket not configured in settings.');
      return res.status(400).json({ error: 'No S3 bucket configured in settings.' });
    }

    const s3Config = {
      awsAccessKeyId,
      awsSecretAccessKey,
      awsS3Bucket
    };

    // Creamos el middleware de Multer
    const uploadMiddleware = createMulterUpload(s3Config);

    // Procesamos el archivo con "single('file')"
    uploadMiddleware.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        // Error de multer (ej. límite de tamaño)
        console.error('MulterError:', err);
        return res.status(400).json({ error: err.message });
      } else if (err) {
        // Error desconocido
        console.error('Unknown upload error:', err);
        return res.status(500).json({ error: err.message });
      }

      // Si llega aquí => fue exitoso
      console.log('Upload successful! File info:', req.file);
      return res.json({
        message: 'File uploaded successfully',
        filename: req.file.key,
        location: req.file.location
      });
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return res.status(500).json({
      error: 'Server error during file upload',
      details: error.toString()
    });
  }
});

module.exports = router;

