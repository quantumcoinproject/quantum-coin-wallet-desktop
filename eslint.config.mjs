import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const bannedSinkProperties = ["innerHTML", "outerHTML", "insertAdjacentHTML", "write", "writeln"];

export default tseslint.config(
  {
    // out/** holds the pre-TypeScript electron-forge build output.
    ignores: ["dist/**", "out/**", "node_modules/**", "public/**", "playwright-report/**", "test-results/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "electron/**/*.ts", "e2e/**/*.ts", "scripts/**/*.mjs"],
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-restricted-properties": [
        "error",
        ...bannedSinkProperties.map((property) => ({
          property,
          message: `Use the safe DOM builder (el/textContent) instead of ${property}.`,
        })),
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Function']",
          message: "new Function() is banned.",
        },
        {
          selector: "AssignmentExpression[left.property.name='innerHTML']",
          message: "innerHTML assignment is banned; use the safe DOM builder.",
        },
        {
          selector: "AssignmentExpression[left.property.name='outerHTML']",
          message: "outerHTML assignment is banned; use the safe DOM builder.",
        },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // The main process is CommonJS and loads the native/SDK modules lazily per
    // IPC call (same as the old app's index.js did).
    files: ["electron/**/*.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // Vendored QR code library (verbatim port of the legacy qrcode.js, MIT).
    // Style rules are relaxed for it; the security rules above still apply.
    files: ["src/ui/qrcode.ts"],
    rules: {
      // QRBitBuffer/QR8bitByte expose a .write(buffer) method; document.write
      // stays banned via the html-sink properties below.
      "no-restricted-properties": [
        "error",
        ...["innerHTML", "outerHTML", "insertAdjacentHTML"].map((property) => ({
          property,
          message: `Use the safe DOM builder (el/textContent) instead of ${property}.`,
        })),
      ],
      "no-var": "off",
      "prefer-const": "off",
      "prefer-rest-params": "off",
      "no-prototype-builtins": "off",
      "no-useless-escape": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
  {
    files: ["scripts/**/*.js", "scripts/**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", require: "readonly", module: "readonly", __dirname: "readonly", Buffer: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  }
);
