/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@slate/shared", "@slate/db", "@slate/ai"],
};

export default nextConfig;
