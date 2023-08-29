import type { Redirect } from '../../../../lib/load-custom-routes'
import type { Rewrites } from './shared'

import fs from 'fs/promises'
import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import path from 'path'

import { WEBPACK_LAYERS } from '../../../../lib/constants'
import { normalizePathSep } from '../../../../shared/lib/page-path/normalize-path-sep'
import { HTTP_METHODS } from '../../../../server/web/http'
import {
  addRedirectsRewritesRouteTypes,
  collectPage,
  createRouteDefinitions,
  devPageFiles,
} from './shared'

import { routeTypes } from './shared'

const PLUGIN_NAME = 'NextTypesPlugin'

interface Options {
  dir: string
  distDir: string
  appDir: string
  dev: boolean
  isEdgeServer: boolean
  pageExtensions: string[]
  typedRoutes: boolean
  originalRewrites: Rewrites | undefined
  originalRedirects: Redirect[] | undefined
}

function createTypeGuardFile(
  fullPath: string,
  relativePath: string,
  options: {
    type: 'layout' | 'page' | 'route'
    slots?: string[]
  }
) {
  return `// File: ${fullPath}
import * as entry from '${relativePath}.js'
${
  options.type === 'route'
    ? `import type { NextRequest } from 'next/server.js'`
    : `import type { ResolvingMetadata } from 'next/dist/lib/metadata/types/metadata-interface.js'`
}

type TEntry = typeof import('${relativePath}.js')

// Check that the entry is a valid entry
checkFields<Diff<{
  ${
    options.type === 'route'
      ? HTTP_METHODS.map((method) => `${method}?: Function`).join('\n  ')
      : 'default: Function'
  }
  config?: {}
  generateStaticParams?: Function
  revalidate?: RevalidateRange<TEntry> | false
  dynamic?: 'auto' | 'force-dynamic' | 'error' | 'force-static'
  dynamicParams?: boolean
  fetchCache?: 'auto' | 'force-no-store' | 'only-no-store' | 'default-no-store' | 'default-cache' | 'only-cache' | 'force-cache'
  preferredRegion?: 'auto' | 'global' | 'home' | string | string[]
  runtime?: 'nodejs' | 'experimental-edge' | 'edge'
  maxDuration?: number
  ${
    options.type === 'route'
      ? ''
      : `
  metadata?: any
  generateMetadata?: Function
  `
  }
}, TEntry, ''>>()

${
  options.type === 'route'
    ? HTTP_METHODS.map(
        (method) => `// Check the prop type of the entry function
if ('${method}' in entry) {
  checkFields<
    Diff<
      ParamCheck<Request | NextRequest>,
      {
        __tag__: '${method}'
        __param_position__: 'first'
        __param_type__: FirstArg<MaybeField<TEntry, '${method}'>>
      },
      '${method}'
    >
  >()
  checkFields<
    Diff<
      ParamCheck<PageParams>,
      {
        __tag__: '${method}'
        __param_position__: 'second'
        __param_type__: SecondArg<MaybeField<TEntry, '${method}'>>
      },
      '${method}'
    >
  >()
}
`
      ).join('')
    : `// Check the prop type of the entry function
checkFields<Diff<${
        options.type === 'page' ? 'PageProps' : 'LayoutProps'
      }, FirstArg<TEntry['default']>, 'default'>>()

// Check the arguments and return type of the generateMetadata function
if ('generateMetadata' in entry) {
  checkFields<Diff<${
    options.type === 'page' ? 'PageProps' : 'LayoutProps'
  }, FirstArg<MaybeField<TEntry, 'generateMetadata'>>, 'generateMetadata'>>()
  checkFields<Diff<ResolvingMetadata, SecondArg<MaybeField<TEntry, 'generateMetadata'>>, 'generateMetadata'>>()
}
`
}
// Check the arguments and return type of the generateStaticParams function
if ('generateStaticParams' in entry) {
  checkFields<Diff<{ params: PageParams }, FirstArg<MaybeField<TEntry, 'generateStaticParams'>>, 'generateStaticParams'>>()
  checkFields<Diff<{ __tag__: 'generateStaticParams', __return_type__: any[] | Promise<any[]> }, { __tag__: 'generateStaticParams', __return_type__: ReturnType<MaybeField<TEntry, 'generateStaticParams'>> }>>()
}

type PageParams = any
export interface PageProps {
  params?: any
  searchParams?: any
}
export interface LayoutProps {
  children?: React.ReactNode
${
  options.slots
    ? options.slots.map((slot) => `  ${slot}: React.ReactNode`).join('\n')
    : ''
}
  params?: any
}

// =============
// Utility types
type RevalidateRange<T> = T extends { revalidate: any } ? NonNegative<T['revalidate']> : never

// If T is unknown or any, it will be an empty {} type. Otherwise, it will be the same as Omit<T, keyof Base>.
type OmitWithTag<T, K extends keyof any, _M> = Omit<T, K>
type Diff<Base, T extends Base, Message extends string = ''> = 0 extends (1 & T) ? {} : OmitWithTag<T, keyof Base, Message>

type FirstArg<T extends Function> = T extends (...args: [infer T, any]) => any ? unknown extends T ? any : T : never
type SecondArg<T extends Function> = T extends (...args: [any, infer T]) => any ? unknown extends T ? any : T : never
type MaybeField<T, K extends string> = T extends { [k in K]: infer G } ? G extends Function ? G : never : never

${
  options.type === 'route'
    ? `type ParamCheck<T> = {
  __tag__: string
  __param_position__: string
  __param_type__: T
}`
    : ''
}

function checkFields<_ extends { [k in keyof any]: never }>() {}

// https://github.com/sindresorhus/type-fest
type Numeric = number | bigint
type Zero = 0 | 0n
type Negative<T extends Numeric> = T extends Zero ? never : \`\${T}\` extends \`-\${string}\` ? T : never
type NonNegative<T extends Numeric> = T extends Zero ? T : Negative<T> extends never ? T : '__invalid_negative_number__'
`
}

