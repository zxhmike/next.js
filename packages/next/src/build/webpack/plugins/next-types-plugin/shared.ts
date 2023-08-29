import type { Rewrite, Redirect } from '../../../../lib/load-custom-routes'

import path from 'path'
import { denormalizePagePath } from '../../../../shared/lib/page-path/denormalize-page-path'
import { ensureLeadingSlash } from '../../../../shared/lib/page-path/ensure-leading-slash'
import { normalizeAppPath } from '../../../../shared/lib/router/utils/app-paths'
import { getPageFromPath } from '../../../entries'
import { isDynamicRoute } from '../../../../shared/lib/router/utils'
import type { Token } from 'next/dist/compiled/path-to-regexp'
import { parse } from 'next/dist/compiled/path-to-regexp'

// TODO: Eliminate this singleton in the future.
export const devPageFiles = new Set<string>()

// Whether redirects and rewrites have been converted into routeTypes or not.
let redirectsRewritesTypesProcessed = false

export interface CollectPageOption {
  appDir: string
  pagesDir: string
  typedRoutes: boolean
  isEdgeServer: boolean
  pageExtensions: string[]
}

export type Rewrites = {
  fallback: Rewrite[]
  afterFiles: Rewrite[]
  beforeFiles: Rewrite[]
}

// By exposing the static route types separately as string literals,
// editors can provide autocompletion for them. However it's currently not
// possible to provide the same experience for dynamic routes.
export const routeTypes: Record<
  'edge' | 'node' | 'extra',
  Record<'static' | 'dynamic', string>
> = {
  edge: {
    static: '',
    dynamic: '',
  },
  node: {
    static: '',
    dynamic: '',
  },
  extra: {
    static: '',
    dynamic: '',
  },
}

export function createRouteDefinitions() {
  let staticRouteTypes = ''
  let dynamicRouteTypes = ''

  for (const type of ['edge', 'node', 'extra'] as const) {
    staticRouteTypes += routeTypes[type].static
    dynamicRouteTypes += routeTypes[type].dynamic
  }

  // If both StaticRoutes and DynamicRoutes are empty, fallback to type 'string'.
  const routeTypesFallback =
    !staticRouteTypes && !dynamicRouteTypes ? 'string' : ''

  return `// Type definitions for Next.js routes

/**
 * Internal types used by the Next.js router and Link component.
 * These types are not meant to be used directly.
 * @internal
 */
declare namespace __next_route_internal_types__ {
  type SearchOrHash = \`?\${string}\` | \`#\${string}\`
  type WithProtocol = \`\${string}:\${string}\`

  type Suffix = '' | SearchOrHash

  type SafeSlug<S extends string> = S extends \`\${string}/\${string}\`
    ? never
    : S extends \`\${string}\${SearchOrHash}\`
    ? never
    : S extends ''
    ? never
    : S

  type CatchAllSlug<S extends string> = S extends \`\${string}\${SearchOrHash}\`
    ? never
    : S extends ''
    ? never
    : S

  type OptionalCatchAllSlug<S extends string> =
    S extends \`\${string}\${SearchOrHash}\` ? never : S

  type StaticRoutes = ${staticRouteTypes || 'never'}
  type DynamicRoutes<T extends string = string> = ${
    dynamicRouteTypes || 'never'
  }

  type RouteImpl<T> = ${
    routeTypesFallback ||
    `
    ${
      // This keeps autocompletion working for static routes.
      '| StaticRoutes'
    }
    | SearchOrHash
    | WithProtocol
    | \`\${StaticRoutes}\${SearchOrHash}\`
    | (T extends \`\${DynamicRoutes<infer _>}\${Suffix}\` ? T : never)
    `
  }
}

declare module 'next' {
  export { default } from 'next/types/index.js'
  export * from 'next/types/index.js'

  export type Route<T extends string = string> =
    __next_route_internal_types__.RouteImpl<T>
}

declare module 'next/link' {
  import type { LinkProps as OriginalLinkProps } from 'next/dist/client/link.js'
  import type { AnchorHTMLAttributes, DetailedHTMLProps } from 'react'
  import type { UrlObject } from 'url'

  type LinkRestProps = Omit<
    Omit<
      DetailedHTMLProps<
        AnchorHTMLAttributes<HTMLAnchorElement>,
        HTMLAnchorElement
      >,
      keyof OriginalLinkProps
    > &
      OriginalLinkProps,
    'href'
  >

  export type LinkProps<RouteInferType> = LinkRestProps & {
    /**
     * The path or URL to navigate to. This is the only required prop. It can also be an object.
     * @see https://nextjs.org/docs/api-reference/next/link
     */
    href: __next_route_internal_types__.RouteImpl<RouteInferType> | UrlObject
  }

  export default function Link<RouteType>(props: LinkProps<RouteType>): JSX.Element
}

declare module 'next/navigation' {
  export * from 'next/dist/client/components/navigation.js'

  import type { NavigateOptions, AppRouterInstance as OriginalAppRouterInstance } from 'next/dist/shared/lib/app-router-context.js'
  interface AppRouterInstance extends OriginalAppRouterInstance {
    /**
     * Navigate to the provided href.
     * Pushes a new history entry.
     */
    push<RouteType>(href: __next_route_internal_types__.RouteImpl<RouteType>, options?: NavigateOptions): void
    /**
     * Navigate to the provided href.
     * Replaces the current history entry.
     */
    replace<RouteType>(href: __next_route_internal_types__.RouteImpl<RouteType>, options?: NavigateOptions): void
    /**
     * Prefetch the provided href.
     */
    prefetch<RouteType>(href: __next_route_internal_types__.RouteImpl<RouteType>): void
  }

