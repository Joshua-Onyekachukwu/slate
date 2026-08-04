/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@videogen/shared", "@videogen/db", "@videogen/ai"],
};

export default nextConfig;
