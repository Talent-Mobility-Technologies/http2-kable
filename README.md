# Kable

This is a simple HTTP/2 client that uses promises. It wraps the low-level
Node.js HTTP/2 client and thus only works with Node. It is not intended to be
a full featured HTTP client like Axios but, until Axios supports HTTP/2 on
Node, this makes using HTTP/2 in Node apps a little easier.

This is intended to work with Node 14 and up.

## Usage

Import the `Kable` class into your Javascript or Typescript project where
needed:

```javascript
const { Kable } = require('http2-kable');
```

or

```typescript
import { Kable } from 'http2-kable');
```

Because this client is intended for long-lasting connections you then connect
and hold on to the connection, reusing it for any requests to the same base
URL, before closing it.

```javascript
const kable = await Kable.connect({ baseUrl: 'https://some.host' });

const responseFromGet = await kable.get('/path/to/resource');

const buffer = // fill buffer with data to post (e.g. encoded from Protobuf)
const responseFromPost = await kable.post('/another/resource', buffer, {
  'content-length': buffer.byteLength,
});

// once finished with the connection:
await kable.close();
```
