import http2 from 'http2';

export interface ConnectParams {
  baseUrl: string;
  ca?: string | Buffer;
}

export enum KableStatus {
  closed,
  connected,
  connecting,
  error,
}

export type KableHeaders = Record<string, string | string[]>;

export interface KableRequestOptions {
  data?: Buffer;
  encoding?: BufferEncoding;
  headers?: KableHeaders;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  path: string;
}

export interface KableRequest extends KableRequestOptions {
  http2request: http2.ClientHttp2Stream;
}

export interface KableResponse {
  data?: Buffer;
  headers: KableHeaders;
  request: KableRequest;
  status: number;
}
