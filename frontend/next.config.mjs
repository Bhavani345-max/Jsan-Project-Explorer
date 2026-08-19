import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,  // Security headers.
  //
  // Deliberately limited to headers that CANNOT change how a page renders. The
  // portal already ships HSTS from Vercel's edge; what was missing was
  // clickjacking, MIME-sniffing and referrer control.
  //
  // Note what is NOT here: a full Content-Security-Policy with script-src.
  // Next.js injects inline bootstrap and hydration scripts, so a real script-src
  // needs per-request nonces plumbed through middleware — and getting that
  // subtly wrong white-screens the app rather than failing loudly. Only
  // `frame-ancestors` is set, which restricts framing and nothing else, so it
  // carries no rendering risk. The nonce work is a separate, testable change.
  async headers() {
    return [
      {
        // `/:path*` matches the root as well as every nested path.
        source: "/:path*",
        headers: [
          // Clickjacking, stated twice on purpose: frame-ancestors is the
          // modern control and wins where both are understood, X-Frame-Options
          // covers older agents that ignore CSP.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The portal uses none of these APIs (verified: no navigator.geolocation
          // or getUserMedia anywhere in src/), so denying them costs nothing and
          // stops a future dependency from quietly asking for them.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },

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
