import type { NextConfig } from "next"
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@prisma/client',
    'better-sqlite3',
    '@prisma/adapter-better-sqlite3',
  ],
  webpack: (config, { isServer }) => {
    // Prisma 7 TypeScript-native client uses .js extensions that resolve to .ts files
    // Configure webpack to try .ts before .js for these imports
    config.resolve = {
      ...config.resolve,
      extensionAlias: {
        '.js': ['.ts', '.tsx', '.js', '.jsx'],
        '.mjs': ['.mts', '.mjs'],
        '.cjs': ['.cts', '.cjs'],
      },
      // konva's node build imports 'canvas' for SSR — stub it out since
      // InfiniteCanvas is a client component and canvas is never needed server-side
      alias: {
        ...config.resolve.alias,
        canvas: false,
      },
    }

    if (isServer) {
      // Prevent socket.io optional peer deps from breaking server builds
      config.externals = config.externals || []
      if (Array.isArray(config.externals)) {
        config.externals.push({
          'utf-8-validate': 'commonjs utf-8-validate',
          bufferutil: 'commonjs bufferutil',
        })
      }
    }

    return config
  },
}

export default function config(phase: string): NextConfig {
  return {
    ...nextConfig,
    // Builds must not replace chunks used by an already-running dev server.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
  }
}