async function collectNamedSlots(layoutPath: string) {
  const layoutDir = path.dirname(layoutPath)
  const items = await fs.readdir(layoutDir, { withFileTypes: true })
  const slots = []
  for (const item of items) {
    if (item.isDirectory() && item.name.startsWith('@')) {
      slots.push(item.name.slice(1))
    }
  }
  return slots
}

const appTypesBasePath = path.join('types', 'app')

export class NextTypesPlugin {
  dir: string
  distDir: string
  appDir: string
  dev: boolean
  isEdgeServer: boolean
  pageExtensions: string[]
  pagesDir: string
  typedRoutes: boolean
  distDirAbsolutePath: string

  constructor(options: Options) {
    this.dir = options.dir
    this.distDir = options.distDir
    this.appDir = options.appDir
    this.dev = options.dev
    this.isEdgeServer = options.isEdgeServer
    this.pageExtensions = options.pageExtensions
    this.pagesDir = path.join(this.appDir, '..', 'pages')
    this.typedRoutes = options.typedRoutes
    this.distDirAbsolutePath = path.join(this.dir, this.distDir)
    if (this.typedRoutes) {
      addRedirectsRewritesRouteTypes(
        options.originalRewrites,
        options.originalRedirects
      )
    }
  }

  getRelativePathFromAppTypesDir(moduleRelativePathToAppDir: string) {
    const moduleAbsolutePath = path.join(
      this.appDir,
      moduleRelativePathToAppDir
    )

    const moduleInAppTypesAbsolutePath = path.join(
      this.distDirAbsolutePath,
      appTypesBasePath,
      moduleRelativePathToAppDir
    )

    return path.relative(
      moduleInAppTypesAbsolutePath + '/..',
      moduleAbsolutePath
    )
  }

