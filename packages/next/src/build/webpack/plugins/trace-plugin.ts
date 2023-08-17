import { NormalModule, webpack } from 'next/dist/compiled/webpack/webpack'

/**
 * A vertex in the module graph.
 */
interface Module {
  type: string
  identifier(): string
}

/**
 * An edge in the module graph.
 */
interface Connection {
  originModule: unknown
}

const ELIMINATED_PACKAGES = new Set<string>()

/**
 * Find unique origin modules in the specified 'connections', which possibly
 * contains more than one connection for a module due to different types of
 * dependency.
 */
function findUniqueOriginModulesInConnections(
  connections: Connection[],
  originModule: Module
): Set<unknown> {
  const originModules = new Set()
  for (const connection of connections) {
    if (
      !originModules.has(connection.originModule) &&
      connection.originModule !== originModule
    ) {
      originModules.add(connection.originModule)
    }
  }
  return originModules
}

export class TracePlugin implements webpack.WebpackPluginInstance {
  private moduleTraces: {
    build: Record<string, any>
    rebuild: Record<string, any>
  } = {
    build: {},
    rebuild: {},
  }

  apply(compiler: webpack.Compiler): void {
    compiler.hooks.afterDone.tap(TracePlugin.name, (stats) => {
      console.log('-------------', {
        start: stats.startTime,
        end: stats.endTime,
      })

      Array.from(stats.compilation.modules)
        //.filter((x) => x.identifier().includes("index.tsx") || x.identifier().includes("test.ts"))
        .forEach((x) => {
          console.log(x.buildInfo)
        })
    })

    /*
    compiler.hooks.make.tapAsync(
      TracePlugin.name,
      async (compilation: webpack.Compilation, callback: () => void) => {
        compilation.hooks.buildModule.tap(
          TracePlugin.name,
          (module: Module) => {
            const id = module.identifier()
            this.moduleTraces.build[id] = {
              start: Date.now(),
            }
          }
        )

        compilation.hooks.rebuildModule.tap(
          TracePlugin.name,
          (module: Module) => {
            const id = module.identifier()
            this.moduleTraces.rebuild[id] = {
              start: Date.now(),
            }
          }
        )

        compilation.hooks.finishRebuildingModule.tap(
          TracePlugin.name,
          (module: Module) => {
            const id = module.identifier()
          }
        )

        compilation.hooks.succeedModule.tap(
          TracePlugin.name,
          (module: Module) => {
            const id = module.identifier()
          }
        )

        compilation.hooks.finishModules.tapAsync(
          TracePlugin.name,
          async (modules: Iterable<Module>, modulesFinish: () => void) => {
            console.log(this.moduleTraces);
            this.moduleTraces = {build: {}, rebuild: {}}
            modulesFinish()
          }
        )

        // buildModule
        //Triggered before a module build has started, can be used to modify the module.

        //rebuildModule
        //Fired before rebuilding a module.

        //failedModule
        //Run when a module build has failed.

        //succeedModule
        //Executed when a module has been built successfully.

        //finishModules
        //Called when all modules have been built without errors.

        //finishRebuildingModule
        //Executed when a module has been rebuilt, in case of both success or with errors.

        callback()
      }
    )*/
  }
}
