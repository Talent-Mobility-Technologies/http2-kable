import http2 from 'http2';
import decompressor from './decompressor';
import {
  ConnectParams,
  KableHeaders,
  KableRequest,
  KableRequestOptions,
  KableResponse,
  KableStatus,
  PingResponseListener,
} from './types';

export * from './types';

export class Kable {
  private connectParams: ConnectParams;

  private http2client?: http2.ClientHttp2Session;

  private state: KableStatus = KableStatus.connecting;

  private pingTimeoutId: NodeJS.Timeout | null = null;

  private pingResponseListener?: PingResponseListener;

  private constructor(config: ConnectParams) {
    this.connectParams = config;
  }

  public static async connect(params: ConnectParams): Promise<Kable> {
    return new Promise((resolve, reject) => {
      const kable = new Kable(params);
      kable.makeConnection(params).then(() => resolve(kable)).catch((error) => reject(error));
    });
  }

  private async makeConnection(params: ConnectParams): Promise<void> {
    return new Promise((resolve, reject) => {
      this.http2client = http2.connect(this.connectParams.baseUrl, {
        ca: this.connectParams.ca,
      });

      this.http2client.on('error', (error) => {
        this.state = KableStatus.error;
        reject(error);
      });

      this.http2client.on('connect', () => {
        this.state = KableStatus.connected;
        resolve();
      });

      this.http2client.on('goaway', () => {
        this.state = KableStatus.closed;
      });

      this.startNewPing();
    });
  }

  public async request(reqParams: KableRequestOptions): Promise<KableResponse> {
    return new Promise((resolve, reject) => {
      if (this.http2client === undefined) {
        throw new Error('No http2client created - must connect before sending request');
      }

      if (this.state === KableStatus.closed || this.state === KableStatus.error
        || this.http2client.closed || this.http2client.destroyed) {
        if (reqParams.resubmitted) {
          reject(new Error('Failed to reconnect'));
        } else {
          this.makeConnection(this.connectParams).then(() => {
            this.request({
              ...reqParams,
              resubmitted: true,
            }).then((response) => resolve(response)).catch((error) => reject(error));
          }).catch((error) => reject(error));
        }
        return;
      }

      this.startNewPing();

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
      if (this.http2client) {
        this.http2client.close(() => {
          resolve();
        });
      }
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

  private startNewPing(): void {
    if (this.connectParams.pingTimeout) {
      if (this.pingTimeoutId) {
        clearTimeout(this.pingTimeoutId);
      }
      this.pingTimeoutId = setTimeout(this.ping.bind(this), this.connectParams.pingTimeout);
    }
  }

  private async ping(): Promise<void> {
    if (this.http2client === undefined) {
      throw new Error('No http2client created - must connect before pinging');
    }
    this.http2client.ping((error, duration) => {
      if (error) {
        this.state = KableStatus.error;
        return;
      }
      if (this.pingResponseListener) {
        this.pingResponseListener(duration);
      }
    });
  }
};
