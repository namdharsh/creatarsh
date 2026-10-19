'use strict';
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const ALLOWED_EXTENSIONS = new Set(['.html','.htm','.css','.js','.mjs','.json','.txt','.png','.jpg','.jpeg','.webp','.gif','.ico','.woff','.woff2','.ttf','.otf']);
const MAX_COMPRESSED = 20 * 1024 * 1024;
const MAX_UNPACKED = 60 * 1024 * 1024;
const MAX_FILES = 500;
const MAX_RATIO = 100;
const crcTable = (() => { const t = new Uint32Array(256); for (let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}return t;})();
function crc32(buf){let c=0xffffffff;for(const b of buf)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function fail(message, code='INVALID_ARCHIVE'){const e=new Error(message);e.code=code;throw e;}
function normalizeArchivePath(raw){
  if (!raw || raw.includes('\0') || raw.includes('\\') || raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) fail('Archive contains an absolute or invalid path.');
  const parts=raw.split('/');
  if(parts.some(p=>!p || p==='.' || p==='..' || p.startsWith('.'))) fail('Archive contains traversal, hidden or ambiguous paths.');
  const normalized=parts.join('/');
  if(normalized.length>240) fail('Archive path is too long.');
  return normalized;
}
function inspectStaticZip(buffer, options={}){
  if(!Buffer.isBuffer(buffer)) fail('ZIP upload must be a binary buffer.');
  const maxCompressed=options.maxCompressed||MAX_COMPRESSED, maxUnpacked=options.maxUnpacked||MAX_UNPACKED, maxFiles=options.maxFiles||MAX_FILES;
  if(buffer.length<22 || buffer.length>maxCompressed) fail('ZIP must be non-empty and no larger than 20 MB.', 'UPLOAD_SIZE');
  let eocd=-1; const start=Math.max(0,buffer.length-65557);
  for(let i=buffer.length-22;i>=start;i--){if(buffer.readUInt32LE(i)===0x06054b50){eocd=i;break;}}
  if(eocd<0) fail('ZIP end-of-directory record was not found.');
  if(buffer.readUInt16LE(eocd+4)!==0 || buffer.readUInt16LE(eocd+6)!==0) fail('Multi-disk ZIP archives are not supported.');
  const entries=buffer.readUInt16LE(eocd+10), totalEntries=buffer.readUInt16LE(eocd+8), cdSize=buffer.readUInt32LE(eocd+12), cdOffset=buffer.readUInt32LE(eocd+16), commentLen=buffer.readUInt16LE(eocd+20);
  if(entries!==totalEntries || entries>maxFiles || eocd+22+commentLen!==buffer.length || cdOffset+cdSize>eocd) fail('ZIP directory is malformed or exceeds file-count limits.');
  const files=new Map(); const foldedPaths=new Set(); let p=cdOffset, total=0;
  for(let i=0;i<entries;i++){
    if(p+46>buffer.length || buffer.readUInt32LE(p)!==0x02014b50) fail('ZIP central directory is malformed.');
    const madeBy=buffer.readUInt16LE(p+4), flags=buffer.readUInt16LE(p+8), method=buffer.readUInt16LE(p+10), crc=buffer.readUInt32LE(p+16), compressedSize=buffer.readUInt32LE(p+20), size=buffer.readUInt32LE(p+24), nameLen=buffer.readUInt16LE(p+28), extraLen=buffer.readUInt16LE(p+30), entryComment=buffer.readUInt16LE(p+32), disk=buffer.readUInt16LE(p+34), external=buffer.readUInt32LE(p+38), localOffset=buffer.readUInt32LE(p+42);
    if(p+46+nameLen+extraLen+entryComment>buffer.length) fail('ZIP entry metadata is truncated.');
    const nameBytes=buffer.subarray(p+46,p+46+nameLen); const name=nameBytes.toString((flags&0x800)?'utf8':'utf8');
    p+=46+nameLen+extraLen+entryComment;
    if(disk!==0 || (flags&1) || (flags&0x40)) fail('Encrypted or split ZIP entries are not allowed.');
    if(![0,8].includes(method)) fail('Only stored and deflate ZIP compression are supported.');
    const isDirectory=name.endsWith('/');
    if([0xffffffff,0xffff].includes(size)||[0xffffffff,0xffff].includes(compressedSize)||localOffset===0xffffffff) fail('ZIP64 archives are not supported in the static publisher.');
    const path=normalizeArchivePath(isDirectory?name.slice(0,-1):name);
    if(isDirectory) continue;
    const unixMode=(madeBy>>8)===3 ? (external>>>16)&0xffff : 0;
    if((unixMode&0xf000)===0xa000) fail('Symbolic links are not allowed in uploaded archives.');
    const ext=path.slice(path.lastIndexOf('.')).toLowerCase();
    if(['package.json','package-lock.json','npm-shrinkwrap.json','composer.json','procfile','dockerfile','web.config','.htaccess'].includes(path.toLowerCase().split('/').pop())) fail('Build/runtime manifests and server configuration files are not allowed.');
    if(!ALLOWED_EXTENSIONS.has(ext)) fail(`Unsupported file type in archive: ${ext || '(no extension)'}.`);
    if(files.has(path) || foldedPaths.has(path.toLowerCase())) fail('Archive contains duplicate or case-colliding file paths.'); foldedPaths.add(path.toLowerCase());
    total+=size;
    if(total>maxUnpacked) fail('Unpacked archive exceeds the 60 MB limit.', 'UNPACKED_SIZE');
    if(size>0 && (compressedSize===0 || size/Math.max(1,compressedSize)>MAX_RATIO)) fail('Archive compression ratio exceeds the safety limit.', 'ZIP_BOMB');
    if(localOffset+30>buffer.length || buffer.readUInt32LE(localOffset)!==0x04034b50) fail('ZIP local file header is malformed.');
    const localFlags=buffer.readUInt16LE(localOffset+6), localMethod=buffer.readUInt16LE(localOffset+8), localNameLen=buffer.readUInt16LE(localOffset+26), localExtraLen=buffer.readUInt16LE(localOffset+28), localName=buffer.subarray(localOffset+30,localOffset+30+localNameLen).toString('utf8'), dataStart=localOffset+30+localNameLen+localExtraLen, dataEnd=dataStart+compressedSize;
    if(localName!==name || localMethod!==method || ((localFlags^flags)&1)) fail('ZIP local and central directory entries do not match.');
    if(dataEnd>buffer.length || dataEnd>cdOffset || dataStart<0) fail('ZIP file data is truncated or overlaps the central directory.');
    const compressed=buffer.subarray(dataStart,dataEnd); let content;
    try { content=method===0?Buffer.from(compressed):zlib.inflateRawSync(compressed,{maxOutputLength:maxUnpacked}); } catch { fail('A ZIP entry could not be safely decompressed.'); }
    if(content.length!==size || crc32(content)!==crc) fail('ZIP entry integrity check failed.');
    if(/\.(html?|css|js|mjs|json|txt)$/i.test(path)) scanTextFile(path,content.toString('utf8'));
    files.set(path,content);
  }
  if(p!==cdOffset+cdSize) fail('ZIP central directory length does not match its entries.');
  const index=[...files.keys()].find(p=>p.toLowerCase()==='index.html');
  if(!index) fail('Static website ZIP must include a root index.html.');
  if(index!=='index.html') { const value=files.get(index); files.delete(index); files.set('index.html',value); }
  return {files,totalBytes:total,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),fileCount:files.size};
}
function scanTextFile(path, text){
  if(text.includes('\0')) fail(`Binary content found in text file ${path}.`);
  const checks=[
    [/\beval\s*\(/i,'eval() is not allowed'],[/\bnew\s+Function\s*\(/i,'Function constructor is not allowed'],[/document\s*\.\s*cookie/i,'document.cookie access is not allowed'],[/\bnavigator\s*\.\s*serviceWorker\b/i,'Service workers are not allowed'],[/\bimportScripts\s*\(/i,'Worker scripts are not allowed'],[/(?:<iframe|<object|<embed)\b/i,'Embedded active content is not allowed'],[/javascript\s*:/i,'javascript: URLs are not allowed'],[/<script[^>]+src\s*=\s*["']\s*(?:https?:)?\/\//i,'Remote scripts are not allowed'],[/<base\b/i,'Custom base elements are not allowed']
  ];
  for(const [re,message] of checks) if(re.test(text)) fail(`${message} (${path}).`, 'UNSAFE_CONTENT');
}
function mimeType(file){const ext=file.slice(file.lastIndexOf('.')).toLowerCase();return ({'.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf'})[ext]||'application/octet-stream';}
module.exports={inspectStaticZip,normalizeArchivePath,mimeType,ALLOWED_EXTENSIONS};
