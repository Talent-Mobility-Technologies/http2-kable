import http2 from 'http2';
import decompressor from './decompressor';
import {
  ConnectParams,
  KableHeaders,
  KableRequest,
  KableRequestOptions,
  KableResponse,
  KableStatus,
} from './types';

export * from './types';

export class Kable {
  private http2client;

  private state: KableStatus = KableStatus.connecting;

  private constructor(config: ConnectParams) {
    this.http2client = http2.connect(config.baseUrl, {
      ca: config.ca,
    });
  }

  public static async connect(params: ConnectParams): Promise<Kable> {
    return new Promise((resolve, reject) => {
      const kable = new Kable(params);
      kable.http2client.on('error', (error) => {
        kable.state = KableStatus.error;
        reject(error);
      });
      kable.http2client.on('connect', () => {
        kable.state = KableStatus.connected;
        resolve(kable);
      });
    });
  }

  public async request(reqParams: KableRequestOptions): Promise<KableResponse> {
    return new Promise((resolve, reject) => {
      const http2request = this.http2client.request({
        [http2.constants.HTTP2_HEADER_PATH]: reqParams.path,
        [http2.constants.HTTP2_HEADER_METHOD]: reqParams.method,
        ...reqParams.headers,
      });

      const request: KableRequest = {
        ...reqParams,
        http2request,
      };

      const response: KableResponse = {
        status: 0,
        headers: {},
        request,
      };

      if (reqParams.data !== undefined) {
        this.sendData(request);
      }

      http2request.on('response', (headers) => {
        response.status = parseFloat(headers[http2.constants.HTTP2_HEADER_STATUS] as string);
        for (const hname of Object.keys(headers)) {
          if (!hname.startsWith(':')) {
            if (headers[hname] != null) {
              response.headers[hname.toLowerCase()] = headers[hname]!;
            }
          }
        }
        this.readData(request, response).then(resolve).catch(reject);
      });

      http2request.end();
    });
  }

  public async get(path: string, headers?: KableHeaders): Promise<KableResponse> {
    return this.request({
      headers,
      method: 'GET',
      path,
    });
  }

  public async post(path: string, data: Buffer, headers?: KableHeaders): Promise<KableResponse> {
    return this.request({
      data,
      headers,
      method: 'POST',
      path,
    });
  }

  public async put(path: string, data: Buffer, headers?: KableHeaders): Promise<KableResponse> {
    return this.request({
      data,
      headers,
      method: 'PUT',
      path,
    });
  }

  public async patch(path: string, data: Buffer, headers?: KableHeaders): Promise<KableResponse> {
    return this.request({
      data,
      headers,
      method: 'PATCH',
      path,
    });
  }

  public status(): KableStatus {
    return this.state;
  }

  public async close(): Promise<void> {
    return new Promise((resolve) => {
      this.http2client.close(() => {
        resolve();
      });
    });
  }

  private async sendData(request: KableRequest): Promise<void> {
    return new Promise((resolve, reject) => {
      request.http2request.on('error', (error) => {
        this.state = KableStatus.error;
        reject(error);
      });

      request.http2request.on('end', () => {
        resolve();
      })

      request.http2request.write(request.data, request.encoding);
    });
  }

  private async readData(request: KableRequest, response: KableResponse): Promise<KableResponse> {
    return new Promise((resolve, reject) => {
      if (response.headers['content-encoding'] != null) {
        decompressor(request, response).then(resolve).catch(reject);
      } else {
        const buffers: Buffer[] = [];

        request.http2request.on('data', (chunk: Buffer) => {
          buffers.push(chunk);
        });

        request.http2request.on('end', () => {
          response.data = Buffer.concat(buffers);
          resolve(response);
        });

        request.http2request.on('error', (error) => {
          this.state = KableStatus.error;
          reject(error);
        });
      }
    });
  }
};
