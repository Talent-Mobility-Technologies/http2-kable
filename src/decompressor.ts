import stream from 'stream';
import zlib from 'zlib';
import { KableRequest, KableResponse } from './types';

async function decode(transformer: stream.Transform, request: KableRequest, response: KableResponse): Promise<KableResponse> {
  return new Promise((resolve, reject) => {
    const stream = request.http2request.pipe(transformer);
    const buffers: Buffer[] = [];

    stream.on('data', (chunk: Buffer) => {
      buffers.push(chunk);
    });

    stream.on('end', () => {
      response.data = Buffer.concat(buffers);
      resolve(response);
    });

    stream.on('error', (error) => {
      reject(error);
    });
  });
}

export default async function decompressor(request: KableRequest, response: KableResponse): Promise<KableResponse> {
  if (response.headers['content-encoding'] == null) {
    return response;
  }
  const compressionType = response.headers['content-encoding'];
  return new Promise((resolve, reject) => {
    switch(compressionType) {
      case 'br':
        decode(zlib.createBrotliDecompress(), request, response).then(resolve).catch(reject);
        break;

      case 'gzip':
        decode(zlib.createGunzip(), request, response).then(resolve).catch(reject);
        break;

      case 'deflate':
        decode(zlib.createInflate(), request, response).then(resolve).catch(reject);
        break;

      default:
        reject(new Error(`Unsupported compression algorithm: ${compressionType}`));
    }
  });
}
