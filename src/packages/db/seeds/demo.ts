/**
 * Dữ liệu demo cho tính năng bán hàng & tồn kho (CHỈ dùng ở môi trường dev / test thủ công).
 *
 * Tạo dữ liệu bằng cách GỌI API thật (đăng nhập admin → danh mục, sản phẩm, nhà cung cấp,
 * nhập hàng, bán hàng, điều chỉnh tồn), nên sổ cái, giá vốn bình quân, tồn kho luôn nhất quán.
 * Sau mỗi chứng từ, lùi thời điểm của chứng từ + biến động tồn về ngày tương ứng trong 60 ngày qua
 * (theo đúng thứ tự thời gian) để báo cáo / biểu đồ có số liệu.
 *
 * Chạy (API phải đang chạy, mặc định http://localhost:4000):
 *   pnpm db:seed:demo
 *   DEMO_API_URL=http://127.0.0.1:4010/api/v1 pnpm db:seed:demo
 *
 * Tài khoản tạo thêm (mật khẩu Demo@1234): manager@example.com (Manager),
 * staff@example.com, staff2@example.com (Staff).
 */
import { config } from 'dotenv';
import { eq, inArray, sql } from 'drizzle-orm';
import {
  createDb,
  inventoryAdjustments,
  inventoryMovements,
  products,
  purchaseReceipts,
  salesOrders,
} from '../src';

config({ path: '../../backends/api/.env', quiet: true });

const API = process.env.DEMO_API_URL ?? 'http://localhost:4000/api/v1';
const DEMO_PASSWORD = 'Demo@1234';
const DAYS = 60;

// ----- Số ngẫu nhiên có hạt giống: chạy lại cho cùng bộ dữ liệu -----
let seed = 20261119;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)]!;
const chance = (p: number) => rand() < p;

