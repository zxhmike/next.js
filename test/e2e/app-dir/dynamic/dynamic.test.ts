import { createNextDescribe } from 'e2e-utils'
import fsp from 'fs/promises'

createNextDescribe(
  'app dir - next/dynamic',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next, isNextStart }) => {
    it('should handle ssr: false in pages when appDir is enabled', async () => {
      const $ = await next.render$('/legacy/no-ssr')
      expect($.html()).not.toContain('navigator')

      const browser = await next.browser('/legacy/no-ssr')
      expect(
        await browser.waitForElementByCss('#pure-client').text()
      ).toContain('navigator')
    })

    it('should handle next/dynamic in SSR correctly', async () => {
      const $ = await next.render$('/dynamic')
      // filter out the script
      const selector = 'body div'
      const serverContent = $(selector).text()
      // should load chunks generated via async import correctly with React.lazy
      expect(serverContent).toContain('next-dynamic lazy')
      // should support `dynamic` in both server and client components
      expect(serverContent).toContain('next-dynamic dynamic on server')
      expect(serverContent).toContain('next-dynamic dynamic on client')
      expect(serverContent).toContain('next-dynamic server import client')
      expect(serverContent).not.toContain(
        'next-dynamic dynamic no ssr on client'
      )

      expect(serverContent).not.toContain(
        'next-dynamic dynamic no ssr on server'
      )

      // client component under server component with ssr: false will not be rendered either in flight or SSR
      expect($.html()).not.toContain('client component under sever no ssr')
    })

    it('should handle next/dynamic in hydration correctly', async () => {
      const selector = 'body div'
      const browser = await next.browser('/dynamic')
      const clientContent = await browser.elementByCss(selector).text()
      expect(clientContent).toContain('next-dynamic dynamic no ssr on server')
      expect(clientContent).toContain('client component under sever no ssr')
      await browser.waitForElementByCss('#css-text-dynamic-no-ssr-client')

      expect(
        await browser.elementByCss('#css-text-dynamic-no-ssr-client').text()
      ).toBe('next-dynamic dynamic no ssr on client:suffix')
    })

    it('should generate correct client manifest for dynamic chunks', async () => {
      const $ = await next.render$('/chunk-loading/server')
      expect($('h1').text()).toBe('hello')
    })

    describe('no SSR', () => {
      it('should not render client component imported through ssr: false in server components', async () => {
        // noSSR should not show up in html
        const $ = await next.render$('/dynamic-mixed-ssr-false/server')
        expect($('#server-false-server-module')).not.toContain(
          'ssr-false-server-module-text'
        )
        expect($('#server-false-client-module')).not.toContain(
          'ssr-false-client-module-text'
        )
        // noSSR should not show up in browser
        const browser = await next.browser('/dynamic-mixed-ssr-false/server')
        expect(
          await browser.elementByCss('#ssr-false-server-module').text()
        ).toBe('ssr-false-server-module-text')
        expect(
          await browser.elementByCss('#ssr-false-client-module').text()
        ).toBe('ssr-false-client-module-text')

        // in the server bundle should not contain client component imported through ssr: false
        if (isNextStart) {
          const chunksDir = `.next/server/chunks`
          const serverChunksFilePaths = await fsp.readdir(
            `${next.testDir}/${chunksDir}`
          )

          let hasServerModule = false
          const readFilePromises = serverChunksFilePaths.map(
            async (filePath) => {
              const pageServerChunk = await next.readFile(
                `${chunksDir}/${filePath}`
                // filePath
              )
              hasServerModule ||= pageServerChunk.includes(
                'ssr-false-server-module-text'
              )
              expect(pageServerChunk).not.toContain(
                'ssr-false-client-module-text'
              )
            }
          )
          await Promise.all(readFilePromises)
          expect(hasServerModule).toContain(true)

          // const pageServerChunk = await next.readFile(
          //   `${chunksDir}/${serverChunksFilePaths[0]}`
          // )
          // const pageServerChunk = await next.readFile(
          //   '.next/server/app/dynamic-mixed-ssr-false/server/page.js'
          // )
          // expect(pageServerChunk).toContain('ssr-false-server-module-text')
        }
      })

      it('should not render client component imported through ssr: false in client components', async () => {
        // noSSR should not show up in html
        const $ = await next.render$('/dynamic-mixed-ssr-false/client')
        expect($('#client-false-server-module')).not.toContain(
          'ssr-false-server-module-text'
        )
        expect($('#client-false-client-module')).not.toContain(
          'ssr-false-client-module-text'
        )
        // noSSR should not show up in browser
        const browser = await next.browser('/dynamic-mixed-ssr-false/client')
        expect(
          await browser.elementByCss('#ssr-false-server-module').text()
        ).toBe('ssr-false-server-module-text')
        expect(
          await browser.elementByCss('#ssr-false-client-module').text()
        ).toBe('ssr-false-client-module-text')

        // in the server bundle should not contain both server and client component imported through ssr: false
        if (isNextStart) {
          // const pageServerChunk = await next.readFile(
          //   '.next/server/app/dynamic-mixed-ssr-false/client/page.js'
          // )
          // expect(pageServerChunk).not.toContain('ssr-false-server-module-text')
          // expect(pageServerChunk).not.toContain('ssr-false-client-module-text')

          const chunksDir = `.next/server/chunks`
          const serverChunksFilePaths = await fsp.readdir(
            `${next.testDir}/${chunksDir}`
          )
          let hasServerModule = false
          const readFilePromises = serverChunksFilePaths.map(
            async (filePath) => {
              const pageServerChunk = await next.readFile(
                `${chunksDir}/${filePath}`
                // filePath
              )
              hasServerModule ||= pageServerChunk.includes(
                'ssr-false-server-module-text'
              )
              expect(pageServerChunk).not.toContain(
                'ssr-false-client-module-text'
              )
            }
          )
          await Promise.all(readFilePromises)
          expect(hasServerModule).toContain(false)
        }
      })
    })

    // if (isNextStart) {
    //   it('should not contain ssr:false module in edge server bundle', async () => {
    //     const pageServerChunk = await next.readFile(
    //       '.next/server/app/dynamic-edge/page.js'
    //     )
    //     expect(pageServerChunk).toContain('ssr-false-server-module-text')
    //     expect(pageServerChunk).not.toContain('ssr-false-client-module-text')
    //   })
    // }
  }
)
