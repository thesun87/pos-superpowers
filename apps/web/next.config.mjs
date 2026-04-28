import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@pos/contracts", "@pos/domain", "@pos/ui"],
  experimental: {
    typedRoutes: true
  }
};

export default withSentryConfig(nextConfig, {
  silent: true,
  hideSourceMaps: true,
  disableLogger: true
});
