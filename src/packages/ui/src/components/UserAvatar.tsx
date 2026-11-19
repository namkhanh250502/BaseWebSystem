import type { UserDto } from '@base/shared';
import { Avatar, Typography } from 'antd';
import { colorFromString, displayName } from '../utils';

type AvatarUser = Pick<UserDto, 'email' | 'firstName' | 'lastName' | 'avatarUrl'>;

/** Ảnh đại diện; chưa có ảnh thì hiện chữ cái đầu với màu theo email */
export function UserAvatar({ user, size = 32 }: { user: AvatarUser; size?: number }) {
  const name = displayName(user);
  if (user.avatarUrl) return <Avatar src={user.avatarUrl} size={size} alt={name} />;
  return (
    <Avatar size={size} style={{ backgroundColor: colorFromString(user.email), flexShrink: 0 }}>
      {name.charAt(0).toUpperCase()}
    </Avatar>
  );
}

/** Avatar + tên + email, dùng trong bảng */
export function UserCell({ user, size = 36 }: { user: AvatarUser; size?: number }) {
  return (
    <div className="b-user-cell">
      <UserAvatar user={user} size={size} />
      <div className="b-user-cell__text">
        <Typography.Text strong ellipsis>
          {displayName(user)}
        </Typography.Text>
        <Typography.Text type="secondary" ellipsis className="b-user-cell__email">
          {user.email}
        </Typography.Text>
      </div>
    </div>
  );
}