  apply(compiler: webpack.Compiler) {
    // From asset root to dist root
    const assetDirRelative = this.dev
      ? '..'
      : this.isEdgeServer
      ? '..'
      : '../..'

    const handleModule = async (mod: webpack.NormalModule, assets: any) => {
      if (!mod.resource) return

      if (!/\.(js|jsx|ts|tsx|mjs)$/.test(mod.resource)) return

      if (!mod.resource.startsWith(this.appDir + path.sep)) {
        if (!this.dev) {
          if (mod.resource.startsWith(this.pagesDir + path.sep)) {
            collectPage(mod.resource, {
              appDir: this.appDir,
              pagesDir: this.pagesDir,
              typedRoutes: this.typedRoutes,
              pageExtensions: this.pageExtensions,
              isEdgeServer: this.isEdgeServer,
            })
          }
        }
        return
      }

      if (mod.layer !== WEBPACK_LAYERS.reactServerComponents) return

      const IS_LAYOUT = /[/\\]layout\.[^./\\]+$/.test(mod.resource)
      const IS_PAGE = !IS_LAYOUT && /[/\\]page\.[^.]+$/.test(mod.resource)
      const IS_ROUTE = !IS_PAGE && /[/\\]route\.[^.]+$/.test(mod.resource)
      const relativePathToApp = path.relative(this.appDir, mod.resource)

      if (!this.dev) {
        if (IS_PAGE || IS_ROUTE) {
          collectPage(mod.resource, {
            appDir: this.appDir,
            pagesDir: this.pagesDir,
            typedRoutes: this.typedRoutes,
            pageExtensions: this.pageExtensions,
            isEdgeServer: this.isEdgeServer,
          })
        }
      }

      const typePath = path.join(
        appTypesBasePath,
        relativePathToApp.replace(/\.(js|jsx|ts|tsx|mjs)$/, '.ts')
      )
      const relativeImportPath = normalizePathSep(
        path
          .join(this.getRelativePathFromAppTypesDir(relativePathToApp))
          .replace(/\.(js|jsx|ts|tsx|mjs)$/, '')
      )

      const assetPath = path.join(assetDirRelative, typePath)

      if (IS_LAYOUT) {
        const slots = await collectNamedSlots(mod.resource)
        assets[assetPath] = new sources.RawSource(
          createTypeGuardFile(mod.resource, relativeImportPath, {
            type: 'layout',
            slots,
          })
        )
      } else if (IS_PAGE) {
        assets[assetPath] = new sources.RawSource(
          createTypeGuardFile(mod.resource, relativeImportPath, {
            type: 'page',
          })
        )
      } else if (IS_ROUTE) {
        assets[assetPath] = new sources.RawSource(
          createTypeGuardFile(mod.resource, relativeImportPath, {
            type: 'route',
          })
        )
      }
    }

    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processAssets.tapAsync(
        {
          name: PLUGIN_NAME,
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_HASH,
        },
        async (assets, callback) => {
          const promises: Promise<any>[] = []

          // Clear routes
          if (this.isEdgeServer) {
            routeTypes.edge.dynamic = ''
            routeTypes.edge.static = ''
          } else {
            routeTypes.node.dynamic = ''
            routeTypes.node.static = ''
          }

          compilation.chunkGroups.forEach((chunkGroup) => {
            chunkGroup.chunks.forEach((chunk) => {
              if (!chunk.name) return

              // Here we only track page and route chunks.
              if (
                !chunk.name.startsWith('pages/') &&
                !(
                  chunk.name.startsWith('app/') &&
                  (chunk.name.endsWith('/page') ||
                    chunk.name.endsWith('/route'))
                )
              ) {
                return
              }

              const chunkModules =
                compilation.chunkGraph.getChunkModulesIterable(
                  chunk
                ) as Iterable<webpack.NormalModule>
              for (const mod of chunkModules) {
                promises.push(handleModule(mod, assets))

                // If this is a concatenation, register each child to the parent ID.
                const anyModule = mod as unknown as {
                  modules: webpack.NormalModule[]
                }
                if (anyModule.modules) {
                  anyModule.modules.forEach((concatenatedMod) => {
                    promises.push(handleModule(concatenatedMod, assets))
                  })
                }
              }
            })
          })

          await Promise.all(promises)

          // Support `"moduleResolution": "Node16" | "NodeNext"` with `"type": "module"`

          const packageJsonAssetPath = path.join(
            assetDirRelative,
            'types/package.json'
          )

          assets[packageJsonAssetPath] = new sources.RawSource(
            '{"type": "module"}'
          ) as unknown as webpack.sources.RawSource

          if (this.typedRoutes) {
            if (this.dev && !this.isEdgeServer) {
              devPageFiles.forEach((file) => {
                collectPage(file, {
                  appDir: this.appDir,
                  pagesDir: this.pagesDir,
                  typedRoutes: this.typedRoutes,
                  pageExtensions: this.pageExtensions,
                  isEdgeServer: this.isEdgeServer,
                })
              })
            }

            const linkAssetPath = path.join(assetDirRelative, 'types/link.d.ts')

            assets[linkAssetPath] = new sources.RawSource(
              createRouteDefinitions()
            ) as unknown as webpack.sources.RawSource
          }

          callback()
        }
      )
    })
  }
}
