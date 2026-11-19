import { CheckOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons';
import { Alert, Button, Input, Select, Tooltip, Typography } from 'antd';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface EditableFieldProps {
  /** Giá trị gốc (chuỗi) dùng làm nội dung ô khi bấm sửa */
  value?: string | null;
  /** Cách hiển thị khi có giá trị (mặc định in nguyên chuỗi) */
  display?: ReactNode;
  editable: boolean;
  /** Có options → sửa bằng Select thay vì ô nhập */
  options?: { value: string; label: ReactNode }[];
  placeholder?: string;
  maxLength?: number;
  /** Gợi ý nhỏ hiện dưới ô khi đang sửa */
  hint?: string;
  /** Cảnh báo nổi bật hiện phía trên ô khi đang sửa (trường nhạy cảm) */
  warning?: ReactNode;
  /** Trả về thông báo lỗi nếu giá trị không hợp lệ, null nếu hợp lệ */
  validate?: (value: string) => string | null;
  /** Ném lỗi nếu lưu thất bại → giữ nguyên chế độ sửa */
  onSave: (value: string) => Promise<void>;
}

/**
 * Ô xem/sửa 1 trường tại chỗ: hiện giá trị + nút bút chì; bấm vào thành ô nhập
 * kèm nút Lưu/Hủy. Enter để lưu, Esc để hủy.
 */
export function EditableField({
  value,
  display,
  editable,
  options,
  placeholder,
  maxLength,
  hint,
  warning,
  validate,
  onSave,
}: EditableFieldProps) {
  const { t } = useTranslation(['users', 'common']);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(value ?? '');
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = async (raw = draft) => {
    const next = raw.trim();
    if (next === (value ?? '').trim()) {
      cancel();
      return;
    }
    const message = validate?.(next) ?? null;
    if (message) {
      setError(message);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      // Thông báo lỗi do nơi gọi hiển thị; giữ ô sửa để người dùng chỉnh tiếp
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation(); // không để Esc đóng luôn modal
      cancel();
    } else if (e.key === 'Enter' && !options) {
      e.preventDefault();
      void save();
    }
  };

  if (editing) {
    const onChange = (next: string) => {
      setDraft(next);
      setError(null);
    };
    return (
      <div>
        {warning && <Alert className="admin-editable__warning" type="warning" showIcon title={warning} />}
        <div className="admin-editable__row">
          {options ? (
            <Select
              autoFocus
              defaultOpen
              className="admin-editable__input"
              value={draft}
              options={options}
              status={error ? 'error' : undefined}
              onChange={onChange}
              onKeyDown={handleKeyDown}
            />
          ) : (
            <Input
              autoFocus
              className="admin-editable__input"
              value={draft}
              placeholder={placeholder}
              maxLength={maxLength}
              status={error ? 'error' : undefined}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          )}
          <Tooltip title={t('common:save')}>
            <Button type="primary" icon={<CheckOutlined />} loading={saving} onClick={() => void save()} />
          </Tooltip>
          <Tooltip title={t('common:cancel')}>
            <Button icon={<CloseOutlined />} disabled={saving} onClick={cancel} />
          </Tooltip>
        </div>
        {error ? (
          <div className="admin-editable__error">{error}</div>
        ) : (
          hint && <div className="admin-editable__hint">{hint}</div>
        )}
      </div>
    );
  }

  const isEmpty = value === null || value === undefined || value === '';

  return (
    <div className="admin-editable">
      <div className="admin-editable__value">
        {isEmpty ? <Typography.Text type="secondary">—</Typography.Text> : (display ?? value)}
      </div>
      {editable && (
        <Tooltip title={t('info.edit')}>
          <Button
            type="text"
            size="small"
            className="admin-editable__pen"
            icon={<EditOutlined />}
            aria-label={t('info.edit')}
            onClick={startEdit}
          />
        </Tooltip>
      )}
    </div>
  );
}
