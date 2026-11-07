import type { NextConfig } from "next";

// The site is fully static: Netlify serves the exported `out/` folder.
const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: false,
};

export default config;
