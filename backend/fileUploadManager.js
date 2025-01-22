// fileUploadManager.js

const express = require('express');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const path = require('path');

const router = express.Router();

function normalizeBucketName(rawBucket) {
  if (!rawBucket) return '';
  let bucket = rawBucket.trim();

  if (bucket.toLowerCase().startsWith('s3://')) {
    bucket = bucket.substring(5);
  }

  if (bucket.endsWith('/')) {
    bucket = bucket.slice(0, -1);
  }

  return bucket;
}

function createMulterUpload(s3Config) {
  const normalizedBucket = normalizeBucketName(s3Config.awsS3Bucket);
  console.log('Using bucket:', normalizedBucket);

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
        cb(null, file.originalname); // Use the original file name
      }
    }),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max per file
    fileFilter: function (req, file, cb) {
      const allowedTypes = /pdf|doc|docx|html|xls|xlsx|csv|txt/i;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype.toLowerCase());

      console.log(
        `fileFilter => extname=${extname}, mimetype=${mimetype}, file.mimetype="${file.mimetype}"`
      );

      if (extname && mimetype) {
        cb(null, true);
      } else {
        const errMsg = `Only PDF, DOC, DOCX, HTML, XLS, XLSX, CSV, and TXT files are allowed! (Got ext="${path.extname(
          file.originalname
        )}", mimetype="${file.mimetype}")`;
        console.error(errMsg);
        cb(new Error(errMsg));
      }
    }
  });
}

router.post('/', (req, res) => {
  console.log('POST /file-upload-manager');

  try {
    const { awsAccessKeyId, awsSecretAccessKey, awsS3Bucket } = req.user || {};

    console.log('Using AWS S3 Bucket:', awsS3Bucket || '(not configured)');

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

    const uploadMiddleware = createMulterUpload(s3Config);

    uploadMiddleware.array('file', 20)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        console.error('MulterError:', err);
        return res.status(400).json({ error: err.message });
      } else if (err) {
        console.error('Unknown upload error:', err);
        return res.status(500).json({ error: err.message });
      }

      // If we're here, upload was successful
      console.log('Upload successful! Files info:', req.files);
      return res.json({
        message: 'Files uploaded successfully',
        files: req.files.map(file => ({
          filename: file.key,
          location: file.location
        }))
      });
    });
  } catch (error) {
    console.error('Error uploading files:', error);
    return res.status(500).json({
      error: 'Server error during file upload',
      details: error.toString()
    });
  }
});

module.exports = router;
