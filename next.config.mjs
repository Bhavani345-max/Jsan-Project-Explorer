import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root so the parent-directory lockfile is ignored.
  outputFileTracingRoot: __dirname,
  // node-postgres resolves its optional native binding (pg-native) and its
  // connection string parser through runtime require(). Bundling it produces
  // "Critical dependency" warnings and can break the driver, so leave it as a
  // real node_module in the server output. Only used when DATABASE_URL points
  // at a non-Neon host (Railway Postgres, docker-compose Postgres).
  serverExternalPackages: ["pg"],
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // pptxgenjs / jspdf reference Node core modules behind environment
      // guards. They never run in the browser, so (1) rewrite `node:x` → `x`
      // and (2) stub those cores out of the client bundle.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, "");
        }),
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        https: false,
        http: false,
        path: false,
        os: false,
        stream: false,
        zlib: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
