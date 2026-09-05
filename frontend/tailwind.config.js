/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#25B1FF",
        secondary: "#FFC722",
        background: "#F7F8FC",
        success: "#22C55E",
        warning: "#F59E0B",
        danger: "#EF4444",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
      },
      boxShadow: {
        soft: "0 2px 20px rgba(17, 24, 39, 0.06)",
        card: "0 20px 40px -16px rgba(37, 177, 255, 0.18), 0 4px 12px -4px rgba(17, 24, 39, 0.06)",
        // Neumorphic dual shadow (dark navy shadow down-right + white highlight
        // up-left) — same recipe/ratio as the reference (28/28/50/16% + -23/-23/45/100%),
        // scaled down from a ~150px mockup circle to real button sizes (~40-44px)
        // so it reads as a soft raised edge instead of a giant overlapping blur.
        neu: "8px 8px 14px rgba(13, 39, 80, 0.16), -6px -6px 12px rgba(255, 255, 255, 1)",
        "neu-dark": "8px 8px 14px rgba(0, 0, 0, 0.5), -6px -6px 12px rgba(255, 255, 255, 0.04)",
        "neu-primary": "8px 8px 14px rgba(37, 177, 255, 0.25), -6px -6px 12px rgba(255, 255, 255, 1)",
        "neu-primary-dark": "8px 8px 14px rgba(37, 177, 255, 0.35), -6px -6px 12px rgba(255, 255, 255, 0.05)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};
