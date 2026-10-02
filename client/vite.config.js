import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "")

  if (!env.VITE_API_PROXY_TARGET) {
    throw new Error("VITE_API_PROXY_TARGET is required in client/.env")
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      host: "0.0.0.0",
      port: Number(env.VITE_PORT || 5173),
      proxy: {
        "/api": {
          target: env.VITE_API_PROXY_TARGET,
          changeOrigin: true,
        },
      },
    },
  }
})
