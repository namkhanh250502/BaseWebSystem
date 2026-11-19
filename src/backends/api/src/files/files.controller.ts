import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { notFound } from '@base/server-kit';
import { Public } from '../decorators/customize';
import { avatarDir } from './avatar-storage';

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

@Controller('files')
export class FilesController {
  /** Phục vụ ảnh avatar. Tên file là UUID ngẫu nhiên nên có thể cache lâu dài. */
  @Public()
  @Get('avatars/:name')
  async avatar(@Param('name') rawName: string, @Res() res: Response) {
    const name = path.basename(rawName);
    const type = CONTENT_TYPES[path.extname(name).toLowerCase()];
    if (!type || !/^[0-9a-f-]{36}\.\w+$/i.test(name)) throw notFound();
    let data: Buffer;
    try {
      data = await readFile(path.join(avatarDir(), name));
    } catch {
      throw notFound();
    }
    res
      .set({
        'Content-Type': type,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(data);
  }
}
