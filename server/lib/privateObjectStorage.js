'use strict';
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
let client;
function storageConfig(){const bucket=process.env.OBJECT_STORAGE_BUCKET;const region=process.env.OBJECT_STORAGE_REGION||'auto';const endpoint=process.env.OBJECT_STORAGE_ENDPOINT;const accessKeyId=process.env.OBJECT_STORAGE_ACCESS_KEY_ID;const secretAccessKey=process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY;if(!bucket||!accessKeyId||!secretAccessKey)return null;return {bucket,region,endpoint,accessKeyId,secretAccessKey};}
function getClient(){const c=storageConfig();if(!c)throw Object.assign(new Error('Private object storage is not configured.'),{status:503,code:'STORAGE_NOT_CONFIGURED'});if(!client)client=new S3Client({region:c.region,endpoint:c.endpoint||undefined,forcePathStyle:!!c.endpoint,credentials:{accessKeyId:c.accessKeyId,secretAccessKey:c.secretAccessKey}});return {client,bucket:c.bucket};}
async function putPrivate(key,body,contentType){const {client,bucket}=getClient();await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:body,ContentType:contentType,...(c.endpoint?{}:{ServerSideEncryption:'AES256'}),CacheControl:'private, no-store'}));return {key};}
async function getPrivate(key){const {client,bucket}=getClient();const result=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));const body=Buffer.from(await result.Body.transformToByteArray());return {body,contentType:result.ContentType};}
async function deletePrivate(key){const {client,bucket}=getClient();await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));}
module.exports={putPrivate,getPrivate,deletePrivate,storageConfig};
