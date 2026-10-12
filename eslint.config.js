import tseslint from "typescript-eslint";
export default tseslint.config(...tseslint.configs.recommended, {
  files: ["**/*.ts", "**/*.mjs"],
  languageOptions: {
    globals: {
      process: "readonly",
      Buffer: "readonly",
      console: "readonly",
      setTimeout: "readonly",
      URL: "readonly",
      fetch: "readonly",
    },
  },
  rules: { "@typescript-eslint/no-explicit-any": "error" },
});
