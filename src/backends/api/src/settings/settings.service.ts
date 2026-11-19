import { Injectable } from '@nestjs/common';
import { asc, inArray, roles, settings, sql } from '@base/db';
import {
  APPS,
  DEFAULT_LOCALE,
  getSettingDefinition,
  SETTING_DEFINITIONS,
  SETTING_GROUPS,
  type ImportSettingsResult,
  type Locale,
  type PublicSettings,
  type SettingDefinition,
  type SettingGroup,
  type SettingGroupDto,
  type SettingHintDto,
  type SettingItemDto,
  type SettingName,
  type SettingsExportFile,
} from '@base/shared';
import { badRequest } from '@base/server-kit';
import { googleRedirectUri } from '../config/app-urls';
import { InjectDb, type Database } from '../core/database';
import { t } from '../i18n';

/** Cache toàn bộ settings trong bộ nhớ, tự làm mới sau 30 giây hoặc khi có thay đổi */
const CACHE_TTL_MS = 30 * 1000;

const DEFINITIONS = SETTING_DEFINITIONS as readonly SettingDefinition[];

/**
 * Các dòng code hiển thị dưới gợi ý của nhóm (chữ gợi ý ở i18n `settings.groups.<group>.hint`).
 * Nhóm không có gợi ý thì không cần khai báo.
 */
const GROUP_HINT_CODE: Partial<Record<SettingGroup, () => string[]>> = {
  google: () => APPS.map((app) => googleRedirectUri(app)),
};

/** Giá trị hợp lệ của từng key select / multiselect */
type OptionValues = Map<string, readonly string[]>;

/** Bản dịch nếu có, không thì dùng giá trị dự phòng (thêm key mà quên dịch vẫn hiển thị được) */
function translate(locale: Locale, key: string, fallback: string): string {
  return t.has(key) ? t(locale, key) : fallback;
}

/** Chuẩn hoá + kiểm tra giá trị theo kiểu của key; trả về chuỗi lưu DB */
function normalizeValue(def: SettingDefinition, raw: string | null, options: OptionValues): string {
  const value = (raw ?? '').trim();
  if (value === '') return '';
  const invalid = () => badRequest('settings.invalidValue', { name: def.name });
  switch (def.type) {
    case 'boolean':
      if (value !== 'true' && value !== 'false') throw invalid();
      return value;
    case 'number':
      if (!Number.isFinite(Number(value))) throw invalid();
      return String(Number(value));
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw invalid();
      return value;
    case 'url':
      if (!URL.canParse(value)) throw invalid();
      return value;
    case 'select':
      if (!(options.get(def.name) ?? []).includes(value)) throw invalid();
      return value;
    case 'multiselect': {
      const allowed = options.get(def.name) ?? [];
      const picked = new Set(
        value
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      );
      if ([...picked].some((v) => !allowed.includes(v))) throw invalid();
      // Lưu theo thứ tự của danh sách lựa chọn để giá trị ổn định
      return allowed.filter((v) => picked.has(v)).join(',');
    }
    default:
      return raw ?? '';
  }
}

@Injectable()
export class SettingsService {
  private cache?: { values: Map<string, string | null>; loadedAt: number };

  constructor(@InjectDb() private readonly db: Database) {}

  private async loadValues(): Promise<Map<string, string | null>> {
    if (this.cache && Date.now() - this.cache.loadedAt < CACHE_TTL_MS) return this.cache.values;
    const rows = await this.db.select({ name: settings.name, value: settings.value }).from(settings);
    const values = new Map(rows.map((r) => [r.name, r.value]));
    this.cache = { values, loadedAt: Date.now() };
    return values;
  }

  private invalidate() {
    this.cache = undefined;
  }

  private async upsertMany(entries: { name: string; value: string }[]) {
    if (!entries.length) return;
    await this.db
      .insert(settings)
      .values(entries)
      .onConflictDoUpdate({
        target: settings.name,
        set: { value: sql`excluded.value`, updatedAt: new Date() },
      });
  }

  /** Giá trị hợp lệ của các key select / multiselect (nguồn động chỉ nạp khi cần) */
  private async loadOptionValues(defs: readonly SettingDefinition[]): Promise<OptionValues> {
    const result: OptionValues = new Map();
    let roleNames: string[] | undefined;
    for (const def of defs) {
      if (def.optionsSource === 'roles') {
        roleNames ??= (
          await this.db.select({ name: roles.name }).from(roles).orderBy(asc(roles.name))
        ).map((r) => r.name);
        result.set(def.name, roleNames);
      } else if (def.options) {
        result.set(def.name, def.options);
      }
    }
    return result;
  }

  private groupHint(group: SettingGroup, locale: Locale): SettingHintDto | null {
    const key = `settings.groups.${group}.hint`;
    const code = GROUP_HINT_CODE[group]?.() ?? [];
    if (!t.has(key) && !code.length) return null;
    return { text: translate(locale, key, ''), code };
  }

  /** Giá trị dạng chuỗi; chưa có trong DB thì lấy giá trị mặc định */
  async getString(name: SettingName): Promise<string> {
    const value = (await this.loadValues()).get(name);
    return value ?? getSettingDefinition(name)?.defaultValue ?? '';
  }

