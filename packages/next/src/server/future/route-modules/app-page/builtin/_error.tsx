import React from 'react'
import { RouteKind } from '../../../route-kind'

// import { GlobalError } from '../../../../../client/components/error-boundary'
import AppRouteModule from '../module'

function DefaultLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}

export const routeModule = new AppRouteModule({
  // TODO: add descriptor for internal error page
  definition: {
    kind: RouteKind.APP_PAGE,
    page: '/_error',
    pathname: '/_error',
    filename: '',
    bundlePath: '',
    appPaths: [],
  },
  userland: {
    loaderTree: [
      '',
      {
        children: [
          '__PAGE__',
          {},
          {
            page: [() => () => <p>fallback</p>, ''],
          },
        ],
      },
      {
        layout: [() => DefaultLayout, ''],
      },
    ],
  },
})
