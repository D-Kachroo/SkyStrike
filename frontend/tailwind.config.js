/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        midnight: "#020712",
        ocean: "#031827",
        panel: "rgba(5, 18, 31, 0.72)",
        line: "rgba(135, 199, 255, 0.2)",
        blueforce: "#38d5ff",
        blueforceDeep: "#2378ff",
        redforce: "#fa3c2c",
        redforceDeep: "#ff2f2f"
      },
      fontFamily: {
        command: [
          "Inter",
          "Rajdhani",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif"
        ]
      },
      boxShadow: {
        glowBlue: "0 0 28px rgba(56, 213, 255, 0.28)",
        glowRed: "0 0 28px rgba(255, 89, 61, 0.26)",
        panel: "0 18px 80px rgba(0, 0, 0, 0.45)"
      }
    }
  },
  plugins: []
};