  async getBoolean(name: SettingName): Promise<boolean> {
    return (await this.getString(name)).trim().toLowerCase() === 'true';
  }

  async getNumber(name: SettingName): Promise<number> {
    const value = Number(await this.getString(name));
    return Number.isFinite(value) ? value : Number(getSettingDefinition(name)?.defaultValue ?? 0);
  }

  async getPublic(): Promise<PublicSettings> {
    return {
      site_name: await this.getString('site_name'),
      allow_registration: await this.getBoolean('allow_registration'),
      require_email_verification: await this.getBoolean('require_email_verification'),
      turnstile_site_key: await this.getString('turnstile_site_key'),
      google_login_enabled: Boolean(
        (await this.getString('google_client_id')) && (await this.getString('google_client_secret')),
      ),
    };
  }

  /**
   * Toàn bộ key hệ thống theo nhóm, kèm nhãn / mô tả / lựa chọn đã dịch và giá trị hiện tại
   * (key bí mật không trả giá trị). Frontend sinh form hoàn toàn từ dữ liệu này.
   */
  async list(locale: Locale = DEFAULT_LOCALE): Promise<SettingGroupDto[]> {
    const rows = await this.db
      .select()
      .from(settings)
      .where(
        inArray(
          settings.name,
          DEFINITIONS.map((d) => d.name),
        ),
      );
    const byName = new Map(rows.map((r) => [r.name, r]));
    const optionValues = await this.loadOptionValues(DEFINITIONS);

    const toItem = (d: SettingDefinition): SettingItemDto => {
      const row = byName.get(d.name);
      const keyPrefix = `settings.keys.${d.name}`;
      const values = optionValues.get(d.name);
      return {
        name: d.name,
        group: d.group,
        type: d.type,
        label: translate(locale, `${keyPrefix}.label`, d.name),
        description: translate(locale, `${keyPrefix}.description`, ''),
        placeholder: d.example ?? null,
        defaultValue: d.defaultValue,
        isSecret: Boolean(d.isSecret),
        isPublic: Boolean(d.isPublic),
        options: values
          ? values.map((value) => ({
              value,
              label: translate(locale, `${keyPrefix}.options.${value}`, value),
            }))
          : null,
        value: d.isSecret ? null : (row?.value ?? d.defaultValue),
        configured: Boolean(row?.value),
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    };

    return SETTING_GROUPS.map((group) => ({
      name: group,
      title: translate(locale, `settings.groups.${group}.title`, group),
      description: translate(locale, `settings.groups.${group}.description`, ''),
      hint: this.groupHint(group, locale),
      items: DEFINITIONS.filter((d) => d.group === group).map(toItem),
    })).filter((g) => g.items.length > 0);
  }

  /** Lưu các key được gửi lên (key không phải key hệ thống thì báo lỗi) */
  async update(
    values: Record<string, string | null>,
    locale: Locale = DEFAULT_LOCALE,
  ): Promise<SettingGroupDto[]> {
    const defs = Object.keys(values).map((name) => {
      const def = getSettingDefinition(name);
      if (!def) throw badRequest('settings.unknownKey', { name });
      return def;
    });
    const optionValues = await this.loadOptionValues(defs);
    const entries = defs.map((def) => ({
      name: def.name,
      value: normalizeValue(def, values[def.name] ?? null, optionValues),
    }));
    await this.upsertMany(entries);
    this.invalidate();
    return this.list(locale);
  }

  async exportAll(includeSecrets: boolean): Promise<SettingsExportFile> {
    const values = await this.loadValues();
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      includeSecrets,
      settings: DEFINITIONS.filter((d) => includeSecrets || !d.isSecret).map((d) => ({
        name: d.name,
        value: values.get(d.name) ?? d.defaultValue,
      })),
    };
  }

  /** Import hàng loạt: chỉ nhận key hệ thống, giá trị sai kiểu thì báo lỗi cả file */
  async importMany(
    items: { name: string; value: string | null }[],
    overwrite: boolean,
  ): Promise<ImportSettingsResult> {
    // Key trùng trong file: lấy giá trị cuối cùng
    const unique = [...new Map(items.map((i) => [i.name, i])).values()];
    const unknown = unique.filter((i) => !getSettingDefinition(i.name)).map((i) => i.name);
    const knownItems = unique.flatMap((i) => {
      const def = getSettingDefinition(i.name);
      return def ? [{ def, value: i.value }] : [];
    });
    const optionValues = await this.loadOptionValues(knownItems.map((i) => i.def));
    const known = knownItems.map((i) => ({
      name: i.def.name,
      value: normalizeValue(i.def, i.value, optionValues),
    }));

    this.invalidate();
    const current = await this.loadValues();
    const summary: ImportSettingsResult = { created: 0, updated: 0, skipped: 0, unknown };
    const toWrite: { name: string; value: string }[] = [];
    for (const item of known) {
      const existing = current.get(item.name);
      if (existing === undefined || existing === null || existing === '') {
        if (item.value === '' && existing !== undefined) summary.skipped++;
        else {
          toWrite.push(item);
          summary.created++;
        }
      } else if (overwrite && existing !== item.value) {
        toWrite.push(item);
        summary.updated++;
      } else {
        summary.skipped++;
      }
    }
    await this.upsertMany(toWrite);
    this.invalidate();
    return summary;
  }
}
