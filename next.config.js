/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  experimental: {
    forceSwcTransforms: true,
  },
  env: {
    API_URL: process.env.API_URL,
    EVO_MANAGER_API: process.env.EVO_MANAGER_API,
  },
  images: {
    unoptimized: true,
    domains: ["link.storjshare.io"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "link.storjshare.io",
      },
    ],
  },
};

module.exports = nextConfig;
