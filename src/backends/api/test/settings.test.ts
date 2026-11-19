import { SETTING_DEFINITIONS } from '@base/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './helpers/app';

/** GET /settings trả đủ metadata để frontend tự sinh form; PUT kiểm tra theo kiểu */
describe('Settings: danh sách động & kiểm tra giá trị', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  const findItem = async (name: string, locale: 'vi' | 'en' = 'vi') =>
    (await t.settings.list(locale)).flatMap((g) => g.items).find((i) => i.name === name)!;

  it('trả mọi key đã khai báo theo nhóm, có nhãn/mô tả đã dịch theo ngôn ngữ', async () => {
    const vi = await t.settings.list('vi');
    const en = await t.settings.list('en');
    expect(vi.flatMap((g) => g.items.map((i) => i.name)).sort()).toEqual(
      SETTING_DEFINITIONS.map((d) => d.name).sort(),
    );
    const viGeneral = vi.find((g) => g.name === 'general')!;
    const enGeneral = en.find((g) => g.name === 'general')!;
    expect(viGeneral.title).toBe('Chung');
    expect(enGeneral.title).toBe('General');
    expect(viGeneral.items.find((i) => i.name === 'site_name')!.label).toBe('Tên hệ thống');
    expect(enGeneral.items.find((i) => i.name === 'site_name')!.label).toBe('System name');
  });

  it('nhóm có gợi ý trả kèm các dòng code (redirect URI Google)', async () => {
    const google = (await t.settings.list('vi')).find((g) => g.name === 'google')!;
    expect(google.hint?.text).toBeTruthy();
    expect(google.hint?.code.every((c) => c.endsWith('/api/v1/auth/google/callback'))).toBe(true);
    expect((await t.settings.list('vi')).find((g) => g.name === 'mail')!.hint).toBeNull();
  });

  it('nhóm Sendify đứng trước SMTP và có gợi ý cơ chế ưu tiên', async () => {
    const groups = await t.settings.list('vi');
    const names = groups.map((g) => g.name);
    expect(names.indexOf('sendify')).toBeLessThan(names.indexOf('mail'));
    const sendify = groups.find((g) => g.name === 'sendify')!;
    expect(sendify.hint?.text).toBeTruthy();
    expect(sendify.hint?.code).toEqual([]);
  });

  it('key bí mật không trả giá trị', async () => {
    const secret = await findItem('smtp_password');
    expect(secret.isSecret).toBe(true);
    expect(secret.value).toBeNull();
  });

  it('select lấy lựa chọn từ DB (roles) và từ chối giá trị ngoài danh sách', async () => {
    const item = await findItem('default_role');
    expect(item.type).toBe('select');
    expect(item.options?.map((o) => o.value)).toContain('User');
    await expect(t.settings.update({ default_role: 'KhongTonTai' })).rejects.toMatchObject({
      key: 'settings.invalidValue',
    });
  });

  it('multiselect có nhãn dịch, chuẩn hoá thứ tự và từ chối giá trị lạ', async () => {
    const item = await findItem('two_factor_methods', 'en');
    expect(item.type).toBe('multiselect');
    expect(item.options).toEqual([
      { value: 'totp', label: 'Authenticator app' },
      { value: 'email', label: 'Email' },
      { value: 'passkey', label: 'Passkey' },
    ]);
    try {
      await t.settings.update({ two_factor_methods: 'passkey, totp,totp' });
      expect(await t.settings.getString('two_factor_methods')).toBe('totp,passkey');
      await expect(t.settings.update({ two_factor_methods: 'totp,sms' })).rejects.toMatchObject({
        key: 'settings.invalidValue',
      });
    } finally {
      await t.settings.update({ two_factor_methods: 'totp,email,passkey' });
    }
  });
});
