const fs = require('fs');
const path = require('path');

const uploadsRoot = path.join(__dirname, '../../uploads');
const companyDocsDir = path.join(uploadsRoot, 'company-docs');

fs.mkdirSync(companyDocsDir, { recursive: true });

// المستندات المسموحة: صور (سجل تجاري مصوّر) أو PDF
const allowedDocMimeTypes = [
  'image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf'
];

const buildCompanyDocUrl = (req, filename) => {
  if (!filename) return null;
  return `uploads/company-docs/${filename}`;
};

const isLocalCompanyDoc = (docUrl) => {
  return typeof docUrl === 'string' && docUrl.includes('/uploads/company-docs/');
};

const extractCompanyDocFilename = (docUrl) => {
  if (!isLocalCompanyDoc(docUrl)) return null;
  return docUrl.split('/uploads/company-docs/').pop();
};

const deleteCompanyDocFile = async (docUrl) => {
  const filename = extractCompanyDocFilename(docUrl);
  if (!filename) return;

  const filePath = path.join(companyDocsDir, filename);
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};

module.exports = {
  uploadsRoot,
  companyDocsDir,
  allowedDocMimeTypes,
  buildCompanyDocUrl,
  deleteCompanyDocFile,
};
