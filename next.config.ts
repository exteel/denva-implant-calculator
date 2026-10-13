import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  // Always define the data-source switch so it is a build-time constant: in a
  // normal build `process.env.NEXT_PUBLIC_DATA_SOURCE === "fixture"` folds to
  // false and the fixture data source (src/lib/data/fixture.ts) is not bundled.
  env: {
    NEXT_PUBLIC_DATA_SOURCE: process.env.NEXT_PUBLIC_DATA_SOURCE ?? "",
  },
};

export default nextConfig;