// ----- Gọi API -----
class ApiError extends Error {
  constructor(
    public status: number,
    public key: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
  app = 'admin',
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-app': app,
      'x-lang': 'vi',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as {
    data: T;
    error?: { key?: string; message?: string };
  } | null;
  if (!res.ok || json?.error) {
    throw new ApiError(
      res.status,
      json?.error?.key,
      `${method} ${path} → ${res.status} ${json?.error?.message ?? ''}`,
    );
  }
  return json!.data;
}

async function login(email: string, password: string, app: 'admin' | 'user'): Promise<string> {
  const data = await call<{ status: string; accessToken?: string }>(
    null,
    'POST',
    '/auth/login',
    { email, password },
    app,
  );
  if (data.status !== 'success' || !data.accessToken) {
    throw new Error(
      `Đăng nhập ${email} cần 2FA hoặc thiết lập 2FA — tắt yêu cầu 2FA admin hoặc dùng tài khoản khác`,
    );
  }
  return data.accessToken;
}

// ----- Dữ liệu mẫu -----
interface ProductSeed {
  sku: string;
  name: string;
  unit: string;
  cost: number;
  price: number;
  minStock: number;
  /** Số lượng nhập lần đầu */
  initial: number;
  decimal?: boolean;
  /** Không nhập bổ sung → sắp hết / hết hàng để test cảnh báo */
  noRestock?: boolean;
}

const CATALOG: { category: string; supplier: number; items: ProductSeed[] }[] = [
  {
    category: 'Đồ uống',
    supplier: 0,
    items: [
      {
        sku: 'DU-001',
        name: 'Nước suối Aquafina 500ml',
        unit: 'chai',
        cost: 3500,
        price: 6000,
        minStock: 24,
        initial: 240,
      },
      {
        sku: 'DU-002',
        name: 'Coca-Cola lon 330ml',
        unit: 'lon',
        cost: 6500,
        price: 10000,
        minStock: 24,
        initial: 192,
      },
      {
        sku: 'DU-003',
        name: 'Pepsi lon 330ml',
        unit: 'lon',
        cost: 6300,
        price: 10000,
        minStock: 24,
        initial: 144,
      },
      {
        sku: 'DU-004',
        name: 'Trà xanh Không Độ 455ml',
        unit: 'chai',
        cost: 7000,
        price: 10000,
        minStock: 20,
        initial: 120,
      },
      {
        sku: 'DU-005',
        name: 'Nước tăng lực Red Bull lon',
        unit: 'lon',
        cost: 9000,
        price: 12000,
        minStock: 12,
        initial: 48,
        noRestock: true,
      },
      {
        sku: 'DU-006',
        name: 'Sữa tươi Vinamilk 180ml',
        unit: 'hộp',
        cost: 5500,
        price: 8000,
        minStock: 30,
        initial: 192,
      },
      {
        sku: 'DU-007',
        name: 'Cà phê G7 hộp 21 gói',
        unit: 'hộp',
        cost: 42000,
        price: 55000,
        minStock: 5,
        initial: 30,
      },
      {
        sku: 'DU-008',
        name: 'Nước cam Twister 455ml',
        unit: 'chai',
        cost: 8500,
        price: 12000,
        minStock: 12,
        initial: 72,
      },
    ],
  },
  {
    category: 'Bánh kẹo & mì',
    supplier: 1,
    items: [
      {
        sku: 'BK-001',
        name: 'Bánh Oreo 133g',
        unit: 'gói',
        cost: 16000,
        price: 22000,
        minStock: 10,
        initial: 60,
      },
      {
        sku: 'BK-002',
        name: 'Snack Oishi tôm cay 40g',
        unit: 'gói',
        cost: 4000,
        price: 6000,
        minStock: 20,
        initial: 150,
      },
      {
        sku: 'BK-003',
        name: 'Kẹo Alpenliebe gói 120g',
        unit: 'gói',
        cost: 18000,
        price: 25000,
        minStock: 8,
        initial: 40,
      },
      {
        sku: 'BK-004',
        name: 'Bánh ChocoPie hộp 12 cái',
        unit: 'hộp',
        cost: 48000,
        price: 62000,
        minStock: 6,
        initial: 24,
        noRestock: true,
      },
      {
        sku: 'BK-005',
        name: 'Mì Hảo Hảo tôm chua cay',
        unit: 'gói',
        cost: 3200,
        price: 5000,
        minStock: 60,
        initial: 300,
      },
      {
        sku: 'BK-006',
        name: 'Mì Omachi xốt bò hầm',
        unit: 'gói',
        cost: 6500,
        price: 9000,
        minStock: 30,
        initial: 150,
      },
    ],
  },
  {
    category: 'Gia vị',
    supplier: 2,
    items: [
      {
        sku: 'GV-001',
        name: 'Nước mắm Nam Ngư 500ml',
        unit: 'chai',
        cost: 28000,
        price: 38000,
        minStock: 10,
        initial: 48,
      },
      {
        sku: 'GV-002',
        name: 'Dầu ăn Neptune 1L',
        unit: 'chai',
        cost: 42000,
        price: 55000,
        minStock: 10,
        initial: 48,
      },
      {
        sku: 'GV-003',
        name: 'Muối i-ốt 500g',
        unit: 'gói',
        cost: 4500,
        price: 7000,
        minStock: 15,
        initial: 80,
      },
      {
        sku: 'GV-004',
        name: 'Đường Biên Hoà 1kg',
        unit: 'gói',
        cost: 21000,
        price: 28000,
        minStock: 10,
        initial: 60,
      },
      {
        sku: 'GV-005',
        name: 'Hạt nêm Knorr 400g',
        unit: 'gói',
        cost: 32000,
        price: 42000,
        minStock: 8,
        initial: 40,
      },
    ],
  },
  {
    category: 'Rau củ quả',
    supplier: 4,
    items: [
      {
        sku: 'RC-001',
        name: 'Cà chua Đà Lạt',
        unit: 'kg',
        cost: 15000,
        price: 25000,
        minStock: 5,
        initial: 40,
        decimal: true,
      },
      {
        sku: 'RC-002',
        name: 'Khoai tây',
        unit: 'kg',
        cost: 18000,
        price: 28000,
        minStock: 5,
        initial: 40,
        decimal: true,
      },
      {
        sku: 'RC-003',
        name: 'Hành tây',
        unit: 'kg',
        cost: 16000,
        price: 24000,
        minStock: 5,
        initial: 30,
        decimal: true,
      },
      {
        sku: 'RC-004',
        name: 'Chuối già',
        unit: 'kg',
        cost: 14000,
        price: 22000,
        minStock: 5,
        initial: 30,
        decimal: true,
      },
    ],
  },
  {
    category: 'Hoá phẩm gia dụng',
    supplier: 2,
    items: [
      {
        sku: 'GD-001',
        name: 'Nước rửa chén Sunlight 750g',
        unit: 'chai',
        cost: 24000,
        price: 32000,
        minStock: 8,
        initial: 48,
      },
      {
        sku: 'GD-002',
        name: 'Bột giặt OMO 800g',
        unit: 'gói',
        cost: 38000,
        price: 49000,
        minStock: 8,
        initial: 40,
      },
      {
        sku: 'GD-003',
        name: 'Giấy vệ sinh Pulppy 10 cuộn',
        unit: 'bịch',
        cost: 52000,
        price: 68000,
        minStock: 5,
        initial: 30,
      },
      {
        sku: 'GD-004',
        name: 'Kem đánh răng P/S 180g',
        unit: 'tuýp',
        cost: 22000,
        price: 30000,
        minStock: 10,
        initial: 48,
      },
    ],
  },
  {
    category: 'Văn phòng phẩm',
    supplier: 3,
    items: [
      {
        sku: 'VP-001',
        name: 'Bút bi Thiên Long TL-027',
        unit: 'cây',
        cost: 2800,
        price: 5000,
        minStock: 30,
        initial: 200,
      },
      {
        sku: 'VP-002',
        name: 'Vở kẻ ngang 200 trang',
        unit: 'quyển',
        cost: 11000,
        price: 16000,
        minStock: 20,
        initial: 100,
      },
      {
        sku: 'VP-003',
        name: 'Băng keo trong 5cm',
        unit: 'cuộn',
        cost: 6000,
        price: 10000,
        minStock: 10,
        initial: 50,
      },
    ],
  },
];

const SUPPLIERS = [
  {
    name: 'Công ty TNHH Phân phối Thành Đạt',
    contactPerson: 'Anh Tuấn',
    phone: '0903111222',
    email: 'sales@thanhdat.vn',
    address: '12 Nguyễn Văn Linh, Q.7, TP.HCM',
  },
  {
    name: 'NPP Hoàng Gia',
    contactPerson: 'Chị Mai',
    phone: '0912333444',
    email: 'hoanggia.npp@gmail.com',
    address: '45 Lê Văn Việt, TP. Thủ Đức',
  },
  {
    name: 'Công ty CP Thực phẩm Sài Gòn Xanh',
    contactPerson: 'Anh Long',
    phone: '0283555666',
    email: 'order@saigonxanh.vn',
    address: '88 Cộng Hoà, Q. Tân Bình, TP.HCM',
  },
  {
    name: 'Đại lý Văn phòng phẩm Minh Châu',
    contactPerson: 'Chị Hạnh',
    phone: '0987654321',
    email: 'minhchau.vpp@gmail.com',
    address: '9 Nguyễn Trãi, Q.1, TP.HCM',
  },
  {
    name: 'Vựa rau Đà Lạt Tươi',
    contactPerson: 'Anh Phúc',
    phone: '0263777888',
    email: null,
    address: 'Chợ đầu mối Bình Điền, Q.8',
  },
];

const CUSTOMERS: [string | null, string | null][] = [
  [null, null],
  [null, null],
  [null, null],
  ['Chị Lan', '0901234567'],
  ['Anh Minh', '0912345678'],
  ['Cô Hoa', '0934567890'],
  ['Anh Dũng', null],
  ['Quán cơm Bà Năm', '0978123456'],
];

// ----- Thời gian (giờ Việt Nam) -----
const VN_OFFSET_MS = 7 * 3600_000;
const todayVn = new Date(Date.now() + VN_OFFSET_MS).toISOString().slice(0, 10);
function dayString(offset: number): string {
  return new Date(Date.parse(`${todayVn}T00:00:00Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
/** Thời điểm `hh:mm` giờ VN của ngày `offset` (âm = quá khứ) */
function at(offset: number, hour: number, minute = randInt(0, 59)): Date {
  return new Date(
    Date.parse(`${dayString(offset)}T00:00:00Z`) + (hour * 60 + minute) * 60_000 - VN_OFFSET_MS,
  );
}

/**
 * Xoá dữ liệu demo cũ — CHỈ những gì gắn với SKU / tên danh mục / tên nhà cung cấp demo, không
 * đụng dữ liệu khác. Chứng từ có chứa sản phẩm demo bị xoá cùng (kèm biến động tồn của chúng).
 */
async function resetDemo(db: ReturnType<typeof createDb>['db']) {
  const list = (values: string[]) =>
    sql.join(
      values.map((v) => sql`${v}`),
      sql`, `,
    );
  const skus = list(CATALOG.flatMap((g) => g.items.map((i) => i.sku)));
  const ids = sql`(select id from products where sku in (${skus}))`;
  await db.transaction(async (tx) => {
    await tx.execute(sql`delete from inventory_movements where product_id in ${ids}`);
    await tx.execute(
      sql`delete from sales_orders where id in (select order_id from sales_order_items where product_id in ${ids})`,
    );
    await tx.execute(
      sql`delete from purchase_receipts where id in (select receipt_id from purchase_receipt_items where product_id in ${ids})`,
    );
    await tx.execute(
      sql`delete from inventory_adjustments where id in (select adjustment_id from inventory_adjustment_items where product_id in ${ids})`,
    );
    await tx.execute(sql`delete from products where id in ${ids}`);
    await tx.execute(
      sql`delete from categories c where c.name in (${list(CATALOG.map((g) => g.category))})
          and not exists (select 1 from products p where p.category_id = c.id)`,
    );
    await tx.execute(
      sql`delete from suppliers s where s.name in (${list(SUPPLIERS.map((x) => x.name))})
          and not exists (select 1 from purchase_receipts r where r.supplier_id = s.id)`,
    );
  });
  console.log('Đã xoá dữ liệu demo cũ');
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Thiếu DATABASE_URL (src/backends/api/.env)');
  const { db, pool } = createDb(url, { max: 2 });

  /** Đặt lại mã chứng từ theo ngày đã lùi (PN/DH/DC-YYYYMMDD-NNNN), riêng ngày hôm nay giữ mã gốc */
  const counters = new Map<string, number>();
  const codeFor = (prefix: string, offset: number) => {
    const key = `${prefix}-${dayString(offset)}`;
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    return `${prefix}-${dayString(offset).replaceAll('-', '')}-D${String(next).padStart(3, '0')}`;
  };
  const backdateMovements = async (refId: string, when: Date, code?: string) => {
    await db
      .update(inventoryMovements)
      .set({ createdAt: when, ...(code ? { refCode: code } : {}) })
      .where(eq(inventoryMovements.refId, refId));
  };

  try {
    // ----- Đăng nhập & kiểm tra đã có dữ liệu demo chưa -----
    const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123';
    const admin = await login(adminEmail, adminPassword, 'admin');
    if (process.argv.includes('--reset')) await resetDemo(db);
    const existing = await call<unknown[]>(admin, 'GET', '/products?search=DU-001');
    if (existing.length) {
      console.log(
        'Đã có dữ liệu demo (SKU DU-001) — bỏ qua. Chạy `pnpm db:seed:demo -- --reset` để xoá và tạo lại.',
      );
      return;
    }

    // ----- Tài khoản demo -----
    const roles = await call<{ id: string; name: string }[]>(admin, 'GET', '/roles?pageSize=100');
    const roleId = (name: string) => roles.find((r) => r.name === name)?.id;
    for (const [email, firstName, role] of [
      ['manager@example.com', 'Quản lý', 'Manager'],
      ['staff@example.com', 'Thu ngân 1', 'Staff'],
      ['staff2@example.com', 'Thu ngân 2', 'Staff'],
    ] as const) {
      try {
        await call(admin, 'POST', '/users', {
          email,
          firstName,
          lastName: 'Demo',
          password: DEMO_PASSWORD,
          roleId: roleId(role),
        });
        console.log(`Tạo tài khoản ${email} (${role})`);
      } catch (error) {
        if ((error as ApiError).status !== 409) throw error;
        console.log(`Tài khoản ${email} đã tồn tại`);
      }
    }
    const manager = await login('manager@example.com', DEMO_PASSWORD, 'admin');
    const cashiers = [
      await login('staff@example.com', DEMO_PASSWORD, 'user'),
      await login('staff2@example.com', DEMO_PASSWORD, 'user'),
    ];

    // ----- Danh mục, sản phẩm, nhà cung cấp -----
    const supplierIds: string[] = [];
    for (const s of SUPPLIERS) {
      supplierIds.push((await call<{ id: string }>(manager, 'POST', '/suppliers', s)).id);
    }
    interface Live extends ProductSeed {
      id: string;
      supplierId: string;
      categoryId: string;
    }
    const live: Live[] = [];
    for (const group of CATALOG) {
      const category = await call<{ id: string }>(manager, 'POST', '/categories', {
        name: group.category,
      });
      for (const p of group.items) {
        const created = await call<{ id: string }>(manager, 'POST', '/products', {
          sku: p.sku,
          name: p.name,
          categoryId: category.id,
          unit: p.unit,
          allowDecimalQuantity: Boolean(p.decimal),
          purchasePrice: String(p.cost),
          sellingPrice: String(p.price),
          minStock: String(p.minStock),
        });
        live.push({
          ...p,
          id: created.id,
          supplierId: supplierIds[group.supplier]!,
          categoryId: category.id,
        });
      }
    }
    // Ngày tạo danh mục hàng hoá = đầu kỳ demo
    await db
      .update(products)
      .set({ createdAt: at(-DAYS - 1, 9) })
      .where(
        inArray(
          products.id,
          live.map((p) => p.id),
        ),
      );
    console.log(
      `Tạo ${SUPPLIERS.length} nhà cung cấp, ${CATALOG.length} danh mục, ${live.length} sản phẩm`,
    );

    // ----- Nhập hàng -----
    let receipts = 0;
    const purchase = async (
      offset: number,
      items: Live[],
      qty: (p: Live) => number,
      confirm = true,
    ) => {
      const supplierId = items[0]!.supplierId;
      const lines = items.map((p) => ({
        productId: p.id,
        quantity: String(qty(p)),
        // Giá nhập dao động ±6% để giá vốn bình quân thay đổi
        unitPrice: String(Math.round((p.cost * (0.94 + rand() * 0.12)) / 100) * 100),
      }));
      const subtotal = lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unitPrice), 0);
      const draft = await call<{ id: string; version: number; code: string }>(
        manager,
        'POST',
        '/purchases',
        {
          supplierId,
          receiptDate: dayString(offset),
          // Chiết khấu phiếu ~2% (làm tròn nghìn) cho 30% số phiếu
          discountAmount: chance(0.3) ? String(Math.floor((subtotal * 0.02) / 1000) * 1000) : '0',
          items: lines,
        },
      );
      const when = at(offset, randInt(7, 9));
      const code = offset < 0 ? codeFor('PN', offset) : undefined;
      if (confirm)
        await call(manager, 'POST', `/purchases/${draft.id}/confirm`, { version: draft.version });
      await db
        .update(purchaseReceipts)
        .set({
          createdAt: when,
          updatedAt: when,
          ...(confirm ? { confirmedAt: when } : {}),
          ...(code ? { code } : {}),
        })
        .where(eq(purchaseReceipts.id, draft.id));
      if (confirm) await backdateMovements(draft.id, when, code);
      receipts += 1;
      return draft;
    };
    const bySupplier = (index: number) => live.filter((p) => p.supplierId === supplierIds[index]);
    for (let s = 0; s < SUPPLIERS.length; s++) {
      await purchase(-DAYS, bySupplier(s), (p) => p.initial);
    }

    // ----- Từng ngày: nhập bổ sung, bán hàng, điều chỉnh -----
    let sold = 0;
    let shortages = 0;
    let cancelled = 0;
    let adjustments = 0;
    const adjust = async (offset: number, body: Record<string, unknown>) => {
      const result = await call<{ id: string }>(manager, 'POST', '/inventory/adjustments', {
        clientRequestId: crypto.randomUUID(),
        ...body,
      });
      const when = at(offset, 21, randInt(0, 30));
      const code = offset < 0 ? codeFor('DC', offset) : undefined;
      await db
        .update(inventoryAdjustments)
        .set({ createdAt: when, ...(code ? { code } : {}) })
        .where(eq(inventoryAdjustments.id, result.id));
      await backdateMovements(result.id, when, code);
      adjustments += 1;
    };

    for (let offset = -DAYS + 1; offset <= 0; offset++) {
      // Nhập bổ sung mỗi tuần (trừ hàng cố ý để hết), rau củ 3 ngày / lần
      if (offset % 7 === 0) {
        for (const s of [0, 1, 2, 3]) {
          const items = bySupplier(s).filter((p) => !p.noRestock && !p.decimal);
          if (items.length)
            await purchase(offset, items, (p) =>
              Math.max(6, Math.round(p.initial * (0.3 + rand() * 0.3))),
            );
        }
      }
      if (offset % 3 === 0) await purchase(offset, bySupplier(4), () => randInt(10, 25));

      // Bán hàng: cuối tuần đông hơn
      const weekday = new Date(`${dayString(offset)}T00:00:00Z`).getUTCDay();
      const orders = randInt(5, 10) + (weekday === 0 || weekday === 6 ? 4 : 0);
      for (let n = 0; n < orders; n++) {
        const lines = new Map<string, Live>();
        for (let k = randInt(1, 4); k > 0; k--) {
          const p = pick(live);
          lines.set(p.id, p);
        }
        const [customerName, customerPhone] = pick(CUSTOMERS);
        const items = [...lines.values()].map((p) => ({
          productId: p.id,
          quantity: p.decimal
            ? (randInt(3, 25) / 10).toFixed(1)
            : String(randInt(1, p.price < 10000 ? 6 : 3)),
          discountAmount: chance(0.08) ? '1000' : '0',
        }));
        const subtotal = items.reduce(
          (sum, i) =>
            sum + Number(i.quantity) * lines.get(i.productId)!.price - Number(i.discountAmount),
          0,
        );
        // Chiết khấu đơn tối đa ~10% tạm tính, làm tròn nghìn
        const orderDiscount = chance(0.12) ? Math.floor((subtotal * 0.1) / 1000) * 1000 : 0;
        const markPaid = !chance(0.06);
        const token = chance(0.8) ? pick(cashiers) : manager;
        const app = token === manager ? 'admin' : 'user';
        try {
          const order = await call<{ id: string; code: string; version: number; status: string }>(
            token,
            'POST',
            '/sales-orders',
            {
              clientRequestId: crypto.randomUUID(),
              orderDate: dayString(offset),
              customerName,
              customerPhone,
              paymentMethod: chance(0.65) ? 'CASH' : chance(0.85) ? 'BANK_TRANSFER' : 'OTHER',
              discountAmount: String(orderDiscount),
              confirm: true,
              markPaid,
              items,
            },
            app,
          );
          const when = at(offset, randInt(8, 21));
          const code = offset < 0 ? codeFor('DH', offset) : undefined;
          await db
            .update(salesOrders)
            .set({
              createdAt: when,
              updatedAt: when,
              confirmedAt: when,
              ...(markPaid ? { paidAt: when } : {}),
              ...(code ? { code } : {}),
            })
            .where(eq(salesOrders.id, order.id));
          await backdateMovements(order.id, when, code);
          sold += 1;
          // ~3% đơn bị huỷ sau khi chốt (khách trả hàng) → cộng lại tồn
          if (chance(0.03)) {
            const detail = await call<{ version: number }>(
              manager,
              'GET',
              `/sales-orders/${order.id}`,
            );
            await call(manager, 'POST', `/sales-orders/${order.id}/cancel`, {
              version: detail.version,
              reason: 'Khách đổi ý, trả lại hàng',
            });
            const later = new Date(when.getTime() + 30 * 60_000);
            await db
              .update(salesOrders)
              .set({ cancelledAt: later })
              .where(eq(salesOrders.id, order.id));
            await db
              .update(inventoryMovements)
              .set({ createdAt: later })
              .where(
                sql`${inventoryMovements.refId} = ${order.id} and ${inventoryMovements.type} = 'SALE_CANCEL_IN'`,
              );
            cancelled += 1;
          }
        } catch (error) {
          if ((error as ApiError).key === 'sales.insufficientStock') shortages += 1;
          else throw error;
        }
      }

      if (offset === -40) {
        await adjust(offset, {
          reason: 'DAMAGED',
          note: 'Vỡ / móp khi vận chuyển',
          items: [
            { productId: live.find((p) => p.sku === 'GV-001')!.id, quantityChange: '-2' },
            { productId: live.find((p) => p.sku === 'DU-002')!.id, quantityChange: '-3' },
          ],
        });
      }
      if (offset === -20) {
        await adjust(offset, {
          reason: 'LOST',
          note: 'Thất thoát cuối tháng',
          items: [{ productId: live.find((p) => p.sku === 'BK-002')!.id, quantityChange: '-4' }],
        });
      }
      if (offset === -7) {
        // Kiểm kê: số đếm lệch nhẹ so với sổ sách
        const sample = live.filter((p) => ['VP-001', 'VP-002', 'GD-004', 'BK-005'].includes(p.sku));
        const balances = await call<{ productId: string; quantity: string }[]>(
          manager,
          'GET',
          '/inventory?pageSize=100',
        );
        const items = sample
          .map((p) => {
            const current = Number(balances.find((b) => b.productId === p.id)?.quantity ?? 0);
            return {
              productId: p.id,
              countedQuantity: String(Math.max(0, current + randInt(-3, 2))),
            };
          })
          .filter(
            (i, k) =>
              Number(i.countedQuantity) !==
              Number(balances.find((b) => b.productId === sample[k]!.id)?.quantity),
          );
        if (items.length)
          await adjust(offset, { reason: 'STOCKTAKE', note: 'Kiểm kê định kỳ', items });
      }
    }

    // ----- Chứng từ dở dang hôm nay để test thao tác -----
    await purchase(
      0,
      bySupplier(1)
        .filter((p) => !p.noRestock)
        .slice(0, 3),
      () => 24,
      false,
    );
    const cancelDraft = await purchase(0, bySupplier(3), () => 50, false);
    await call(manager, 'POST', `/purchases/${cancelDraft.id}/cancel`, {
      version: cancelDraft.version,
      reason: 'Đặt nhầm số lượng',
    });
    for (const token of cashiers) {
      await call(
        token,
        'POST',
        '/sales-orders',
        {
          clientRequestId: crypto.randomUUID(),
          customerName: 'Khách đặt trước',
          customerPhone: '0909000111',
          paymentMethod: 'BANK_TRANSFER',
          items: [{ productId: live.find((p) => p.sku === 'DU-007')!.id, quantity: '2' }],
        },
        'user',
      );
    }

    // Quản lý nâng tồn tối thiểu của vài mặt hàng → có sản phẩm "sắp hết" để test cảnh báo
    const stock = await call<{ productId: string; quantity: string }[]>(
      manager,
      'GET',
      '/inventory?pageSize=100',
    );
    for (const sku of ['DU-007', 'GV-005', 'GD-003']) {
      const product = live.find((p) => p.sku === sku)!;
      const quantity = Math.floor(
        Number(stock.find((s) => s.productId === product.id)?.quantity ?? 0),
      );
      if (quantity > 0) {
        await call(manager, 'PATCH', `/products/${product.id}`, { minStock: String(quantity + 3) });
      }
    }

    await db.execute(sql`
      update inventory_balances b set last_movement_at = m.last
      from (select product_id, max(created_at) as last from inventory_movements group by product_id) m
      where m.product_id = b.product_id`);

    console.log(
      `Nhập ${receipts} phiếu, bán ${sold} đơn (${cancelled} đơn huỷ, ${shortages} lần hết hàng bị từ chối), ${adjustments} phiếu điều chỉnh, 2 đơn nháp hôm nay`,
    );
    console.log(
      `Đăng nhập admin: manager@example.com / ${DEMO_PASSWORD} · app user (bán tại quầy): staff@example.com / ${DEMO_PASSWORD}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
