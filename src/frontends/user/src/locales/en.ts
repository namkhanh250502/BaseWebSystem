import type { vi } from './vi';

type Catalog<T> = { [K in keyof T]: T[K] extends string ? string : Catalog<T[K]> };

export const en: Catalog<typeof vi> = {
  menu: {
    home: 'Home',
    notifications: 'Notifications',
    profile: 'Account',
  },
  home: {
    welcome: 'Hello, {{name}}',
    subtitle: 'Have a productive day.',
    profileCard: 'Complete your profile',
    profileCardDescription: 'Add your name and a photo so people can recognise you.',
    securityCard: 'Protect your account',
    securityCardOn: 'Two-factor authentication is on. Your account is well protected.',
    securityCardOff: 'Turn on two-factor authentication to secure your account.',
    notificationsCard: 'Unread notifications',
    open: 'Open',
  },
};
