import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      // Tách thư viện ra chunk riêng: đổi code ứng dụng không làm trình duyệt tải lại thư viện.
      // antd là 1 khối lớn sẵn (~1MB chưa nén) nên nâng ngưỡng cảnh báo cho chunk vendor.
      chunkSizeWarningLimit: 1200,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
              { name: 'antd', test: /node_modules[\\/](antd|@ant-design|@rc-component|rc-[^\\/]+)[\\/]/ },
              { name: 'charts', test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor)[\\/]/ },
              { name: 'vendor', test: /node_modules[\\/]/ },
            ],
          },
        },
      },
    },
    server: {
      port: 5174,
      strictPort: true,
      // Dev: chuyển /api sang backend, frontend và API cùng origin nên không cần CORS
      proxy: {
        // xfwd: gửi kèm X-Forwarded-For để API biết IP thật của client (lịch sử đăng nhập)
        '/api': { target: env.API_PROXY_TARGET || 'http://localhost:4000', changeOrigin: true, xfwd: true },
      },
    },
  };
});
