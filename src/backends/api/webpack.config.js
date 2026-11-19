// Cấu hình webpack cho `nest build` / `nest start --watch` (xem nest-cli.json).
//
// Các package nội bộ (@base/db, @base/server-kit, @base/shared) xuất thẳng file .ts nên Node
// không chạy trực tiếp được → đưa vào bundle để ts-loader biên dịch. Thư viện bên thứ ba khai báo
// trong package.json của api vẫn để ngoài bundle (require lúc chạy); thư viện chỉ có trong các
// package nội bộ (drizzle-orm, jose, nodemailer...) không nằm trong node_modules của api nên
// được gộp vào bundle.
const nodeExternals = require('webpack-node-externals');

module.exports = (options) => ({
  ...options,
  externals: [nodeExternals({ allowlist: [/^@base\//] })],
  // Không cần cảnh báo kích thước bundle cho server
  performance: { hints: false },
});
