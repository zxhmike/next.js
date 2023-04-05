
/*// IPC need to be the first import to allow it to catch errors happening during
// the other imports
import startHandler from '@vercel/turbopack-next/internal/page-server-handler'

import App from '@vercel/turbopack-next/pages/_app'
import Document from '@vercel/turbopack-next/pages/_document'

import chunkGroup from 'INNER_CLIENT_CHUNK_GROUP'

startHandler({
  isDataReq: false,
  App,
  Document,
  mod: () => {
    return import('INNER').then((namespace) => ({
      Component: namespace.default as any,
      namespace,
    }))
  },
  chunkGroup,
})*/


// IPC need to be the first import to allow it to catch errors happening during
// the other imports
import startHandler from '@vercel/turbopack-next/internal/page-server-handler'

try {
  //import App from '@vercel/turbopack-next/pages/_app'
  //import Document from '@vercel/turbopack-next/pages/_document'

  //import chunkGroup from 'INNER_CLIENT_CHUNK_GROUP'
  const App = require('@vercel/turbopack-next/pages/_app').default
  const Document = require('@vercel/turbopack-next/pages/_document').default
  const chunkGroup = require('INNER_CLIENT_CHUNK_GROUP').default

  startHandler({
    isDataReq: false,
    App,
    Document,
    mod: () => {
      return import('INNER').then((namespace) => ({
        Component: namespace.default as any,
        namespace,
      }))
    },
    chunkGroup,
  })
} catch (e) {
  console.log(e)
}