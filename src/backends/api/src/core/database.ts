import { Inject } from '@nestjs/common';
import type { createDb, Database } from '@base/db';

/** Token DI của instance Drizzle: `constructor(@InjectDb() private readonly db: Database)` */
export const DB = Symbol('DB');
/** Token DI của kết nối (db + pool), dùng để đóng pool khi tắt ứng dụng */
export const DB_CONNECTION = Symbol('DB_CONNECTION');

export const InjectDb = () => Inject(DB);

export type DbConnection = ReturnType<typeof createDb>;

/** Kiểu transaction của drizzle, dùng cho hàm nhận db hoặc tx */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DbOrTx = Database | Tx;

export type { Database };
