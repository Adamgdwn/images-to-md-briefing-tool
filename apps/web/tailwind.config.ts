import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#20262e",
        mist: "#eef2f5",
        line: "#d7dde3",
        pine: "#176b5d",
        amber: "#b7791f",
        brick: "#a43d3d"
      }
    }
  },
  plugins: []
};

export default config;
