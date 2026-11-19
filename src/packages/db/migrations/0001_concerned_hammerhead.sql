CREATE TYPE "public"."adjustment_reason" AS ENUM('DAMAGED', 'LOST', 'STOCKTAKE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('DRAFT', 'CONFIRMED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."image_status" AS ENUM('PENDING', 'READY', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."movement_ref_type" AS ENUM('PURCHASE_RECEIPT', 'SALES_ORDER', 'INVENTORY_ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."movement_type" AS ENUM('PURCHASE_IN', 'SALE_OUT', 'SALE_CANCEL_IN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'BANK_TRANSFER', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('UNPAID', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(150) NOT NULL,
	"description" text,
	"status" "record_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_sequences" (
	"prefix" varchar(8) NOT NULL,
	"seq_date" date NOT NULL,
	"last_value" integer NOT NULL,
	CONSTRAINT "document_sequences_prefix_seq_date_pk" PRIMARY KEY("prefix","seq_date")
);
--> statement-breakpoint
CREATE TABLE "inventory_adjustment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adjustment_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity_before" numeric(14, 3) NOT NULL,
	"quantity_change" numeric(14, 3) NOT NULL,
	"quantity_after" numeric(14, 3) NOT NULL,
	"counted_quantity" numeric(14, 3),
	"unit_cost" numeric(18, 4) NOT NULL,
	CONSTRAINT "inventory_adjustment_items_change_check" CHECK ("inventory_adjustment_items"."quantity_change" <> 0 and "inventory_adjustment_items"."quantity_after" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"client_request_id" uuid,
	"reason" "adjustment_reason" NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_adjustments_code_unique" UNIQUE("code"),
	CONSTRAINT "inventory_adjustments_clientRequestId_unique" UNIQUE("client_request_id"),
	CONSTRAINT "inventory_adjustments_note_check" CHECK ("inventory_adjustments"."reason" <> 'OTHER' or "inventory_adjustments"."note" is not null)
);
--> statement-breakpoint
CREATE TABLE "inventory_balances" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"quantity" numeric(14, 3) DEFAULT '0' NOT NULL,
	"avg_cost" numeric(18, 4) DEFAULT '0' NOT NULL,
	"last_movement_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_balances_quantity_check" CHECK ("inventory_balances"."quantity" >= 0),
	CONSTRAINT "inventory_balances_avg_cost_check" CHECK ("inventory_balances"."avg_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"type" "movement_type" NOT NULL,
	"quantity_change" numeric(14, 3) NOT NULL,
	"quantity_before" numeric(14, 3) NOT NULL,
	"quantity_after" numeric(14, 3) NOT NULL,
	"unit_cost" numeric(18, 4) NOT NULL,
	"avg_cost_after" numeric(18, 4) NOT NULL,
	"ref_type" "movement_ref_type" NOT NULL,
	"ref_id" uuid NOT NULL,
	"ref_code" varchar(32) NOT NULL,
	"ref_item_id" uuid,
	"reason" "adjustment_reason",
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movements_change_check" CHECK ("inventory_movements"."quantity_change" <> 0),
	CONSTRAINT "inventory_movements_after_check" CHECK ("inventory_movements"."quantity_after" = "inventory_movements"."quantity_before" + "inventory_movements"."quantity_change" and "inventory_movements"."quantity_after" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"object_key" varchar(255) NOT NULL,
	"mime_type" varchar(50) NOT NULL,
	"size_bytes" integer NOT NULL,
	"original_name" varchar(255),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" "image_status" DEFAULT 'PENDING' NOT NULL,
	"upload_expires_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_images_objectKey_unique" UNIQUE("object_key"),
	CONSTRAINT "product_images_size_check" CHECK ("product_images"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category_id" uuid NOT NULL,
	"unit" varchar(30) NOT NULL,
	"allow_decimal_quantity" boolean DEFAULT false NOT NULL,
	"purchase_price" numeric(18, 2) DEFAULT '0' NOT NULL,
	"selling_price" numeric(18, 2) NOT NULL,
	"min_stock" numeric(14, 3) DEFAULT '0' NOT NULL,
	"status" "product_status" DEFAULT 'ACTIVE' NOT NULL,
	"has_transactions" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_purchase_price_check" CHECK ("products"."purchase_price" >= 0),
	CONSTRAINT "products_selling_price_check" CHECK ("products"."selling_price" >= 0),
	CONSTRAINT "products_min_stock_check" CHECK ("products"."min_stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"discount_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"line_amount" numeric(18, 2) NOT NULL,
	"unit_cost" numeric(18, 4),
	CONSTRAINT "purchase_receipt_items_quantity_check" CHECK ("purchase_receipt_items"."quantity" > 0),
	CONSTRAINT "purchase_receipt_items_amounts_check" CHECK ("purchase_receipt_items"."unit_price" >= 0 and "purchase_receipt_items"."discount_amount" >= 0 and "purchase_receipt_items"."line_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"supplier_id" uuid NOT NULL,
	"receipt_date" date NOT NULL,
	"status" "document_status" DEFAULT 'DRAFT' NOT NULL,
	"subtotal" numeric(18, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"cancel_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"confirmed_by" uuid,
	"cancelled_by" uuid,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_receipts_code_unique" UNIQUE("code"),
	CONSTRAINT "purchase_receipts_amounts_check" CHECK ("purchase_receipts"."discount_amount" >= 0 and "purchase_receipts"."discount_amount" <= "purchase_receipts"."subtotal" and "purchase_receipts"."total_amount" >= 0),
	CONSTRAINT "purchase_receipts_confirmed_check" CHECK ("purchase_receipts"."status" <> 'CONFIRMED' or "purchase_receipts"."confirmed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "sales_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"sku_snapshot" varchar(64) NOT NULL,
	"name_snapshot" varchar(255) NOT NULL,
	"unit_snapshot" varchar(30) NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"list_price" numeric(18, 2) NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"discount_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"line_amount" numeric(18, 2) NOT NULL,
	"allocated_order_discount" numeric(18, 2),
	"net_amount" numeric(18, 2),
	"unit_cost" numeric(18, 4),
	"cost_amount" numeric(18, 2),
	CONSTRAINT "sales_order_items_quantity_check" CHECK ("sales_order_items"."quantity" > 0),
	CONSTRAINT "sales_order_items_amounts_check" CHECK ("sales_order_items"."unit_price" >= 0 and "sales_order_items"."discount_amount" >= 0 and "sales_order_items"."line_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"client_request_id" uuid,
	"order_date" date NOT NULL,
	"customer_name" varchar(150),
	"customer_phone" varchar(30),
	"status" "document_status" DEFAULT 'DRAFT' NOT NULL,
	"payment_method" "payment_method" DEFAULT 'CASH' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'UNPAID' NOT NULL,
	"paid_at" timestamp with time zone,
	"subtotal" numeric(18, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_cost" numeric(18, 2),
	"notes" text,
	"cancel_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"confirmed_by" uuid,
	"cancelled_by" uuid,
	"paid_by" uuid,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_orders_code_unique" UNIQUE("code"),
	CONSTRAINT "sales_orders_clientRequestId_unique" UNIQUE("client_request_id"),
	CONSTRAINT "sales_orders_amounts_check" CHECK ("sales_orders"."discount_amount" >= 0 and "sales_orders"."discount_amount" <= "sales_orders"."subtotal" and "sales_orders"."total_amount" >= 0),
	CONSTRAINT "sales_orders_paid_check" CHECK ("sales_orders"."payment_status" = 'UNPAID' or "sales_orders"."paid_at" is not null),
	CONSTRAINT "sales_orders_confirmed_check" CHECK ("sales_orders"."status" <> 'CONFIRMED' or "sales_orders"."confirmed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"contact_person" varchar(150),
	"phone" varchar(30),
	"email" varchar(255),
	"address" text,
	"notes" text,
	"status" "record_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_adjustment_items" ADD CONSTRAINT "inventory_adjustment_items_adjustment_id_inventory_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."inventory_adjustments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustment_items" ADD CONSTRAINT "inventory_adjustment_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_receipt_id_purchase_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."purchase_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_lower_unique" ON "categories" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "inventory_adjustment_items_adjustment_id_index" ON "inventory_adjustment_items" USING btree ("adjustment_id");--> statement-breakpoint
CREATE INDEX "inventory_adjustment_items_product_id_index" ON "inventory_adjustment_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "inventory_adjustments_created_at_index" ON "inventory_adjustments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inventory_movements_product_id_created_at_index" ON "inventory_movements" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "inventory_movements_ref_type_ref_id_index" ON "inventory_movements" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_type_created_at_index" ON "inventory_movements" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "inventory_movements_created_at_index" ON "inventory_movements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "product_images_product_id_sort_order_index" ON "product_images" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE INDEX "product_images_status_upload_expires_at_index" ON "product_images" USING btree ("status","upload_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_primary_unique" ON "product_images" USING btree ("product_id") WHERE "product_images"."is_primary" and "product_images"."status" = 'READY';--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_lower_unique" ON "products" USING btree (lower("sku"));--> statement-breakpoint
CREATE INDEX "products_name_lower_idx" ON "products" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "products_category_id_index" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_status_index" ON "products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "purchase_receipt_items_receipt_id_index" ON "purchase_receipt_items" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "purchase_receipt_items_product_id_index" ON "purchase_receipt_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "purchase_receipts_supplier_id_receipt_date_index" ON "purchase_receipts" USING btree ("supplier_id","receipt_date");--> statement-breakpoint
CREATE INDEX "purchase_receipts_status_confirmed_at_index" ON "purchase_receipts" USING btree ("status","confirmed_at");--> statement-breakpoint
CREATE INDEX "sales_order_items_order_id_index" ON "sales_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "sales_order_items_product_id_index" ON "sales_order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sales_orders_status_confirmed_at_index" ON "sales_orders" USING btree ("status","confirmed_at");--> statement-breakpoint
CREATE INDEX "sales_orders_created_by_created_at_index" ON "sales_orders" USING btree ("created_by","created_at");--> statement-breakpoint
CREATE INDEX "sales_orders_payment_status_index" ON "sales_orders" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "sales_orders_customer_phone_index" ON "sales_orders" USING btree ("customer_phone");--> statement-breakpoint
CREATE INDEX "suppliers_name_lower_idx" ON "suppliers" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "suppliers_phone_index" ON "suppliers" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "suppliers_email_lower_idx" ON "suppliers" USING btree (lower("email"));