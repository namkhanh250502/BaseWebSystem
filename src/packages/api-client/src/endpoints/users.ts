import type {
  CreateUserInput,
  ListLoginHistoryQuery,
  ListUsersQuery,
  LoginHistoryDto,
  ResetUserPasswordResult,
  UpdateUserInput,
  UserAnalyticsDto,
  UserAnalyticsQuery,
  UserDto,
} from '@base/shared';
import { toPaginated, type HttpClient } from '../http';

export function createUsersApi(http: HttpClient) {
  return {
    list: async (query: ListUsersQuery = {}) =>
      toPaginated(await http.get<UserDto[]>('/users', { query })),
    get: async (id: string) => (await http.get<UserDto>(`/users/${id}`)).data,
    create: async (input: CreateUserInput) => (await http.post<UserDto>('/users', input)).data,
    update: async (id: string, input: UpdateUserInput) =>
      (await http.patch<UserDto>(`/users/${id}`, input)).data,
    resetPassword: async (id: string) =>
      (await http.post<ResetUserPasswordResult>(`/users/${id}/reset-password`)).data,
    disableTwoFactor: async (id: string) =>
      (await http.post<UserDto>(`/users/${id}/disable-2fa`)).data,
    analytics: async (query: UserAnalyticsQuery) =>
      (await http.get<UserAnalyticsDto>('/users/analytics', { query })).data,
    loginHistory: async (id: string, query: ListLoginHistoryQuery = {}) =>
      toPaginated(await http.get<LoginHistoryDto[]>(`/users/${id}/login-history`, { query })),
  };
}
