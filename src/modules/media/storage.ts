import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { AppConfig } from '../../config/config.service.js';

export interface StorageDriver {
  readonly kind: 'S3' | 'LOCAL';
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
  publicUrl(key: string): string;
}

/** S3-compatible object storage (AWS S3, Cloudflare R2, MinIO…). */
class S3Driver implements StorageDriver {
  readonly kind = 'S3' as const;
  private readonly client: S3Client;
  constructor(private readonly config: AppConfig) {
    this.client = new S3Client({
      region: config.get('S3_REGION'),
      endpoint: config.get('S3_ENDPOINT') || undefined,
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE'),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY_ID'),
        secretAccessKey: config.get('S3_SECRET_ACCESS_KEY'),
      },
    });
  }
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.get('S3_BUCKET'),
        Key: key,
        Body: body,
        ContentType: contentType,
        // Keys are content-unique, so objects never change.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }
  async remove(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.get('S3_BUCKET'), Key: key }),
    );
  }
  publicUrl(key: string) {
    return `${this.config.get('MEDIA_PUBLIC_BASE_URL').replace(/\/$/, '')}/${key}`;
  }
}

/** Development only (refused by env validation in production). */
class LocalDriver implements StorageDriver {
  readonly kind = 'LOCAL' as const;
  private readonly root: string;
  constructor(private readonly config: AppConfig) {
    this.root = resolve(config.get('LOCAL_MEDIA_DIR'));
  }
  private path(key: string) {
    const target = resolve(join(this.root, key));
    if (!target.startsWith(this.root)) throw new Error('Invalid media key');
    return target;
  }
  async put(key: string, body: Buffer) {
    const target = this.path(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  }
  async remove(key: string) {
    await rm(this.path(key), { force: true });
  }
  publicUrl(key: string) {
    return `${this.config.get('MEDIA_PUBLIC_BASE_URL').replace(/\/$/, '')}/${key}`;
  }
}

@Injectable()
export class StorageService {
  readonly driver: StorageDriver;
  constructor(config: AppConfig) {
    this.driver =
      config.get('STORAGE_DRIVER') === 's3'
        ? new S3Driver(config)
        : new LocalDriver(config);
  }
}