  export declare function useRouter(): AppRouterInstance;
}
`
}

function formatRouteToRouteType(route: string) {
  const isDynamic = isDynamicRoute(route)
  if (isDynamic) {
    route = route
      .split('/')
      .map((part) => {
        if (part.startsWith('[') && part.endsWith(']')) {
          if (part.startsWith('[...')) {
            // /[...slug]
            return `\${CatchAllSlug<T>}`
          } else if (part.startsWith('[[...') && part.endsWith(']]')) {
            // /[[...slug]]
            return `\${OptionalCatchAllSlug<T>}`
          }
          // /[slug]
          return `\${SafeSlug<T>}`
        }
        return part
      })
      .join('/')
  }

  return {
    isDynamic,
    routeType: `\n    | \`${route}\``,
  }
}

// Convert redirects and rewrites into routeTypes.
export function addRedirectsRewritesRouteTypes(
  rewrites: Rewrites | undefined,
  redirects: Redirect[] | undefined
) {
  if (redirectsRewritesTypesProcessed) {
    return
  }
  redirectsRewritesTypesProcessed = true

  function addExtraRoute(source: string) {
    let tokens: Token[] | undefined
    try {
      tokens = parse(source)
    } catch {
      // Ignore invalid routes - they will be handled by other checks.
    }

    if (Array.isArray(tokens)) {
      const possibleNormalizedRoutes = ['']
      let slugCnt = 1

      function append(suffix: string) {
        for (let i = 0; i < possibleNormalizedRoutes.length; i++) {
          possibleNormalizedRoutes[i] += suffix
        }
      }

      function fork(suffix: string) {
        const currentLength = possibleNormalizedRoutes.length
        for (let i = 0; i < currentLength; i++) {
          possibleNormalizedRoutes.push(possibleNormalizedRoutes[i] + suffix)
        }
      }

      for (const token of tokens) {
        if (typeof token === 'object') {
          // Make sure the slug is always named.
          const slug =
            token.name || (slugCnt++ === 1 ? 'slug' : `slug${slugCnt}`)

          if (token.modifier === '*') {
            append(`${token.prefix}[[...${slug}]]`)
          } else if (token.modifier === '+') {
            append(`${token.prefix}[...${slug}]`)
          } else if (token.modifier === '') {
            if (token.pattern === '[^\\/#\\?]+?') {
              // A safe slug
              append(`${token.prefix}[${slug}]`)
            } else if (token.pattern === '.*') {
              // An optional catch-all slug
              append(`${token.prefix}[[...${slug}]]`)
            } else if (token.pattern === '.+') {
              // A catch-all slug
              append(`${token.prefix}[...${slug}]`)
            } else {
              // Other regex patterns are not supported. Skip this route.
              return
            }
          } else if (token.modifier === '?') {
            if (/^[a-zA-Z0-9_/]*$/.test(token.pattern)) {
              // An optional slug with plain text only, fork the route.
              append(token.prefix)
              fork(token.pattern)
            } else {
              // Optional modifier `?` and regex patterns are not supported.
              return
            }
          }
        } else if (typeof token === 'string') {
          append(token)
        }
      }

      for (const normalizedRoute of possibleNormalizedRoutes) {
        const { isDynamic, routeType } = formatRouteToRouteType(normalizedRoute)
        routeTypes.extra[isDynamic ? 'dynamic' : 'static'] += routeType
      }
    }
  }

  if (rewrites) {
    for (const rewrite of rewrites.beforeFiles) {
      addExtraRoute(rewrite.source)
    }
    for (const rewrite of rewrites.afterFiles) {
      addExtraRoute(rewrite.source)
    }
    for (const rewrite of rewrites.fallback) {
      addExtraRoute(rewrite.source)
    }
  }

  if (redirects) {
    for (const redirect of redirects) {
      // Skip internal redirects
      // https://github.com/vercel/next.js/blob/8ff3d7ff57836c24088474175d595b4d50b3f857/packages/next/src/lib/load-custom-routes.ts#L704-L710
      if (!('internal' in redirect)) {
        addExtraRoute(redirect.source)
      }
    }
  }
}

export function collectPage(filePath: string, options: CollectPageOption) {
  const { appDir, pagesDir, typedRoutes, isEdgeServer, pageExtensions } =
    options
  if (!typedRoutes) return

  const isApp = filePath.startsWith(appDir + path.sep)
  const isPages = !isApp && filePath.startsWith(pagesDir + path.sep)

  if (!isApp && !isPages) {
    return
  }

  // Filter out non-page and non-route files in app dir
  if (isApp && !/[/\\](?:page|route)\.[^.]+$/.test(filePath)) {
    return
  }

  // Filter out non-page files in pages dir
  if (
    isPages &&
    /[/\\](?:_app|_document|_error|404|500)\.[^.]+$/.test(filePath)
  ) {
    return
  }

  let route = (isApp ? normalizeAppPath : denormalizePagePath)(
    ensureLeadingSlash(
      getPageFromPath(
        path.relative(isApp ? appDir : pagesDir, filePath),
        pageExtensions
      )
    )
  )

  const { isDynamic, routeType } = formatRouteToRouteType(route)

  routeTypes[isEdgeServer ? 'edge' : 'node'][
    isDynamic ? 'dynamic' : 'static'
  ] += routeType
}
